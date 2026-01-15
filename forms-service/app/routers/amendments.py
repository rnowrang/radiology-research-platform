"""Amendment management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from app.database import get_db
from app.models.amendment import Amendment, AmendmentFieldChange
from app.schemas.amendment import (
    AmendmentCreate,
    AmendmentUpdate,
    AmendmentResponse,
    AmendmentWithChangesResponse,
    AmendmentListResponse,
    AmendmentFieldChangeCreate,
    AmendmentFieldChangeUpdate,
    AmendmentFieldChangeResponse,
    ApproveAmendmentRequest,
    RejectAmendmentRequest,
)
from app.services.amendment import amendment_service

router = APIRouter(prefix="/api", tags=["amendments"])


def get_user_id(x_user_id: str = Header(..., alias="X-User-ID")) -> UUID:
    """Get user ID from header."""
    try:
        return UUID(x_user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )


def get_optional_user_id(x_user_id: Optional[str] = Header(None, alias="X-User-ID")) -> Optional[UUID]:
    """Get optional user ID from header."""
    if not x_user_id:
        return None
    try:
        return UUID(x_user_id)
    except ValueError:
        return None


# Form-scoped endpoints
@router.get("/forms/{form_id}/amendments", response_model=List[AmendmentListResponse])
async def get_form_amendments(
    form_id: int,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Get all amendments for a form."""
    amendments = amendment_service.get_form_amendments(db, form_id, status_filter)

    result = []
    for amendment in amendments:
        result.append({
            "id": amendment.id,
            "form_instance_id": amendment.form_instance_id,
            "amendment_type": amendment.amendment_type,
            "status": amendment.status,
            "description": amendment.description,
            "submitted_at": amendment.submitted_at,
            "reviewed_at": amendment.reviewed_at,
            "created_at": amendment.created_at,
            "field_changes_count": len(amendment.field_changes),
        })

    return result


@router.post("/forms/{form_id}/amendments", response_model=AmendmentResponse, status_code=status.HTTP_201_CREATED)
async def create_amendment(
    form_id: int,
    data: AmendmentCreate,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Create a new amendment for a form."""
    return amendment_service.create_amendment(db, form_id, user_id, data)


# Amendment-specific endpoints
@router.get("/amendments/{amendment_id}", response_model=AmendmentWithChangesResponse)
async def get_amendment(
    amendment_id: int,
    db: Session = Depends(get_db),
):
    """Get amendment details with field changes."""
    amendment = amendment_service.get_amendment(db, amendment_id)
    if not amendment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Amendment not found",
        )
    return amendment


@router.put("/amendments/{amendment_id}", response_model=AmendmentResponse)
async def update_amendment(
    amendment_id: int,
    data: AmendmentUpdate,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Update a draft amendment."""
    return amendment_service.update_amendment(db, amendment_id, user_id, data)


@router.delete("/amendments/{amendment_id}")
async def delete_amendment(
    amendment_id: int,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Delete a draft amendment."""
    amendment_service.delete_amendment(db, amendment_id, user_id)
    return {"success": True, "message": "Amendment deleted"}


# Field change endpoints
@router.post("/amendments/{amendment_id}/changes", response_model=AmendmentFieldChangeResponse, status_code=status.HTTP_201_CREATED)
async def add_field_change(
    amendment_id: int,
    data: AmendmentFieldChangeCreate,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Add a field change to an amendment."""
    return amendment_service.add_field_change(db, amendment_id, user_id, data)


@router.put("/amendments/{amendment_id}/changes/{change_id}", response_model=AmendmentFieldChangeResponse)
async def update_field_change(
    amendment_id: int,
    change_id: int,
    data: AmendmentFieldChangeUpdate,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Update a field change."""
    return amendment_service.update_field_change(db, change_id, user_id, data)


@router.delete("/amendments/{amendment_id}/changes/{change_id}")
async def remove_field_change(
    amendment_id: int,
    change_id: int,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Remove a field change from an amendment."""
    amendment_service.remove_field_change(db, change_id, user_id)
    return {"success": True, "message": "Field change removed"}


# Workflow endpoints
@router.post("/amendments/{amendment_id}/submit", response_model=AmendmentResponse)
async def submit_amendment(
    amendment_id: int,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Submit an amendment for review."""
    return amendment_service.submit_amendment(db, amendment_id, user_id)


@router.post("/amendments/{amendment_id}/approve", response_model=AmendmentResponse)
async def approve_amendment(
    amendment_id: int,
    data: Optional[ApproveAmendmentRequest] = None,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Approve an amendment and apply changes to the form."""
    notes = data.notes if data else None
    return amendment_service.approve_amendment(db, amendment_id, user_id, notes)


@router.post("/amendments/{amendment_id}/reject", response_model=AmendmentResponse)
async def reject_amendment(
    amendment_id: int,
    data: RejectAmendmentRequest,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Reject an amendment."""
    return amendment_service.reject_amendment(db, amendment_id, user_id, data.notes)


@router.post("/amendments/{amendment_id}/withdraw", response_model=AmendmentResponse)
async def withdraw_amendment(
    amendment_id: int,
    user_id: UUID = Depends(get_user_id),
    db: Session = Depends(get_db),
):
    """Withdraw an amendment (owner only)."""
    return amendment_service.withdraw_amendment(db, amendment_id, user_id)
