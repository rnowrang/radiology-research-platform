"""API endpoints for unified project questionnaire."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.middleware.auth import get_current_user, UserContext
from app.services.questionnaire_engine import get_questionnaire_engine
from app.services.knowledge_base import get_knowledge_base_service
from app.schemas.knowledge import (
    QuestionnaireSpec,
    QuestionnaireProgress,
    AnswerSubmission,
    AnswerSubmissionResponse,
    FactSource,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["questionnaire"])


class AnswerRequest(BaseModel):
    """Request to submit an answer."""
    answer: str
    source: str = "wizard"


class SkipRequest(BaseModel):
    """Request to skip a question."""
    reason: Optional[str] = None


@router.get(
    "/projects/{project_id}/questionnaire",
    response_model=QuestionnaireSpec,
    summary="Get project questionnaire",
)
async def get_project_questionnaire(
    project_id: str,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Get unified questionnaire for all project forms.

    Returns a questionnaire specification with sections and questions,
    including suggestions from the knowledge base.
    """
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    engine = get_questionnaire_engine(db)

    try:
        spec = await engine.get_questionnaire(
            project_id=project_uuid,
            user_id=str(user.id),
        )
        return spec
    except Exception as e:
        logger.error(f"Failed to get questionnaire for project {project_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post(
    "/projects/{project_id}/questionnaire/answer",
    response_model=AnswerSubmissionResponse,
    summary="Submit questionnaire answer",
)
async def submit_questionnaire_answer(
    project_id: str,
    submission: AnswerSubmission,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Submit an answer to a questionnaire question.

    The answer is stored in the project knowledge base and used for form filling.
    """
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    kb_service = get_knowledge_base_service(db)
    engine = get_questionnaire_engine(db)

    try:
        # Get or create knowledge base
        kb = await kb_service.get_or_create(project_uuid)
        kb_id = kb["id"]

        # Add the answer
        await kb_service.add_wizard_answer(
            kb_id=kb_id,
            question_id=submission.question_id,
            answer=submission.answer,
            source=submission.source.value if isinstance(submission.source, FactSource) else submission.source,
        )

        # Also add as fact for semantic search
        await kb_service.add_fact(
            kb_id=kb_id,
            key=submission.question_id,
            value=submission.answer,
            source=FactSource.WIZARD,
            confidence=0.95,
        )

        # Get updated progress
        progress = await engine.get_progress(project_uuid)

        # Find next question
        spec = await engine.get_questionnaire(project_uuid, str(user.id))
        next_question_id = None

        # Find current question index and get next
        for section in spec.sections:
            found_current = False
            for i, q in enumerate(section.questions):
                if found_current:
                    # This is the next question
                    next_question_id = q.id
                    break
                if q.id == submission.question_id:
                    found_current = True
            if next_question_id:
                break

        return AnswerSubmissionResponse(
            success=True,
            question_id=submission.question_id,
            next_question_id=next_question_id,
            progress=progress,
        )

    except Exception as e:
        logger.error(f"Failed to submit answer: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post(
    "/projects/{project_id}/questionnaire/skip/{question_id}",
    summary="Skip a question",
)
async def skip_question(
    project_id: str,
    question_id: str,
    request: Optional[SkipRequest] = None,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Skip a questionnaire question."""
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    kb_service = get_knowledge_base_service(db)
    engine = get_questionnaire_engine(db)

    try:
        kb = await kb_service.get_or_create(project_uuid)
        wizard_answers = await kb_service.get_wizard_answers(kb["id"])

        # Track skipped questions
        # Note: wizard_answers stores each entry as {"answer": ..., "source": ..., "answered_at": ...}
        skipped_entry = wizard_answers.get("_skipped", {})
        skipped = skipped_entry.get("answer", []) if isinstance(skipped_entry, dict) else skipped_entry
        if not isinstance(skipped, list):
            skipped = []
        if question_id not in skipped:
            skipped.append(question_id)

        await kb_service.add_wizard_answer(
            kb_id=kb["id"],
            question_id="_skipped",
            answer=skipped,
        )

        progress = await engine.get_progress(project_uuid)

        return {
            "success": True,
            "question_id": question_id,
            "progress": progress.model_dump(),
        }

    except Exception as e:
        logger.error(f"Failed to skip question: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get(
    "/projects/{project_id}/questionnaire/progress",
    response_model=QuestionnaireProgress,
    summary="Get questionnaire progress",
)
async def get_questionnaire_progress(
    project_id: str,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Get questionnaire completion progress."""
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    engine = get_questionnaire_engine(db)

    try:
        progress = await engine.get_progress(project_uuid)
        return progress
    except Exception as e:
        logger.error(f"Failed to get progress: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post(
    "/projects/{project_id}/questionnaire/reset",
    summary="Reset questionnaire",
)
async def reset_questionnaire(
    project_id: str,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Reset all questionnaire answers for a project."""
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    kb_service = get_knowledge_base_service(db)

    try:
        kb = await kb_service.get_by_project(project_uuid)
        if not kb:
            return {"success": True, "message": "No questionnaire data to reset"}

        # Clear wizard answers while preserving other KB data
        from sqlalchemy import text

        await db.execute(
            text("""
                UPDATE project_knowledge_base
                SET wizard_answers = '{}',
                    questionnaire_complete = FALSE,
                    completion_percentage = 0,
                    updated_at = NOW()
                WHERE project_id = :project_id
            """),
            {"project_id": str(project_uuid)}
        )
        await db.commit()

        return {"success": True, "message": "Questionnaire reset successfully"}

    except Exception as e:
        logger.error(f"Failed to reset questionnaire: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
