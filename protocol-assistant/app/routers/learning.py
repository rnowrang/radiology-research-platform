"""Learning API Router.

Provides endpoints for:
- Recording and retrieving user corrections
- Recording suggestion feedback
- Querying fact provenance
- Getting learning context for suggestions
"""

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.auth import get_current_user_id
from app.services.learning_service import (
    LearningService,
    get_learning_service,
    CorrectionSource,
    SuggestionFeedback,
    FactSource,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/learning", tags=["learning"])


# =============================================================================
# Request/Response Models
# =============================================================================

class RecordCorrectionRequest(BaseModel):
    """Request to record a user correction."""
    field_key: str = Field(..., description="The field that was corrected")
    original_value: Optional[str] = Field(None, description="Original value")
    corrected_value: str = Field(..., description="Value after correction")
    project_id: Optional[str] = Field(None, description="Project UUID")
    form_field_id: Optional[str] = Field(None, description="Form field ID")
    source: str = Field("form_fill", description="Source of correction")
    suggestion_confidence: Optional[float] = Field(None, description="Confidence of original suggestion")
    suggestion_source: Optional[str] = Field(None, description="Source of original suggestion")


class RecordFeedbackRequest(BaseModel):
    """Request to record suggestion feedback."""
    suggestion_type: str = Field(..., description="Type of suggestion")
    feedback: str = Field(..., description="Feedback: accepted, rejected, modified, ignored")
    field_key: Optional[str] = Field(None, description="Field key")
    suggested_value: Optional[str] = Field(None, description="The suggested value")
    final_value: Optional[str] = Field(None, description="Final value used")
    project_id: Optional[str] = Field(None, description="Project UUID")
    suggestion_confidence: Optional[float] = Field(None, description="Confidence")
    suggestion_source: Optional[str] = Field(None, description="Source")


class UpdateProvenanceRequest(BaseModel):
    """Request to update fact provenance."""
    fact_key: str = Field(..., description="The fact key")
    value: str = Field(..., description="Current value")
    source: str = Field(..., description="Source of the fact")
    confidence: float = Field(1.0, description="Confidence score")
    source_document_id: Optional[str] = Field(None, description="Source document UUID")
    source_reference: Optional[str] = Field(None, description="Reference string")
    change_reason: Optional[str] = Field(None, description="Reason for change")


class AddReferenceRequest(BaseModel):
    """Request to add a reference to a fact."""
    fact_key: str = Field(..., description="The fact key")
    reference_type: str = Field(..., description="Type of reference")
    reference_id: str = Field(..., description="ID of referencing entity")
    field: Optional[str] = Field(None, description="Field name")


class CorrectionResponse(BaseModel):
    """Correction record response."""
    id: str
    user_id: str
    project_id: Optional[str]
    field_key: str
    form_field_id: Optional[str]
    original_value: Optional[str]
    corrected_value: str
    correction_source: str
    suggestion_confidence: Optional[float]
    suggestion_source: Optional[str]
    applied_to_learning: bool
    created_at: str


class ProvenanceResponse(BaseModel):
    """Fact provenance response."""
    id: str
    project_id: str
    fact_key: str
    current_value: Optional[str]
    primary_source: str
    source_document_id: Optional[str]
    source_reference: Optional[str]
    confidence: float
    verified_by_user: bool
    verified_at: Optional[str]
    referenced_by: List[Dict[str, Any]]
    version: int
    previous_value: Optional[str]
    created_at: str
    updated_at: str


class HistoryEntryResponse(BaseModel):
    """Fact history entry response."""
    id: str
    version: int
    value: Optional[str]
    source: str
    confidence: Optional[float]
    changed_by_user_id: Optional[str]
    change_reason: Optional[str]
    created_at: str


class LearningContextResponse(BaseModel):
    """Learning context for suggestions."""
    user_patterns: Dict[str, Any]
    user_preferences: Dict[str, Any]
    common_values: Dict[str, int]
    recent_corrections: Dict[str, int]
    correction_count: int
    acceptance_rate: float


# =============================================================================
# User Profile Endpoints
# =============================================================================

@router.get("/profile")
async def get_my_profile(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Get the current user's learning profile."""
    service = get_learning_service(db)
    profile = await service.get_or_create_profile(UUID(user_id))

    return {
        "id": str(profile["id"]),
        "patterns": profile["patterns"],
        "common_values": profile["common_values"],
        "preferences": profile["preferences"],
        "total_corrections": profile["total_corrections"],
        "total_accepted_suggestions": profile["total_accepted_suggestions"],
    }


@router.get("/profile/common-values")
async def get_common_values(
    field_key: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Get commonly used values for the current user."""
    service = get_learning_service(db)
    values = await service.get_common_values(UUID(user_id), field_key)
    return {"common_values": values}


# =============================================================================
# Correction Endpoints
# =============================================================================

@router.post("/corrections")
async def record_correction(
    request: RecordCorrectionRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Record a user correction to an AI suggestion."""
    service = get_learning_service(db)

    try:
        source = CorrectionSource(request.source)
    except ValueError:
        source = CorrectionSource.FORM_FILL

    correction_id = await service.record_correction(
        user_id=UUID(user_id),
        field_key=request.field_key,
        original_value=request.original_value,
        corrected_value=request.corrected_value,
        project_id=UUID(request.project_id) if request.project_id else None,
        form_field_id=request.form_field_id,
        source=source,
        suggestion_confidence=request.suggestion_confidence,
        suggestion_source=request.suggestion_source,
    )

    return {"id": str(correction_id), "success": True}


@router.get("/corrections")
async def get_corrections(
    field_key: Optional[str] = None,
    project_id: Optional[str] = None,
    limit: int = 100,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Get user corrections."""
    service = get_learning_service(db)

    corrections = await service.get_corrections(
        user_id=UUID(user_id),
        field_key=field_key,
        project_id=UUID(project_id) if project_id else None,
        limit=limit,
    )

    return {
        "corrections": [
            {
                **c,
                "id": str(c["id"]),
                "user_id": str(c["user_id"]),
                "project_id": str(c["project_id"]) if c["project_id"] else None,
                "created_at": c["created_at"].isoformat() if c["created_at"] else None,
            }
            for c in corrections
        ],
        "count": len(corrections),
    }


@router.get("/corrections/patterns")
async def get_correction_patterns(
    field_key: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Analyze correction patterns for the current user."""
    service = get_learning_service(db)
    patterns = await service.get_correction_patterns(UUID(user_id), field_key)
    return {"patterns": patterns}


# =============================================================================
# Feedback Endpoints
# =============================================================================

@router.post("/feedback")
async def record_feedback(
    request: RecordFeedbackRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Record feedback on an AI suggestion."""
    service = get_learning_service(db)

    try:
        feedback = SuggestionFeedback(request.feedback)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid feedback value: {request.feedback}"
        )

    feedback_id = await service.record_feedback(
        user_id=UUID(user_id),
        suggestion_type=request.suggestion_type,
        feedback=feedback,
        field_key=request.field_key,
        suggested_value=request.suggested_value,
        final_value=request.final_value,
        project_id=UUID(request.project_id) if request.project_id else None,
        suggestion_confidence=request.suggestion_confidence,
        suggestion_source=request.suggestion_source,
    )

    return {"id": str(feedback_id), "success": True}


@router.get("/feedback/stats")
async def get_feedback_stats(
    suggestion_type: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Get feedback statistics for the current user."""
    service = get_learning_service(db)
    stats = await service.get_feedback_stats(UUID(user_id), suggestion_type)
    return stats


# =============================================================================
# Provenance Endpoints
# =============================================================================

@router.post("/projects/{project_id}/provenance")
async def update_provenance(
    project_id: str,
    request: UpdateProvenanceRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Create or update fact provenance."""
    service = get_learning_service(db)

    try:
        source = FactSource(request.source)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid source value: {request.source}"
        )

    provenance_id = await service.create_or_update_provenance(
        project_id=UUID(project_id),
        fact_key=request.fact_key,
        value=request.value,
        source=source,
        confidence=request.confidence,
        source_document_id=UUID(request.source_document_id) if request.source_document_id else None,
        source_reference=request.source_reference,
        changed_by_user_id=UUID(user_id),
        change_reason=request.change_reason,
    )

    return {"id": str(provenance_id), "success": True}


@router.get("/projects/{project_id}/provenance/{fact_key}")
async def get_provenance(
    project_id: str,
    fact_key: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Get provenance for a fact."""
    service = get_learning_service(db)
    provenance = await service.get_provenance(UUID(project_id), fact_key)

    if not provenance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provenance not found for fact: {fact_key}"
        )

    return {
        **provenance,
        "id": str(provenance["id"]),
        "project_id": str(provenance["project_id"]),
        "source_document_id": str(provenance["source_document_id"]) if provenance["source_document_id"] else None,
        "changed_by_user_id": str(provenance["changed_by_user_id"]) if provenance["changed_by_user_id"] else None,
        "verified_at": provenance["verified_at"].isoformat() if provenance["verified_at"] else None,
        "created_at": provenance["created_at"].isoformat() if provenance["created_at"] else None,
        "updated_at": provenance["updated_at"].isoformat() if provenance["updated_at"] else None,
    }


@router.get("/projects/{project_id}/provenance/{fact_key}/history")
async def get_fact_history(
    project_id: str,
    fact_key: str,
    limit: int = 50,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Get history of a fact."""
    service = get_learning_service(db)
    history = await service.get_fact_history(UUID(project_id), fact_key, limit)

    return {
        "history": [
            {
                **h,
                "id": str(h["id"]),
                "provenance_id": str(h["provenance_id"]),
                "project_id": str(h["project_id"]),
                "changed_by_user_id": str(h["changed_by_user_id"]) if h["changed_by_user_id"] else None,
                "created_at": h["created_at"].isoformat() if h["created_at"] else None,
            }
            for h in history
        ],
        "count": len(history),
    }


@router.post("/projects/{project_id}/provenance/reference")
async def add_reference(
    project_id: str,
    request: AddReferenceRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Add a reference to a fact."""
    service = get_learning_service(db)

    await service.add_reference(
        project_id=UUID(project_id),
        fact_key=request.fact_key,
        reference_type=request.reference_type,
        reference_id=request.reference_id,
        field=request.field,
    )

    return {"success": True}


@router.post("/projects/{project_id}/provenance/{fact_key}/verify")
async def verify_fact(
    project_id: str,
    fact_key: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    """Mark a fact as verified by the current user."""
    service = get_learning_service(db)
    await service.verify_fact(UUID(project_id), fact_key, UUID(user_id))
    return {"success": True}


# =============================================================================
# Learning Context Endpoints
# =============================================================================

@router.get("/context/{field_key}")
async def get_learning_context(
    field_key: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> LearningContextResponse:
    """Get learning context for a field to improve suggestions."""
    service = get_learning_service(db)
    context = await service.get_learning_context(UUID(user_id), field_key)
    return LearningContextResponse(**context)
