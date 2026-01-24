"""
User notification service for Protocol Assistant.

This module provides a service for sending notifications to users
about task status, errors, and other important events.
"""

import logging
from enum import Enum
from typing import Any, Dict, Optional

import httpx
from pydantic import BaseModel, Field

from app.config import get_settings

logger = logging.getLogger(__name__)


class NotificationType(str, Enum):
    """Types of notifications that can be sent."""

    # Task notifications
    AI_TASK_COMPLETE = "ai_task_complete"
    AI_TASK_FAILED = "ai_task_failed"
    AI_TASK_PROGRESS = "ai_task_progress"

    # Service notifications
    AI_ASSISTANT_UNAVAILABLE = "ai_assistant_unavailable"
    AI_ASSISTANT_RESTORED = "ai_assistant_restored"

    # Document notifications
    DOCUMENT_READY = "document_ready"
    DOCUMENT_PROCESSING = "document_processing"

    # System notifications
    SYSTEM_MAINTENANCE = "system_maintenance"
    RATE_LIMIT_WARNING = "rate_limit_warning"


class NotificationPriority(str, Enum):
    """Priority levels for notifications."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class NotificationPayload(BaseModel):
    """Payload for a notification."""

    user_id: str
    type: str
    title: str
    message: str
    data: Dict[str, Any] = Field(default_factory=dict)
    priority: NotificationPriority = NotificationPriority.NORMAL
    persist: bool = True  # Whether to persist in notification history


class NotificationService:
    """
    Service for sending notifications to users.

    Sends notifications through the gateway service which handles
    WebSocket delivery and persistence.
    """

    def __init__(
        self,
        gateway_url: Optional[str] = None,
        internal_api_key: Optional[str] = None,
        timeout: float = 10.0,
    ):
        """
        Initialize the notification service.

        Args:
            gateway_url: URL of the gateway service
            internal_api_key: API key for internal service communication
            timeout: HTTP request timeout in seconds
        """
        settings = get_settings()
        self.gateway_url = gateway_url or settings.GATEWAY_URL
        self.internal_api_key = internal_api_key or settings.INTERNAL_API_KEY
        self.timeout = timeout

    async def send_notification(
        self,
        user_id: str,
        type: str,
        title: str,
        message: str,
        data: Optional[Dict[str, Any]] = None,
        priority: NotificationPriority = NotificationPriority.NORMAL,
        persist: bool = True,
    ) -> bool:
        """
        Send a notification to a user via the gateway.

        Args:
            user_id: ID of the user to notify
            type: Notification type
            title: Notification title
            message: Notification message
            data: Additional data payload
            priority: Notification priority
            persist: Whether to persist the notification

        Returns:
            True if notification was sent successfully
        """
        payload = NotificationPayload(
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            data=data or {},
            priority=priority,
            persist=persist,
        )

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.gateway_url}/api/notifications/internal",
                    json=payload.model_dump(),
                    headers={
                        "X-Internal-API-Key": self.internal_api_key,
                        "Content-Type": "application/json",
                    },
                )

                if response.status_code in (200, 201, 202):
                    logger.debug(f"Notification sent to user {user_id}: {type}")
                    return True
                else:
                    logger.warning(
                        f"Failed to send notification: {response.status_code} - {response.text}"
                    )
                    return False

        except httpx.TimeoutException:
            logger.warning(f"Timeout sending notification to user {user_id}")
            return False
        except httpx.RequestError as e:
            logger.error(f"Request error sending notification: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error sending notification: {e}")
            return False

    async def notify_task_complete(
        self,
        user_id: str,
        task_type: str,
        result: Dict[str, Any],
    ) -> bool:
        """
        Send a task completion notification.

        Args:
            user_id: ID of the user to notify
            task_type: Type of completed task (e.g., "Document Generation")
            result: Task result data

        Returns:
            True if notification was sent successfully
        """
        return await self.send_notification(
            user_id=user_id,
            type=NotificationType.AI_TASK_COMPLETE.value,
            title=f"{task_type} Complete",
            message=f"Your {task_type.lower()} has been generated successfully.",
            data={
                "task_type": task_type,
                "result": result,
                "action": "view_result",
            },
            priority=NotificationPriority.NORMAL,
        )

    async def notify_task_failed(
        self,
        user_id: str,
        task_type: str,
        error: str,
        can_retry: bool = True,
    ) -> bool:
        """
        Send a task failure notification.

        Args:
            user_id: ID of the user to notify
            task_type: Type of failed task
            error: Error message
            can_retry: Whether the task can be retried

        Returns:
            True if notification was sent successfully
        """
        message = f"Your {task_type.lower()} could not be completed."
        if can_retry:
            message += " Please try again."

        return await self.send_notification(
            user_id=user_id,
            type=NotificationType.AI_TASK_FAILED.value,
            title=f"{task_type} Failed",
            message=message,
            data={
                "task_type": task_type,
                "error": error,
                "can_retry": can_retry,
                "action": "retry" if can_retry else "contact_support",
            },
            priority=NotificationPriority.HIGH,
        )

    async def notify_task_progress(
        self,
        user_id: str,
        task_id: str,
        task_type: str,
        percent: int,
        message: str,
    ) -> bool:
        """
        Send a task progress notification.

        Args:
            user_id: ID of the user to notify
            task_id: ID of the task
            task_type: Type of task
            percent: Progress percentage
            message: Progress message

        Returns:
            True if notification was sent successfully
        """
        return await self.send_notification(
            user_id=user_id,
            type=NotificationType.AI_TASK_PROGRESS.value,
            title=f"{task_type} in Progress",
            message=message,
            data={
                "task_id": task_id,
                "task_type": task_type,
                "percent": percent,
            },
            priority=NotificationPriority.LOW,
            persist=False,  # Don't persist progress notifications
        )

    async def notify_service_unavailable(
        self,
        user_id: str,
        session_id: str,
        task: str,
        retry_after: Optional[int] = None,
    ) -> bool:
        """
        Notify user that the AI service is temporarily unavailable.

        Args:
            user_id: ID of the user to notify
            session_id: Current session ID
            task: Task that couldn't be completed
            retry_after: Suggested retry time in seconds

        Returns:
            True if notification was sent successfully
        """
        message = "The AI assistant is temporarily unavailable. "
        if retry_after:
            message += f"Please try again in {retry_after} seconds."
        else:
            message += "Please try again in a few minutes."

        return await self.send_notification(
            user_id=user_id,
            type=NotificationType.AI_ASSISTANT_UNAVAILABLE.value,
            title="AI Assistant Temporarily Unavailable",
            message=message,
            data={
                "session_id": session_id,
                "task": task,
                "can_retry": True,
                "retry_after": retry_after,
            },
            priority=NotificationPriority.HIGH,
        )

    async def notify_service_restored(
        self,
        user_id: str,
        session_id: Optional[str] = None,
    ) -> bool:
        """
        Notify user that the AI service has been restored.

        Args:
            user_id: ID of the user to notify
            session_id: Optional session ID

        Returns:
            True if notification was sent successfully
        """
        return await self.send_notification(
            user_id=user_id,
            type=NotificationType.AI_ASSISTANT_RESTORED.value,
            title="AI Assistant Available",
            message="The AI assistant is now available. You can continue your work.",
            data={
                "session_id": session_id,
            },
            priority=NotificationPriority.NORMAL,
        )

    async def notify_document_ready(
        self,
        user_id: str,
        document_type: str,
        document_id: str,
        download_url: Optional[str] = None,
    ) -> bool:
        """
        Notify user that a document is ready for download.

        Args:
            user_id: ID of the user to notify
            document_type: Type of document
            document_id: Document ID
            download_url: Optional direct download URL

        Returns:
            True if notification was sent successfully
        """
        return await self.send_notification(
            user_id=user_id,
            type=NotificationType.DOCUMENT_READY.value,
            title=f"{document_type} Ready",
            message=f"Your {document_type.lower()} is ready for download.",
            data={
                "document_type": document_type,
                "document_id": document_id,
                "download_url": download_url,
                "action": "download",
            },
            priority=NotificationPriority.NORMAL,
        )

    async def notify_rate_limit_warning(
        self,
        user_id: str,
        current_usage: int,
        limit: int,
        reset_time: Optional[str] = None,
    ) -> bool:
        """
        Warn user about approaching rate limits.

        Args:
            user_id: ID of the user to notify
            current_usage: Current usage count
            limit: Usage limit
            reset_time: When the limit resets

        Returns:
            True if notification was sent successfully
        """
        percent_used = (current_usage / limit) * 100

        return await self.send_notification(
            user_id=user_id,
            type=NotificationType.RATE_LIMIT_WARNING.value,
            title="Usage Limit Warning",
            message=f"You've used {percent_used:.0f}% of your AI request limit.",
            data={
                "current_usage": current_usage,
                "limit": limit,
                "percent_used": percent_used,
                "reset_time": reset_time,
            },
            priority=NotificationPriority.NORMAL,
        )


# Global notification service instance
_notification_service: Optional[NotificationService] = None


def get_notification_service() -> NotificationService:
    """Get the global notification service instance."""
    global _notification_service
    if _notification_service is None:
        _notification_service = NotificationService()
    return _notification_service
