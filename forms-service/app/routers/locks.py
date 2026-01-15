"""Editing lock management endpoints."""

from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.form import FormInstance
from app.services.lock import LockService


router = APIRouter(prefix="/api/forms", tags=["locks"])


# =============================================================================
# Schemas
# =============================================================================

class LockAcquireRequest(BaseModel):
    """Request to acquire a lock."""
    section_id: Optional[str] = Field(None, description="Optional section ID for section-level locking")
    duration_minutes: int = Field(5, ge=1, le=30, description="Lock duration in minutes (1-30)")


class LockExtendRequest(BaseModel):
    """Request to extend a lock."""
    section_id: Optional[str] = Field(None, description="Section ID if extending a section lock")
    duration_minutes: int = Field(5, ge=1, le=30, description="Extension duration in minutes (1-30)")


class LockReleaseRequest(BaseModel):
    """Request to release a lock."""
    section_id: Optional[str] = Field(None, description="Section ID if releasing a section lock")


class ForceReleaseRequest(BaseModel):
    """Request to force release a lock."""
    section_id: Optional[str] = Field(None, description="Section ID if force releasing a section lock")


# =============================================================================
# Helper Functions
# =============================================================================

def get_user_id(x_user_id: Optional[str] = Header(None)) -> Optional[UUID]:
    """Extract user ID from header."""
    if x_user_id:
        return UUID(x_user_id)
    return None


def get_user_role(x_user_role: Optional[str] = Header(None)) -> Optional[str]:
    """Extract user role from header."""
    return x_user_role


# =============================================================================
# Lock Endpoints
# =============================================================================

@router.post("/{form_id}/lock")
def acquire_lock(
    form_id: int,
    request: LockAcquireRequest = None,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """
    Acquire an editing lock on a form or section.

    If the user already holds the lock, it will be extended automatically.
    Returns lock info or error if another user holds the lock.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    # Verify form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    # Check form is editable
    if form.status not in ["draft", "needs_changes"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot acquire lock on form with status '{form.status}'"
        )

    section_id = request.section_id if request else None
    duration_minutes = request.duration_minutes if request else 5

    result = LockService.acquire_lock(
        db=db,
        form_id=form_id,
        user_id=user_id,
        section_id=section_id,
        duration_minutes=duration_minutes,
    )

    if not result.get("success"):
        if result.get("error") == "locked_by_another_user":
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "locked_by_another_user",
                    "locked_by_id": result.get("locked_by_id"),
                    "expires_at": result.get("expires_at").isoformat() if result.get("expires_at") else None,
                }
            )
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to acquire lock"))

    return result


@router.delete("/{form_id}/lock")
def release_lock(
    form_id: int,
    section_id: Optional[str] = Query(None, description="Section ID if releasing a section lock"),
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """
    Release an editing lock on a form or section.

    Only the lock owner can release the lock.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    result = LockService.release_lock(
        db=db,
        form_id=form_id,
        user_id=user_id,
        section_id=section_id,
    )

    if not result.get("success"):
        if result.get("error") == "not_lock_owner":
            raise HTTPException(status_code=403, detail="You do not own this lock")
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to release lock"))

    return result


@router.get("/{form_id}/lock")
def check_lock(
    form_id: int,
    section_id: Optional[str] = Query(None, description="Section ID to check"),
    db: Session = Depends(get_db),
):
    """
    Check the lock status of a form or section.

    Returns whether the form/section is locked and by whom.
    """
    # Verify form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    return LockService.check_lock(
        db=db,
        form_id=form_id,
        section_id=section_id,
    )


@router.get("/{form_id}/locks")
def get_all_locks(
    form_id: int,
    db: Session = Depends(get_db),
):
    """
    Get all active locks for a form.

    Returns all locks including section-level locks.
    """
    # Verify form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    locks = LockService.get_all_locks_for_form(db=db, form_id=form_id)

    return {
        "form_id": form_id,
        "locks": locks,
    }


@router.post("/{form_id}/lock/extend")
def extend_lock(
    form_id: int,
    request: LockExtendRequest = None,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """
    Extend an existing lock.

    Only the lock owner can extend the lock.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    section_id = request.section_id if request else None
    duration_minutes = request.duration_minutes if request else 5

    result = LockService.extend_lock(
        db=db,
        form_id=form_id,
        user_id=user_id,
        section_id=section_id,
        duration_minutes=duration_minutes,
    )

    if not result.get("success"):
        if result.get("error") == "lock_not_found":
            raise HTTPException(status_code=404, detail="No lock found to extend")
        if result.get("error") == "not_lock_owner":
            raise HTTPException(status_code=403, detail="You do not own this lock")
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to extend lock"))

    return result


@router.post("/{form_id}/lock/force-release")
def force_release_lock(
    form_id: int,
    request: ForceReleaseRequest = None,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """
    Force release a lock (admin or form owner only).

    Allows admins or form owners to release locks held by other users.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    section_id = request.section_id if request else None

    result = LockService.force_release_lock(
        db=db,
        form_id=form_id,
        section_id=section_id,
        user_id=user_id,
        user_role=user_role,
    )

    if not result.get("success"):
        if result.get("error") == "form_not_found":
            raise HTTPException(status_code=404, detail="Form not found")
        if result.get("error") == "permission_denied":
            raise HTTPException(
                status_code=403,
                detail="Only admins or form owners can force release locks"
            )
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to force release lock"))

    return result


# =============================================================================
# Section-Level Lock Endpoints
# =============================================================================

@router.post("/{form_id}/sections/{section_id}/lock")
def acquire_section_lock(
    form_id: int,
    section_id: str,
    duration_minutes: int = Query(5, ge=1, le=30, description="Lock duration in minutes"),
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """
    Acquire an editing lock on a specific section.

    Shortcut endpoint for section-level locking.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    # Verify form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    # Check form is editable
    if form.status not in ["draft", "needs_changes"]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot acquire lock on form with status '{form.status}'"
        )

    result = LockService.acquire_lock(
        db=db,
        form_id=form_id,
        user_id=user_id,
        section_id=section_id,
        duration_minutes=duration_minutes,
    )

    if not result.get("success"):
        if result.get("error") == "locked_by_another_user":
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "locked_by_another_user",
                    "locked_by_id": result.get("locked_by_id"),
                    "expires_at": result.get("expires_at").isoformat() if result.get("expires_at") else None,
                }
            )
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to acquire lock"))

    return result


@router.delete("/{form_id}/sections/{section_id}/lock")
def release_section_lock(
    form_id: int,
    section_id: str,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """
    Release an editing lock on a specific section.

    Shortcut endpoint for section-level lock release.
    """
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID required")

    result = LockService.release_lock(
        db=db,
        form_id=form_id,
        user_id=user_id,
        section_id=section_id,
    )

    if not result.get("success"):
        if result.get("error") == "not_lock_owner":
            raise HTTPException(status_code=403, detail="You do not own this lock")
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to release lock"))

    return result


@router.get("/{form_id}/sections/{section_id}/lock")
def check_section_lock(
    form_id: int,
    section_id: str,
    db: Session = Depends(get_db),
):
    """
    Check the lock status of a specific section.

    Shortcut endpoint for checking section-level lock status.
    """
    # Verify form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    return LockService.check_lock(
        db=db,
        form_id=form_id,
        section_id=section_id,
    )
