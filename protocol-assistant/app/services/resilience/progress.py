"""
Progress tracking for long-running tasks in Protocol Assistant.

This module provides Redis-backed progress tracking for async tasks,
enabling real-time progress updates and status monitoring.
"""

import json
import logging
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

import redis
from pydantic import BaseModel, Field

from app.config import get_settings

logger = logging.getLogger(__name__)


class TaskStatus(str, Enum):
    """Status of a tracked task."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProgressInfo(BaseModel):
    """Progress information for a task."""

    task_id: str
    percent: int = Field(ge=-1, le=100, description="Progress percentage (-1 for error)")
    message: str = ""
    status: TaskStatus = TaskStatus.PENDING
    started_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None
    failed_at: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ProgressTracker:
    """
    Redis-backed progress tracker for long-running tasks.

    Provides methods to update, retrieve, and monitor task progress
    with automatic expiration of stale entries.
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        key_prefix: str = "progress",
        ttl: int = 3600,
    ):
        """
        Initialize the progress tracker.

        Args:
            redis_url: Redis connection URL (uses settings if not provided)
            key_prefix: Prefix for Redis keys
            ttl: Time-to-live for progress entries in seconds
        """
        settings = get_settings()
        self.redis_url = redis_url or settings.REDIS_URL
        self.key_prefix = key_prefix
        self.ttl = ttl
        self._redis: Optional[redis.Redis] = None

    @property
    def redis(self) -> redis.Redis:
        """Get or create Redis connection."""
        if self._redis is None:
            self._redis = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
            )
        return self._redis

    def _get_key(self, task_id: str) -> str:
        """Generate Redis key for a task."""
        return f"{self.key_prefix}:{task_id}"

    def start(
        self,
        task_id: str,
        message: str = "Starting...",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ProgressInfo:
        """
        Mark a task as started.

        Args:
            task_id: Unique task identifier
            message: Initial progress message
            metadata: Optional metadata to store with the task

        Returns:
            ProgressInfo object
        """
        now = datetime.utcnow().isoformat()
        progress = ProgressInfo(
            task_id=task_id,
            percent=0,
            message=message,
            status=TaskStatus.IN_PROGRESS,
            started_at=now,
            updated_at=now,
            metadata=metadata or {},
        )

        self._save(task_id, progress)
        logger.debug(f"Task {task_id} started")
        return progress

    def update(
        self,
        task_id: str,
        percent: int,
        message: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ProgressInfo:
        """
        Update task progress.

        Args:
            task_id: Unique task identifier
            percent: Progress percentage (0-100, or -1 for error state)
            message: Progress message
            metadata: Optional metadata to merge

        Returns:
            Updated ProgressInfo object
        """
        existing = self.get(task_id)

        progress = ProgressInfo(
            task_id=task_id,
            percent=percent,
            message=message,
            status=TaskStatus.FAILED if percent == -1 else TaskStatus.IN_PROGRESS,
            started_at=existing.started_at,
            updated_at=datetime.utcnow().isoformat(),
            metadata={**existing.metadata, **(metadata or {})},
        )

        self._save(task_id, progress)
        logger.debug(f"Task {task_id} progress: {percent}% - {message}")
        return progress

    def complete(
        self,
        task_id: str,
        result: Optional[Dict[str, Any]] = None,
        message: str = "Complete",
    ) -> ProgressInfo:
        """
        Mark a task as completed.

        Args:
            task_id: Unique task identifier
            result: Optional result data
            message: Completion message

        Returns:
            Updated ProgressInfo object
        """
        existing = self.get(task_id)
        now = datetime.utcnow().isoformat()

        progress = ProgressInfo(
            task_id=task_id,
            percent=100,
            message=message,
            status=TaskStatus.COMPLETED,
            started_at=existing.started_at,
            updated_at=now,
            completed_at=now,
            result=result,
            metadata=existing.metadata,
        )

        self._save(task_id, progress)
        logger.info(f"Task {task_id} completed")
        return progress

    def fail(
        self,
        task_id: str,
        error: str,
        message: Optional[str] = None,
    ) -> ProgressInfo:
        """
        Mark a task as failed.

        Args:
            task_id: Unique task identifier
            error: Error description
            message: Optional failure message (uses error if not provided)

        Returns:
            Updated ProgressInfo object
        """
        existing = self.get(task_id)
        now = datetime.utcnow().isoformat()

        progress = ProgressInfo(
            task_id=task_id,
            percent=-1,
            message=message or f"Failed: {error}",
            status=TaskStatus.FAILED,
            started_at=existing.started_at,
            updated_at=now,
            failed_at=now,
            error=error,
            metadata=existing.metadata,
        )

        self._save(task_id, progress)
        logger.error(f"Task {task_id} failed: {error}")
        return progress

    def cancel(self, task_id: str, reason: str = "Cancelled by user") -> ProgressInfo:
        """
        Mark a task as cancelled.

        Args:
            task_id: Unique task identifier
            reason: Cancellation reason

        Returns:
            Updated ProgressInfo object
        """
        existing = self.get(task_id)
        now = datetime.utcnow().isoformat()

        progress = ProgressInfo(
            task_id=task_id,
            percent=existing.percent,
            message=reason,
            status=TaskStatus.CANCELLED,
            started_at=existing.started_at,
            updated_at=now,
            metadata=existing.metadata,
        )

        self._save(task_id, progress)
        logger.info(f"Task {task_id} cancelled: {reason}")
        return progress

    def get(self, task_id: str) -> ProgressInfo:
        """
        Get progress information for a task.

        Args:
            task_id: Unique task identifier

        Returns:
            ProgressInfo object (default values if not found)
        """
        try:
            key = self._get_key(task_id)
            data = self.redis.get(key)

            if data:
                parsed = json.loads(data)
                return ProgressInfo(**parsed)

            return ProgressInfo(
                task_id=task_id,
                percent=0,
                message="Starting...",
                status=TaskStatus.PENDING,
            )

        except redis.RedisError as e:
            logger.error(f"Redis error getting progress for {task_id}: {e}")
            return ProgressInfo(
                task_id=task_id,
                percent=0,
                message="Unable to retrieve progress",
                status=TaskStatus.PENDING,
            )
        except Exception as e:
            logger.error(f"Error getting progress for {task_id}: {e}")
            return ProgressInfo(
                task_id=task_id,
                percent=0,
                message="Error",
                status=TaskStatus.PENDING,
            )

    def delete(self, task_id: str) -> bool:
        """
        Delete progress information for a task.

        Args:
            task_id: Unique task identifier

        Returns:
            True if deleted, False otherwise
        """
        try:
            key = self._get_key(task_id)
            result = self.redis.delete(key)
            return result > 0
        except redis.RedisError as e:
            logger.error(f"Redis error deleting progress for {task_id}: {e}")
            return False

    def exists(self, task_id: str) -> bool:
        """
        Check if progress information exists for a task.

        Args:
            task_id: Unique task identifier

        Returns:
            True if exists, False otherwise
        """
        try:
            key = self._get_key(task_id)
            return self.redis.exists(key) > 0
        except redis.RedisError:
            return False

    def get_active_tasks(self, limit: int = 100) -> list[ProgressInfo]:
        """
        Get all active (in-progress) tasks.

        Args:
            limit: Maximum number of tasks to return

        Returns:
            List of ProgressInfo objects for active tasks
        """
        try:
            pattern = f"{self.key_prefix}:*"
            keys = list(self.redis.scan_iter(match=pattern, count=limit))

            active = []
            for key in keys[:limit]:
                data = self.redis.get(key)
                if data:
                    progress = ProgressInfo(**json.loads(data))
                    if progress.status == TaskStatus.IN_PROGRESS:
                        active.append(progress)

            return active

        except redis.RedisError as e:
            logger.error(f"Redis error getting active tasks: {e}")
            return []

    def _save(self, task_id: str, progress: ProgressInfo) -> None:
        """Save progress information to Redis."""
        try:
            key = self._get_key(task_id)
            data = progress.model_dump_json()
            self.redis.setex(key, self.ttl, data)
        except redis.RedisError as e:
            logger.error(f"Redis error saving progress for {task_id}: {e}")


# Global tracker instance
_tracker: Optional[ProgressTracker] = None


def get_progress_tracker() -> ProgressTracker:
    """Get the global progress tracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = ProgressTracker()
    return _tracker
