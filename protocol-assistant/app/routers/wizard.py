"""Wizard router for guided protocol question flow."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.schemas.wizard import (
    WizardQuestionsResponse, AnswerRequest, AnswerResponse,
    SkipResponse, WizardProgress, SuggestionsResponse
)
from app.services.wizard_service import WizardService
from app.services.suggestion_generator import SuggestionGenerator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/protocol-assistant/sessions/{session_id}/wizard", tags=["wizard"])


# Additional schemas for form pre-fill
class FormPrefillField(BaseModel):
    """A field that will be pre-filled."""
    field_name: str
    field_label: str
    current_value: Optional[str] = None
    new_value: Optional[str] = None
    confidence: Optional[float] = None


class FormPrefillPreviewResponse(BaseModel):
    """Preview of fields that will be pre-filled."""
    form_fields: list[FormPrefillField]
    total_fields: int
    fields_to_populate: int


class WizardPrefillRequest(BaseModel):
    """Request to pre-fill a form from wizard."""
    formId: int


class WizardPrefillResponse(BaseModel):
    """Response after pre-filling a form."""
    success: bool
    form_id: int
    fields_populated: int
    redirect_url: Optional[str] = None


def get_wizard_service(db: AsyncSession = Depends(get_async_session)) -> WizardService:
    """Get wizard service instance."""
    return WizardService(db)


@router.get("/questions", response_model=WizardQuestionsResponse)
async def get_wizard_questions(
    session_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    service: WizardService = Depends(get_wizard_service)
):
    """Get enhanced gap questions for the guided wizard."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    try:
        return await service.get_wizard_questions(session_id, x_user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get wizard questions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get wizard questions: {str(e)}")


@router.post("/questions/{question_id}/answer", response_model=AnswerResponse)
async def submit_wizard_answer(
    session_id: str,
    question_id: str,
    request: AnswerRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    service: WizardService = Depends(get_wizard_service)
):
    """Submit an answer to a wizard question."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    try:
        return await service.submit_answer(session_id, x_user_id, question_id, request)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to submit answer: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to submit answer: {str(e)}")


@router.post("/questions/{question_id}/skip", response_model=SkipResponse)
async def skip_wizard_question(
    session_id: str,
    question_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    service: WizardService = Depends(get_wizard_service)
):
    """Skip a wizard question."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    try:
        return await service.skip_question(session_id, x_user_id, question_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to skip question: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to skip question: {str(e)}")


@router.get("/progress", response_model=WizardProgress)
async def get_wizard_progress(
    session_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    service: WizardService = Depends(get_wizard_service)
):
    """Get current wizard progress."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    try:
        return await service.get_progress(session_id, x_user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get progress: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get progress: {str(e)}")


@router.get("/questions/{question_id}/suggestions", response_model=SuggestionsResponse)
async def get_question_suggestions(
    session_id: str,
    question_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    service: WizardService = Depends(get_wizard_service)
):
    """Get AI-generated suggestions for a specific question."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    try:
        suggestions = await service.get_suggestions(session_id, x_user_id, question_id)
        return SuggestionsResponse(suggestions=suggestions)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get suggestions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get suggestions: {str(e)}")


@router.get("/form-preview", response_model=FormPrefillPreviewResponse)
async def get_form_prefill_preview(
    session_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    formId: Optional[int] = None,
    service: WizardService = Depends(get_wizard_service)
):
    """Get a preview of fields that will be pre-filled."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    try:
        preview = await service.get_form_prefill_preview(session_id, x_user_id, formId)
        return preview
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get form preview: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get form preview: {str(e)}")


@router.post("/prefill-form", response_model=WizardPrefillResponse)
async def prefill_form_from_wizard(
    session_id: str,
    request: WizardPrefillRequest,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    service: WizardService = Depends(get_wizard_service)
):
    """Pre-fill a form with answers collected from the wizard."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    try:
        result = await service.prefill_form(session_id, x_user_id, request.formId)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to prefill form: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to prefill form: {str(e)}")
