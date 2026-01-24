"""
Celery configuration and task queue for Protocol Assistant.

This module sets up Celery for handling asynchronous tasks such as document
processing, LLM generation, and other long-running operations.
"""

import logging
from typing import Any, Optional

from celery import Celery
from kombu import Exchange, Queue

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# Create Celery application
celery_app = Celery(
    "protocol-assistant",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.services.resilience.tasks"],
)

# Define exchanges
default_exchange = Exchange("protocol_assistant", type="direct")
priority_exchange = Exchange("protocol_assistant_priority", type="direct")

# Define queues with different priorities
celery_app.conf.task_queues = (
    Queue(
        "default",
        exchange=default_exchange,
        routing_key="default",
        queue_arguments={"x-max-priority": 10},
    ),
    Queue(
        "high_priority",
        exchange=priority_exchange,
        routing_key="high",
        queue_arguments={"x-max-priority": 10},
    ),
    Queue(
        "low_priority",
        exchange=default_exchange,
        routing_key="low",
        queue_arguments={"x-max-priority": 10},
    ),
    Queue(
        "document_processing",
        exchange=default_exchange,
        routing_key="documents",
        queue_arguments={"x-max-priority": 10},
    ),
    Queue(
        "llm_generation",
        exchange=default_exchange,
        routing_key="llm",
        queue_arguments={"x-max-priority": 10},
    ),
)

# Task routing
celery_app.conf.task_routes = {
    "app.services.resilience.tasks.process_document_async": {"queue": "document_processing"},
    "app.services.resilience.tasks.generate_document_async": {"queue": "llm_generation"},
    "app.services.resilience.tasks.analyze_protocol_async": {"queue": "llm_generation"},
    "app.services.resilience.tasks.notify_user": {"queue": "high_priority"},
}

# Celery configuration
celery_app.conf.update(
    # Serialization
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Task execution
    task_acks_late=True,  # Acknowledge after task completes
    task_reject_on_worker_lost=True,  # Reject tasks if worker crashes
    worker_prefetch_multiplier=1,  # Only prefetch 1 task at a time

    # Result backend
    result_expires=3600,  # Results expire after 1 hour
    result_extended=True,  # Store additional task metadata

    # Error handling
    task_annotations={
        "*": {
            "rate_limit": "100/m",  # Default rate limit
            "time_limit": 600,  # 10 minute hard limit
            "soft_time_limit": 300,  # 5 minute soft limit
        },
        "app.services.resilience.tasks.process_document_async": {
            "rate_limit": "10/m",
            "time_limit": 1200,
            "soft_time_limit": 900,
        },
        "app.services.resilience.tasks.generate_document_async": {
            "rate_limit": "20/m",
            "time_limit": 900,
            "soft_time_limit": 600,
        },
    },

    # Retry settings
    task_default_retry_delay=5,
    task_max_retries=3,

    # Monitoring
    worker_send_task_events=True,
    task_send_sent_event=True,

    # Beat scheduler (if using periodic tasks)
    beat_scheduler="celery.beat:PersistentScheduler",
    beat_schedule_filename="/tmp/celerybeat-schedule",
)


def get_celery_app() -> Celery:
    """Get the configured Celery application instance."""
    return celery_app


def get_task_status(task_id: str) -> dict[str, Any]:
    """
    Get the status of a Celery task.

    Args:
        task_id: The ID of the task to check

    Returns:
        Dictionary containing task status information
    """
    from celery.result import AsyncResult

    result = AsyncResult(task_id, app=celery_app)

    status_info = {
        "task_id": task_id,
        "status": result.status,
        "ready": result.ready(),
        "successful": result.successful() if result.ready() else None,
    }

    if result.ready():
        if result.successful():
            status_info["result"] = result.result
        else:
            status_info["error"] = str(result.result)
            status_info["traceback"] = result.traceback

    return status_info


def revoke_task(task_id: str, terminate: bool = False) -> bool:
    """
    Revoke a pending or running task.

    Args:
        task_id: The ID of the task to revoke
        terminate: Whether to terminate the task if already running

    Returns:
        True if revocation was successful
    """
    try:
        celery_app.control.revoke(task_id, terminate=terminate)
        logger.info(f"Task {task_id} revoked (terminate={terminate})")
        return True
    except Exception as e:
        logger.error(f"Failed to revoke task {task_id}: {e}")
        return False


def get_queue_length(queue_name: str = "default") -> Optional[int]:
    """
    Get the number of tasks waiting in a queue.

    Args:
        queue_name: Name of the queue to check

    Returns:
        Number of pending tasks, or None if unable to determine
    """
    try:
        with celery_app.connection_or_acquire() as conn:
            return conn.default_channel.queue_declare(
                queue=queue_name, passive=True
            ).message_count
    except Exception as e:
        logger.warning(f"Failed to get queue length for {queue_name}: {e}")
        return None


def purge_queue(queue_name: str = "default") -> int:
    """
    Remove all pending tasks from a queue.

    Args:
        queue_name: Name of the queue to purge

    Returns:
        Number of tasks purged
    """
    try:
        count = celery_app.control.purge(queue=queue_name)
        logger.info(f"Purged {count} tasks from queue {queue_name}")
        return count or 0
    except Exception as e:
        logger.error(f"Failed to purge queue {queue_name}: {e}")
        return 0
