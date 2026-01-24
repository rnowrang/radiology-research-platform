"""
Celery tasks for asynchronous operations in Protocol Assistant.

This module defines Celery tasks for long-running operations such as
document processing, protocol analysis, and document generation.
"""

import asyncio
import logging
from typing import Any, Optional

from celery import shared_task
from celery.exceptions import MaxRetriesExceededError, SoftTimeLimitExceeded

from app.services.resilience.queue import celery_app
from app.services.resilience.progress import ProgressTracker
from app.services.resilience.notifications import NotificationService

logger = logging.getLogger(__name__)


def run_async(coro):
    """Run an async function in a sync context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Create a new loop if current is running
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def process_document_async(
    self,
    session_id: str,
    file_path: str,
    user_id: str,
    options: Optional[dict] = None,
) -> dict[str, Any]:
    """
    Async document processing with progress updates.

    This task handles the extraction and analysis of uploaded documents,
    providing progress updates and handling failures gracefully.

    Args:
        session_id: The chat session ID
        file_path: Path to the uploaded document
        user_id: ID of the user who initiated the request
        options: Optional processing options

    Returns:
        Dictionary containing processing results
    """
    task_id = self.request.id
    tracker = ProgressTracker()
    options = options or {}

    try:
        tracker.update(task_id, 0, "Starting document processing...")
        logger.info(f"Processing document: {file_path} for session {session_id}")

        result = run_async(_process_document(
            task_id=task_id,
            session_id=session_id,
            file_path=file_path,
            user_id=user_id,
            options=options,
            tracker=tracker,
        ))

        tracker.complete(task_id, result)
        logger.info(f"Document processing completed for task {task_id}")

        # Send success notification
        run_async(_send_completion_notification(
            user_id=user_id,
            task_type="Document Processing",
            result=result,
        ))

        return result

    except SoftTimeLimitExceeded:
        logger.warning(f"Task {task_id} exceeded soft time limit")
        tracker.fail(task_id, "Processing took too long and was terminated")
        run_async(_send_failure_notification(
            user_id=user_id,
            task_type="Document Processing",
            error="Processing timed out. Please try with a smaller document.",
        ))
        raise

    except MaxRetriesExceededError:
        logger.error(f"Task {task_id} exceeded max retries")
        tracker.fail(task_id, "Failed after multiple attempts")
        run_async(_send_failure_notification(
            user_id=user_id,
            task_type="Document Processing",
            error="Processing failed after multiple attempts. Please try again later.",
        ))
        raise

    except Exception as exc:
        retry_count = self.request.retries
        logger.warning(f"Task {task_id} failed (attempt {retry_count + 1}): {exc}")

        if retry_count < self.max_retries:
            tracker.update(
                task_id,
                -1,
                f"Retrying after error (attempt {retry_count + 2}/{self.max_retries + 1})...",
            )
            # Exponential backoff: 5s, 25s, 125s
            countdown = 5 * (5 ** retry_count)
            raise self.retry(exc=exc, countdown=countdown)
        else:
            tracker.fail(task_id, str(exc))
            run_async(_send_failure_notification(
                user_id=user_id,
                task_type="Document Processing",
                error=str(exc),
            ))
            raise


@celery_app.task(
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
)
def generate_document_async(
    self,
    session_id: str,
    doc_type: str,
    user_id: str,
    context: Optional[dict] = None,
) -> dict[str, Any]:
    """
    Async document generation using LLM.

    This task handles the generation of protocol documents, consent forms,
    and other materials using the LLM orchestrator.

    Args:
        session_id: The chat session ID
        doc_type: Type of document to generate
        user_id: ID of the user who initiated the request
        context: Optional context data for generation

    Returns:
        Dictionary containing generation results
    """
    task_id = self.request.id
    tracker = ProgressTracker()
    context = context or {}

    try:
        tracker.update(task_id, 0, f"Starting {doc_type} generation...")
        logger.info(f"Generating {doc_type} for session {session_id}")

        result = run_async(_generate_document(
            task_id=task_id,
            session_id=session_id,
            doc_type=doc_type,
            user_id=user_id,
            context=context,
            tracker=tracker,
        ))

        tracker.complete(task_id, result)
        logger.info(f"Document generation completed for task {task_id}")

        run_async(_send_completion_notification(
            user_id=user_id,
            task_type=f"{doc_type} Generation",
            result=result,
        ))

        return result

    except SoftTimeLimitExceeded:
        logger.warning(f"Task {task_id} exceeded soft time limit")
        tracker.fail(task_id, "Generation took too long and was terminated")
        run_async(_send_failure_notification(
            user_id=user_id,
            task_type=f"{doc_type} Generation",
            error="Generation timed out. The AI service may be overloaded.",
        ))
        raise

    except Exception as exc:
        retry_count = self.request.retries
        logger.warning(f"Task {task_id} failed (attempt {retry_count + 1}): {exc}")

        if retry_count < self.max_retries:
            tracker.update(
                task_id,
                -1,
                f"Retrying after error (attempt {retry_count + 2}/{self.max_retries + 1})...",
            )
            countdown = 5 * (5 ** retry_count)
            raise self.retry(exc=exc, countdown=countdown)
        else:
            tracker.fail(task_id, str(exc))
            run_async(_send_failure_notification(
                user_id=user_id,
                task_type=f"{doc_type} Generation",
                error=str(exc),
            ))
            raise


@celery_app.task(
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def analyze_protocol_async(
    self,
    session_id: str,
    protocol_data: dict,
    user_id: str,
    analysis_type: str = "comprehensive",
) -> dict[str, Any]:
    """
    Async protocol analysis using LLM.

    Analyzes protocol data for completeness, compliance, and suggestions.

    Args:
        session_id: The chat session ID
        protocol_data: Protocol information to analyze
        user_id: ID of the user who initiated the request
        analysis_type: Type of analysis to perform

    Returns:
        Dictionary containing analysis results
    """
    task_id = self.request.id
    tracker = ProgressTracker()

    try:
        tracker.update(task_id, 0, "Starting protocol analysis...")
        logger.info(f"Analyzing protocol for session {session_id}")

        result = run_async(_analyze_protocol(
            task_id=task_id,
            session_id=session_id,
            protocol_data=protocol_data,
            user_id=user_id,
            analysis_type=analysis_type,
            tracker=tracker,
        ))

        tracker.complete(task_id, result)
        logger.info(f"Protocol analysis completed for task {task_id}")

        run_async(_send_completion_notification(
            user_id=user_id,
            task_type="Protocol Analysis",
            result=result,
        ))

        return result

    except Exception as exc:
        retry_count = self.request.retries
        if retry_count < self.max_retries:
            tracker.update(task_id, -1, f"Retrying analysis...")
            raise self.retry(exc=exc)
        else:
            tracker.fail(task_id, str(exc))
            run_async(_send_failure_notification(
                user_id=user_id,
                task_type="Protocol Analysis",
                error=str(exc),
            ))
            raise


@celery_app.task(bind=True, max_retries=5, default_retry_delay=2)
def notify_user(
    self,
    user_id: str,
    notification_type: str,
    title: str,
    message: str,
    data: Optional[dict] = None,
) -> bool:
    """
    Send a notification to a user.

    This is a high-priority task for user notifications.

    Args:
        user_id: ID of the user to notify
        notification_type: Type of notification
        title: Notification title
        message: Notification message
        data: Additional notification data

    Returns:
        True if notification was sent successfully
    """
    try:
        service = NotificationService()
        run_async(service.send_notification(
            user_id=user_id,
            type=notification_type,
            title=title,
            message=message,
            data=data or {},
        ))
        return True
    except Exception as exc:
        logger.warning(f"Failed to send notification: {exc}")
        raise self.retry(exc=exc)


# Internal async helper functions

async def _process_document(
    task_id: str,
    session_id: str,
    file_path: str,
    user_id: str,
    options: dict,
    tracker: ProgressTracker,
) -> dict[str, Any]:
    """Internal document processing implementation."""
    from app.services.document_parser import DocumentParser

    tracker.update(task_id, 10, "Loading document...")

    # Parse the document
    parser = DocumentParser()
    tracker.update(task_id, 30, "Extracting text and metadata...")

    try:
        document = await parser.parse(file_path)
    except Exception as e:
        logger.error(f"Document parsing failed: {e}")
        raise

    tracker.update(task_id, 50, "Analyzing document content...")

    # Analyze with LLM if needed
    if options.get("analyze", True):
        from app.services.llm.orchestrator import get_llm_orchestrator

        orchestrator = get_llm_orchestrator()
        tracker.update(task_id, 70, "Processing with AI...")

        # Perform analysis (placeholder - integrate with actual analysis logic)
        analysis_result = {
            "document_type": document.get("type", "unknown"),
            "page_count": document.get("pages", 0),
            "word_count": len(document.get("text", "").split()),
            "analyzed": True,
        }
    else:
        analysis_result = {"analyzed": False}

    tracker.update(task_id, 90, "Finalizing results...")

    return {
        "session_id": session_id,
        "file_path": file_path,
        "document": document,
        "analysis": analysis_result,
        "status": "completed",
    }


async def _generate_document(
    task_id: str,
    session_id: str,
    doc_type: str,
    user_id: str,
    context: dict,
    tracker: ProgressTracker,
) -> dict[str, Any]:
    """Internal document generation implementation."""
    from app.services.llm.orchestrator import get_llm_orchestrator
    from app.services.generator import DocumentGenerator

    tracker.update(task_id, 10, "Preparing generation context...")

    # Get LLM orchestrator
    orchestrator = get_llm_orchestrator()

    tracker.update(task_id, 30, "Generating content with AI...")

    # Generate document (placeholder - integrate with actual generator)
    generator = DocumentGenerator()

    tracker.update(task_id, 60, "Formatting document...")

    # Generate the document
    try:
        result = await generator.generate(
            doc_type=doc_type,
            context=context,
            session_id=session_id,
        )
    except Exception as e:
        logger.error(f"Document generation failed: {e}")
        raise

    tracker.update(task_id, 90, "Saving generated document...")

    return {
        "session_id": session_id,
        "doc_type": doc_type,
        "content": result.get("content"),
        "file_path": result.get("file_path"),
        "status": "completed",
    }


async def _analyze_protocol(
    task_id: str,
    session_id: str,
    protocol_data: dict,
    user_id: str,
    analysis_type: str,
    tracker: ProgressTracker,
) -> dict[str, Any]:
    """Internal protocol analysis implementation."""
    from app.services.llm.orchestrator import get_llm_orchestrator
    from app.services.protocol_analyzer import ProtocolAnalyzer

    tracker.update(task_id, 10, "Loading protocol data...")

    # Get analyzer
    analyzer = ProtocolAnalyzer()

    tracker.update(task_id, 30, "Analyzing protocol structure...")

    # Perform analysis
    try:
        if analysis_type == "comprehensive":
            tracker.update(task_id, 50, "Checking compliance requirements...")
            result = await analyzer.analyze_comprehensive(protocol_data)
        else:
            result = await analyzer.analyze_basic(protocol_data)
    except Exception as e:
        logger.error(f"Protocol analysis failed: {e}")
        raise

    tracker.update(task_id, 80, "Generating recommendations...")

    return {
        "session_id": session_id,
        "analysis_type": analysis_type,
        "results": result,
        "status": "completed",
    }


async def _send_completion_notification(
    user_id: str,
    task_type: str,
    result: dict,
) -> None:
    """Send a task completion notification."""
    service = NotificationService()
    await service.notify_task_complete(
        user_id=user_id,
        task_type=task_type,
        result=result,
    )


async def _send_failure_notification(
    user_id: str,
    task_type: str,
    error: str,
) -> None:
    """Send a task failure notification."""
    service = NotificationService()
    await service.notify_task_failed(
        user_id=user_id,
        task_type=task_type,
        error=error,
    )
