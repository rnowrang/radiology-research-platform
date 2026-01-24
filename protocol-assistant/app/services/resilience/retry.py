"""
Retry logic with exponential backoff for Protocol Assistant.

This module provides configurable retry handlers using the tenacity library,
with support for custom retry conditions, logging, and fallback behavior.
"""

import logging
import random
from functools import wraps
from typing import Any, Callable, Optional, TypeVar, Union

from tenacity import (
    AsyncRetrying,
    RetryCallState,
    RetryError,
    Retrying,
    retry,
    retry_if_exception,
    retry_if_exception_type,
    stop_after_attempt,
    stop_after_delay,
    wait_exponential,
    wait_exponential_jitter,
    wait_random_exponential,
)

from app.services.llm.base import LLMError, RateLimitError
from app.services.resilience.config import ResilienceConfig

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


class RetryHandler:
    """
    Configurable retry handler with exponential backoff and logging.

    Provides decorators and context managers for retrying operations
    with customizable behavior.
    """

    def __init__(self, config: Optional[ResilienceConfig] = None):
        """
        Initialize the retry handler.

        Args:
            config: Resilience configuration settings
        """
        self.config = config or ResilienceConfig()
        self._retry_counts: dict[str, int] = {}

    def _log_retry(self, retry_state: RetryCallState) -> None:
        """Log retry attempts with context."""
        exception = retry_state.outcome.exception() if retry_state.outcome else None
        attempt = retry_state.attempt_number

        logger.warning(
            f"Retry attempt {attempt}/{self.config.max_retries} "
            f"after {retry_state.seconds_since_start:.2f}s - "
            f"Exception: {type(exception).__name__ if exception else 'None'}: "
            f"{str(exception)[:200] if exception else 'N/A'}"
        )

    def _log_final_result(self, retry_state: RetryCallState) -> None:
        """Log the final result after all retry attempts."""
        if retry_state.outcome and retry_state.outcome.failed:
            exception = retry_state.outcome.exception()
            logger.error(
                f"All {retry_state.attempt_number} retry attempts failed. "
                f"Total time: {retry_state.seconds_since_start:.2f}s. "
                f"Final exception: {type(exception).__name__}: {str(exception)[:500]}"
            )
        else:
            logger.debug(
                f"Operation succeeded on attempt {retry_state.attempt_number} "
                f"after {retry_state.seconds_since_start:.2f}s"
            )

    def _should_retry_llm_error(self, exception: BaseException) -> bool:
        """Determine if an LLM error should be retried."""
        if isinstance(exception, RateLimitError):
            return True
        if isinstance(exception, LLMError):
            return exception.retryable
        return False

    def get_retry_decorator(
        self,
        max_retries: Optional[int] = None,
        retry_delay_base: Optional[float] = None,
        retry_delay_max: Optional[float] = None,
        retry_on: Optional[tuple] = None,
    ) -> Callable[[F], F]:
        """
        Get a retry decorator with the configured settings.

        Args:
            max_retries: Override max retries from config
            retry_delay_base: Override base delay from config
            retry_delay_max: Override max delay from config
            retry_on: Tuple of exception types to retry on

        Returns:
            A retry decorator
        """
        max_retries = max_retries or self.config.max_retries
        retry_delay_base = retry_delay_base or self.config.retry_delay_base
        retry_delay_max = retry_delay_max or self.config.retry_delay_max

        if retry_on:
            retry_condition = retry_if_exception_type(retry_on)
        else:
            retry_condition = retry_if_exception(self._should_retry_llm_error)

        if self.config.retry_jitter:
            wait_strategy = wait_exponential_jitter(
                initial=retry_delay_base,
                max=retry_delay_max,
                jitter=retry_delay_base,
            )
        else:
            wait_strategy = wait_exponential(
                multiplier=retry_delay_base,
                max=retry_delay_max,
            )

        return retry(
            stop=stop_after_attempt(max_retries + 1),
            wait=wait_strategy,
            retry=retry_condition,
            before_sleep=self._log_retry,
            after=self._log_final_result,
            reraise=True,
        )

    def get_async_retrying(
        self,
        max_retries: Optional[int] = None,
        retry_delay_base: Optional[float] = None,
        retry_delay_max: Optional[float] = None,
    ) -> AsyncRetrying:
        """
        Get an async retrying context manager.

        Args:
            max_retries: Override max retries from config
            retry_delay_base: Override base delay from config
            retry_delay_max: Override max delay from config

        Returns:
            AsyncRetrying context manager
        """
        max_retries = max_retries or self.config.max_retries
        retry_delay_base = retry_delay_base or self.config.retry_delay_base
        retry_delay_max = retry_delay_max or self.config.retry_delay_max

        if self.config.retry_jitter:
            wait_strategy = wait_exponential_jitter(
                initial=retry_delay_base,
                max=retry_delay_max,
            )
        else:
            wait_strategy = wait_exponential(
                multiplier=retry_delay_base,
                max=retry_delay_max,
            )

        return AsyncRetrying(
            stop=stop_after_attempt(max_retries + 1),
            wait=wait_strategy,
            retry=retry_if_exception(self._should_retry_llm_error),
            before_sleep=self._log_retry,
            after=self._log_final_result,
            reraise=True,
        )

    def get_sync_retrying(
        self,
        max_retries: Optional[int] = None,
        retry_delay_base: Optional[float] = None,
        retry_delay_max: Optional[float] = None,
    ) -> Retrying:
        """
        Get a sync retrying context manager.

        Args:
            max_retries: Override max retries from config
            retry_delay_base: Override base delay from config
            retry_delay_max: Override max delay from config

        Returns:
            Retrying context manager
        """
        max_retries = max_retries or self.config.max_retries
        retry_delay_base = retry_delay_base or self.config.retry_delay_base
        retry_delay_max = retry_delay_max or self.config.retry_delay_max

        wait_strategy = wait_exponential(
            multiplier=retry_delay_base,
            max=retry_delay_max,
        )

        return Retrying(
            stop=stop_after_attempt(max_retries + 1),
            wait=wait_strategy,
            retry=retry_if_exception(self._should_retry_llm_error),
            before_sleep=self._log_retry,
            after=self._log_final_result,
            reraise=True,
        )

    async def execute_with_retry(
        self,
        func: Callable[..., Any],
        *args: Any,
        max_retries: Optional[int] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Execute an async function with retry logic.

        Args:
            func: Async function to execute
            *args: Positional arguments for the function
            max_retries: Override max retries from config
            **kwargs: Keyword arguments for the function

        Returns:
            The result of the function

        Raises:
            Exception: If all retries are exhausted
        """
        retrying = self.get_async_retrying(max_retries=max_retries)

        async for attempt in retrying:
            with attempt:
                return await func(*args, **kwargs)

    def execute_sync_with_retry(
        self,
        func: Callable[..., Any],
        *args: Any,
        max_retries: Optional[int] = None,
        **kwargs: Any,
    ) -> Any:
        """
        Execute a sync function with retry logic.

        Args:
            func: Sync function to execute
            *args: Positional arguments for the function
            max_retries: Override max retries from config
            **kwargs: Keyword arguments for the function

        Returns:
            The result of the function

        Raises:
            Exception: If all retries are exhausted
        """
        retrying = self.get_sync_retrying(max_retries=max_retries)

        for attempt in retrying:
            with attempt:
                return func(*args, **kwargs)


def with_retry(
    max_retries: int = 3,
    retry_delay_base: float = 1.0,
    retry_delay_max: float = 60.0,
    retry_on: Optional[tuple] = None,
) -> Callable[[F], F]:
    """
    Decorator factory for adding retry logic to functions.

    Args:
        max_retries: Maximum number of retry attempts
        retry_delay_base: Base delay for exponential backoff
        retry_delay_max: Maximum delay between retries
        retry_on: Tuple of exception types to retry on

    Returns:
        A decorator that adds retry logic
    """
    handler = RetryHandler(
        ResilienceConfig(
            max_retries=max_retries,
            retry_delay_base=retry_delay_base,
            retry_delay_max=retry_delay_max,
        )
    )
    return handler.get_retry_decorator(retry_on=retry_on)


def calculate_backoff_delay(
    attempt: int,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: bool = True,
) -> float:
    """
    Calculate exponential backoff delay with optional jitter.

    Args:
        attempt: Current attempt number (1-based)
        base_delay: Base delay in seconds
        max_delay: Maximum delay in seconds
        jitter: Whether to add random jitter

    Returns:
        Delay in seconds
    """
    delay = min(base_delay * (2 ** (attempt - 1)), max_delay)

    if jitter:
        # Add random jitter of +/- 25%
        jitter_range = delay * 0.25
        delay = delay + random.uniform(-jitter_range, jitter_range)

    return max(0.1, delay)  # Ensure minimum delay


# Singleton instance for convenience
_default_handler: Optional[RetryHandler] = None


def get_retry_handler() -> RetryHandler:
    """Get the default retry handler instance."""
    global _default_handler
    if _default_handler is None:
        _default_handler = RetryHandler()
    return _default_handler
