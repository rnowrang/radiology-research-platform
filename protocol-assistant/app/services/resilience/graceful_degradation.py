"""
Graceful degradation handlers for Protocol Assistant.

This module provides strategies for handling service failures gracefully,
including fallback behaviors, cached responses, and user notifications.
"""

import logging
from enum import Enum
from typing import Any, Callable, Dict, Optional, TypeVar

from app.services.resilience.config import FallbackBehavior, ResilienceConfig
from app.services.resilience.notifications import NotificationService, get_notification_service
from app.services.resilience.circuit_breaker import CircuitBreakerOpen

logger = logging.getLogger(__name__)

T = TypeVar("T")


class DegradationStrategy(str, Enum):
    """Strategies for handling degraded service conditions."""

    RETRY_THEN_FAIL = "retry_then_fail"
    IMMEDIATE_FALLBACK = "immediate_fallback"
    NOTIFY_ONLY = "notify_only"
    CACHED_RESPONSE = "cached_response"
    QUEUE_FOR_LATER = "queue_for_later"


class FallbackRequired(Exception):
    """
    Exception indicating that a fallback action is required.

    Raised when the primary action fails and a fallback should be triggered.
    """

    def __init__(
        self,
        task: str,
        original_error: Exception,
        fallback_data: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize the exception.

        Args:
            task: The task that failed
            original_error: The original exception
            fallback_data: Optional data for the fallback handler
        """
        self.task = task
        self.original_error = original_error
        self.fallback_data = fallback_data or {}
        super().__init__(f"Fallback required for {task}: {original_error}")


class DegradedServiceResponse:
    """
    Response container for degraded service scenarios.

    Used to wrap responses when full service is unavailable but
    a partial or cached response can be provided.
    """

    def __init__(
        self,
        success: bool,
        data: Optional[Dict[str, Any]] = None,
        message: str = "",
        is_cached: bool = False,
        is_partial: bool = False,
        retry_after: Optional[int] = None,
    ):
        """
        Initialize the response.

        Args:
            success: Whether the operation was successful
            data: Response data
            message: Human-readable message
            is_cached: Whether the response is from cache
            is_partial: Whether the response is partial
            retry_after: Suggested retry time in seconds
        """
        self.success = success
        self.data = data or {}
        self.message = message
        self.is_cached = is_cached
        self.is_partial = is_partial
        self.retry_after = retry_after

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "success": self.success,
            "data": self.data,
            "message": self.message,
            "is_cached": self.is_cached,
            "is_partial": self.is_partial,
            "retry_after": self.retry_after,
        }


class GracefulDegradation:
    """
    Handler for graceful degradation of service functionality.

    Provides methods to handle failures gracefully, including fallback
    to cached responses, user notifications, and queuing for later processing.
    """

    def __init__(
        self,
        config: Optional[ResilienceConfig] = None,
        notification_service: Optional[NotificationService] = None,
        cache_backend: Optional[Any] = None,
    ):
        """
        Initialize the graceful degradation handler.

        Args:
            config: Resilience configuration
            notification_service: Service for sending user notifications
            cache_backend: Optional cache backend for cached responses
        """
        self.config = config or ResilienceConfig()
        self.notification_service = notification_service or get_notification_service()
        self.cache_backend = cache_backend
        self._fallback_handlers: Dict[str, Callable] = {}

    def register_fallback(
        self,
        task: str,
        handler: Callable[..., Any],
    ) -> None:
        """
        Register a fallback handler for a specific task.

        Args:
            task: Task identifier
            handler: Fallback function to call
        """
        self._fallback_handlers[task] = handler
        logger.debug(f"Registered fallback handler for task: {task}")

    async def handle_failure(
        self,
        user_id: str,
        session_id: str,
        task: str,
        error: Exception,
        strategy: Optional[DegradationStrategy] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> DegradedServiceResponse:
        """
        Handle a service failure with graceful degradation.

        Args:
            user_id: ID of the affected user
            session_id: Current session ID
            task: Task that failed
            error: The exception that occurred
            strategy: Override degradation strategy
            context: Additional context for handling

        Returns:
            DegradedServiceResponse with appropriate fallback data

        Raises:
            FallbackRequired: If immediate_fallback strategy and no handler
            Exception: Original error if retry_then_fail with no fallback
        """
        strategy = strategy or DegradationStrategy(self.config.fallback_behavior.value)
        context = context or {}

        logger.warning(
            f"Handling failure for task '{task}' with strategy '{strategy.value}': {error}"
        )

        # Extract retry information if available
        retry_after = None
        if isinstance(error, CircuitBreakerOpen):
            retry_after = int(error.time_until_retry) if error.time_until_retry else 60

        if strategy == DegradationStrategy.NOTIFY_ONLY:
            return await self._handle_notify_only(
                user_id, session_id, task, error, retry_after
            )

        elif strategy == DegradationStrategy.IMMEDIATE_FALLBACK:
            return await self._handle_immediate_fallback(
                user_id, session_id, task, error, context
            )

        elif strategy == DegradationStrategy.CACHED_RESPONSE:
            return await self._handle_cached_response(
                user_id, session_id, task, error, context
            )

        elif strategy == DegradationStrategy.QUEUE_FOR_LATER:
            return await self._handle_queue_for_later(
                user_id, session_id, task, error, context
            )

        else:  # RETRY_THEN_FAIL
            return await self._handle_retry_then_fail(
                user_id, session_id, task, error, retry_after
            )

    async def _handle_notify_only(
        self,
        user_id: str,
        session_id: str,
        task: str,
        error: Exception,
        retry_after: Optional[int],
    ) -> DegradedServiceResponse:
        """Handle failure by notifying user to retry later."""
        if self.config.enable_notifications:
            await self.notification_service.notify_service_unavailable(
                user_id=user_id,
                session_id=session_id,
                task=task,
                retry_after=retry_after,
            )

        return DegradedServiceResponse(
            success=False,
            message="Service temporarily unavailable. Please try again later.",
            retry_after=retry_after or 60,
        )

    async def _handle_immediate_fallback(
        self,
        user_id: str,
        session_id: str,
        task: str,
        error: Exception,
        context: Dict[str, Any],
    ) -> DegradedServiceResponse:
        """Handle failure by immediately executing fallback."""
        if task in self._fallback_handlers:
            try:
                result = await self._execute_fallback(task, context)
                return DegradedServiceResponse(
                    success=True,
                    data=result,
                    message="Using fallback response",
                    is_partial=True,
                )
            except Exception as fallback_error:
                logger.error(f"Fallback handler failed: {fallback_error}")

        raise FallbackRequired(task=task, original_error=error, fallback_data=context)

    async def _handle_cached_response(
        self,
        user_id: str,
        session_id: str,
        task: str,
        error: Exception,
        context: Dict[str, Any],
    ) -> DegradedServiceResponse:
        """Handle failure by returning cached response if available."""
        cached = await self._get_cached_response(session_id, task)

        if cached:
            if self.config.enable_notifications:
                await self.notification_service.send_notification(
                    user_id=user_id,
                    type="ai_using_cached",
                    title="Using Cached Response",
                    message="Using a previously generated response while the service recovers.",
                    data={"session_id": session_id, "task": task},
                )

            return DegradedServiceResponse(
                success=True,
                data=cached,
                message="Using cached response",
                is_cached=True,
            )

        # No cache available, fall back to notify
        return await self._handle_notify_only(user_id, session_id, task, error, None)

    async def _handle_queue_for_later(
        self,
        user_id: str,
        session_id: str,
        task: str,
        error: Exception,
        context: Dict[str, Any],
    ) -> DegradedServiceResponse:
        """Handle failure by queuing task for later processing."""
        from app.services.resilience.tasks import notify_user

        # Queue a notification for when the task is eventually processed
        try:
            # Queue the notification (the actual task requeueing would be
            # handled by Celery's built-in retry mechanism)
            notify_user.apply_async(
                kwargs={
                    "user_id": user_id,
                    "notification_type": "ai_task_queued",
                    "title": f"{task} Queued",
                    "message": "Your request has been queued and will be processed shortly.",
                    "data": {"session_id": session_id, "task": task},
                },
                countdown=5,  # Small delay to ensure order
            )
        except Exception as e:
            logger.error(f"Failed to queue notification: {e}")

        return DegradedServiceResponse(
            success=True,
            message="Your request has been queued for processing.",
            data={"queued": True, "task": task},
        )

    async def _handle_retry_then_fail(
        self,
        user_id: str,
        session_id: str,
        task: str,
        error: Exception,
        retry_after: Optional[int],
    ) -> DegradedServiceResponse:
        """Handle failure after all retries exhausted."""
        if self.config.enable_notifications:
            await self.notification_service.notify_task_failed(
                user_id=user_id,
                task_type=task,
                error=str(error),
                can_retry=True,
            )

        return DegradedServiceResponse(
            success=False,
            message=f"Failed to complete {task}. Please try again.",
            data={"error": str(error)},
            retry_after=retry_after or 30,
        )

    async def _execute_fallback(
        self,
        task: str,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Execute the registered fallback handler for a task."""
        handler = self._fallback_handlers[task]

        # Check if handler is async
        import asyncio
        if asyncio.iscoroutinefunction(handler):
            return await handler(context)
        else:
            return handler(context)

    async def _get_cached_response(
        self,
        session_id: str,
        task: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a cached response for a task if available."""
        if self.cache_backend is None:
            return None

        try:
            cache_key = f"response:{session_id}:{task}"

            # Support both sync and async cache backends
            import asyncio
            if hasattr(self.cache_backend, "get"):
                if asyncio.iscoroutinefunction(self.cache_backend.get):
                    return await self.cache_backend.get(cache_key)
                else:
                    return self.cache_backend.get(cache_key)

            return None
        except Exception as e:
            logger.warning(f"Failed to get cached response: {e}")
            return None

    async def cache_response(
        self,
        session_id: str,
        task: str,
        response: Dict[str, Any],
        ttl: int = 3600,
    ) -> bool:
        """
        Cache a response for potential future fallback.

        Args:
            session_id: Session identifier
            task: Task identifier
            response: Response to cache
            ttl: Time-to-live in seconds

        Returns:
            True if cached successfully
        """
        if self.cache_backend is None:
            return False

        try:
            cache_key = f"response:{session_id}:{task}"

            import asyncio
            if hasattr(self.cache_backend, "set"):
                if asyncio.iscoroutinefunction(self.cache_backend.set):
                    await self.cache_backend.set(cache_key, response, ttl)
                else:
                    self.cache_backend.set(cache_key, response, ttl)
                return True

            return False
        except Exception as e:
            logger.warning(f"Failed to cache response: {e}")
            return False

    def with_degradation(
        self,
        task: str,
        strategy: Optional[DegradationStrategy] = None,
    ) -> Callable:
        """
        Decorator for wrapping async functions with graceful degradation.

        Args:
            task: Task identifier
            strategy: Override degradation strategy

        Returns:
            Decorator function
        """
        def decorator(func: Callable) -> Callable:
            import functools

            @functools.wraps(func)
            async def wrapper(*args, **kwargs):
                # Extract user context from kwargs or args
                user_id = kwargs.get("user_id", "unknown")
                session_id = kwargs.get("session_id", "unknown")

                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    logger.warning(f"Function {func.__name__} failed: {e}")
                    return await self.handle_failure(
                        user_id=user_id,
                        session_id=session_id,
                        task=task,
                        error=e,
                        strategy=strategy,
                        context=kwargs,
                    )

            return wrapper
        return decorator


# Global graceful degradation instance
_graceful_degradation: Optional[GracefulDegradation] = None


def get_graceful_degradation() -> GracefulDegradation:
    """Get the global graceful degradation handler."""
    global _graceful_degradation
    if _graceful_degradation is None:
        _graceful_degradation = GracefulDegradation()
    return _graceful_degradation
