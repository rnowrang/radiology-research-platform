"""
Progress tracking API endpoints for Protocol Assistant.

This module provides REST and SSE endpoints for monitoring the progress
of long-running tasks such as document processing and generation.
"""

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.resilience.progress import (
    ProgressInfo,
    ProgressTracker,
    TaskStatus,
    get_progress_tracker,
)
from app.services.resilience.queue import get_task_status, revoke_task

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/progress", tags=["progress"])


class TaskStatusResponse(BaseModel):
    """Response model for task status."""

    task_id: str
    status: str
    percent: int
    message: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    failed_at: Optional[str] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    celery_status: Optional[str] = None


class CancelTaskRequest(BaseModel):
    """Request model for cancelling a task."""

    terminate: bool = False


class CancelTaskResponse(BaseModel):
    """Response model for cancel operation."""

    task_id: str
    cancelled: bool
    message: str


@router.get("/{task_id}", response_model=TaskStatusResponse)
async def get_progress(task_id: str) -> TaskStatusResponse:
    """
    Get current progress of a task.

    Args:
        task_id: Unique task identifier

    Returns:
        Current progress information
    """
    tracker = get_progress_tracker()
    progress = tracker.get(task_id)

    # Also get Celery task status for additional info
    celery_status = None
    try:
        celery_info = get_task_status(task_id)
        celery_status = celery_info.get("status")
    except Exception as e:
        logger.debug(f"Could not get Celery status for {task_id}: {e}")

    return TaskStatusResponse(
        task_id=progress.task_id,
        status=progress.status.value,
        percent=progress.percent,
        message=progress.message,
        started_at=progress.started_at,
        completed_at=progress.completed_at,
        failed_at=progress.failed_at,
        result=progress.result,
        error=progress.error,
        celery_status=celery_status,
    )


@router.get("/{task_id}/stream")
async def stream_progress(
    task_id: str,
    interval: float = Query(default=0.5, ge=0.1, le=5.0),
    timeout: int = Query(default=300, ge=10, le=600),
) -> StreamingResponse:
    """
    Stream progress updates via Server-Sent Events (SSE).

    This endpoint provides real-time progress updates using the SSE protocol.
    The connection will automatically close when the task completes or fails,
    or when the timeout is reached.

    Args:
        task_id: Unique task identifier
        interval: Polling interval in seconds (default 0.5)
        timeout: Maximum connection duration in seconds (default 300)

    Returns:
        SSE stream of progress updates
    """
    tracker = get_progress_tracker()

    async def event_generator():
        """Generate SSE events for progress updates."""
        last_data = None
        elapsed = 0
        max_elapsed = timeout

        while elapsed < max_elapsed:
            try:
                progress = tracker.get(task_id)
                current_data = progress.model_dump_json()

                # Only send if data changed
                if current_data != last_data:
                    last_data = current_data
                    yield f"data: {current_data}\n\n"

                # Check for terminal states
                if progress.status in (
                    TaskStatus.COMPLETED,
                    TaskStatus.FAILED,
                    TaskStatus.CANCELLED,
                ):
                    # Send final event
                    yield f"event: complete\ndata: {current_data}\n\n"
                    break

                await asyncio.sleep(interval)
                elapsed += interval

            except asyncio.CancelledError:
                logger.debug(f"SSE stream cancelled for task {task_id}")
                break
            except Exception as e:
                logger.error(f"Error in SSE stream for {task_id}: {e}")
                error_data = json.dumps({"error": str(e)})
                yield f"event: error\ndata: {error_data}\n\n"
                break

        # Send timeout event if we hit the limit
        if elapsed >= max_elapsed:
            yield f"event: timeout\ndata: {json.dumps({'message': 'Stream timeout'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.post("/{task_id}/cancel", response_model=CancelTaskResponse)
async def cancel_task(
    task_id: str,
    request: CancelTaskRequest = CancelTaskRequest(),
) -> CancelTaskResponse:
    """
    Cancel a running or pending task.

    Args:
        task_id: Unique task identifier
        request: Cancel options

    Returns:
        Cancellation result
    """
    tracker = get_progress_tracker()
    progress = tracker.get(task_id)

    # Check if task can be cancelled
    if progress.status == TaskStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel a completed task",
        )

    if progress.status == TaskStatus.CANCELLED:
        raise HTTPException(
            status_code=400,
            detail="Task is already cancelled",
        )

    # Revoke the Celery task
    success = revoke_task(task_id, terminate=request.terminate)

    if success:
        # Update progress tracker
        tracker.cancel(task_id, "Cancelled by user request")
        return CancelTaskResponse(
            task_id=task_id,
            cancelled=True,
            message="Task cancelled successfully",
        )
    else:
        return CancelTaskResponse(
            task_id=task_id,
            cancelled=False,
            message="Failed to cancel task. It may have already completed.",
        )


@router.get("/", response_model=list[TaskStatusResponse])
async def list_active_tasks(
    limit: int = Query(default=50, ge=1, le=200),
) -> list[TaskStatusResponse]:
    """
    List all active (in-progress) tasks.

    Args:
        limit: Maximum number of tasks to return

    Returns:
        List of active task statuses
    """
    tracker = get_progress_tracker()
    active_tasks = tracker.get_active_tasks(limit=limit)

    return [
        TaskStatusResponse(
            task_id=task.task_id,
            status=task.status.value,
            percent=task.percent,
            message=task.message,
            started_at=task.started_at,
            completed_at=task.completed_at,
            failed_at=task.failed_at,
            result=task.result,
            error=task.error,
        )
        for task in active_tasks
    ]


@router.delete("/{task_id}")
async def delete_progress(task_id: str) -> dict:
    """
    Delete progress information for a task.

    This is typically used for cleanup after a task is complete.

    Args:
        task_id: Unique task identifier

    Returns:
        Deletion result
    """
    tracker = get_progress_tracker()

    # Check if task exists
    if not tracker.exists(task_id):
        raise HTTPException(
            status_code=404,
            detail=f"Task {task_id} not found",
        )

    # Check if task is still running
    progress = tracker.get(task_id)
    if progress.status == TaskStatus.IN_PROGRESS:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete progress for a running task. Cancel it first.",
        )

    success = tracker.delete(task_id)

    if success:
        return {"task_id": task_id, "deleted": True}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to delete task progress",
        )


@router.get("/health/check")
async def health_check() -> dict:
    """
    Health check for the progress tracking system.

    Returns:
        Health status of Redis connection and task queue
    """
    tracker = get_progress_tracker()

    try:
        # Test Redis connection
        tracker.redis.ping()
        redis_status = "healthy"
    except Exception as e:
        redis_status = f"unhealthy: {e}"

    # Check Celery queue
    try:
        from app.services.resilience.queue import get_queue_length
        queue_length = get_queue_length("default")
        queue_status = "healthy" if queue_length is not None else "unknown"
    except Exception as e:
        queue_status = f"unhealthy: {e}"
        queue_length = None

    return {
        "redis": redis_status,
        "queue": queue_status,
        "queue_length": queue_length,
    }
