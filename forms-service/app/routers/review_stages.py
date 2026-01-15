"""Review stages router for multi-stage workflow management."""

from typing import List, Optional
from uuid import UUID
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.review_workflow import review_workflow_service
from app.schemas.review_stage import (
    ReviewStageCreate,
    ReviewStageUpdate,
    ReviewStageResponse,
    ReviewStageReorderRequest,
    ReviewProgressResponse,
    StageAssignmentRequest,
    StageCompletionRequest,
    FormReviewResponse,
)

router = APIRouter(tags=["review-stages"])


def get_user_id(x_user_id: Optional[str] = Header(None)) -> Optional[UUID]:
    """Extract user ID from header."""
    if x_user_id:
        return UUID(x_user_id)
    return None


def get_user_role(x_user_role: Optional[str] = Header(None)) -> Optional[str]:
    """Extract user role from header."""
    return x_user_role


# =============================================================================
# Admin Endpoints - Review Stage Management
# =============================================================================

@router.get("/api/admin/review-stages", response_model=List[ReviewStageResponse])
def list_review_stages(
    active_only: bool = Query(True, description="Only return active stages"),
    db: Session = Depends(get_db),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Get all review stages (admin only)."""
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    stages = review_workflow_service.get_all_stages(db, active_only=active_only)
    return stages


@router.post("/api/admin/review-stages", response_model=ReviewStageResponse, status_code=201)
def create_review_stage(
    data: ReviewStageCreate,
    db: Session = Depends(get_db),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Create a new review stage (admin only)."""
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    stage = review_workflow_service.create_stage(db, data)
    return stage


@router.get("/api/admin/review-stages/{stage_id}", response_model=ReviewStageResponse)
def get_review_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Get a specific review stage (admin only)."""
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    stage = review_workflow_service.get_stage(db, stage_id)
    if not stage:
        raise HTTPException(status_code=404, detail="Review stage not found")
    return stage


@router.put("/api/admin/review-stages/{stage_id}", response_model=ReviewStageResponse)
def update_review_stage(
    stage_id: int,
    data: ReviewStageUpdate,
    db: Session = Depends(get_db),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Update a review stage (admin only)."""
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    stage = review_workflow_service.update_stage(db, stage_id, data)
    return stage


@router.delete("/api/admin/review-stages/{stage_id}")
def delete_review_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Delete (deactivate) a review stage (admin only)."""
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    review_workflow_service.delete_stage(db, stage_id)
    return {"success": True, "message": "Review stage deactivated"}


@router.post("/api/admin/review-stages/reorder", response_model=List[ReviewStageResponse])
def reorder_review_stages(
    data: ReviewStageReorderRequest,
    db: Session = Depends(get_db),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Reorder review stages (admin only)."""
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    stages = review_workflow_service.reorder_stages(db, data.stage_ids)
    return stages


# =============================================================================
# Form Review Endpoints
# =============================================================================

@router.get("/api/review/forms/{form_id}/stages", response_model=ReviewProgressResponse)
def get_form_review_progress(
    form_id: int,
    db: Session = Depends(get_db),
):
    """Get review progress for a form across all stages."""
    progress = review_workflow_service.get_form_review_progress(db, form_id)
    return progress


@router.post("/api/review/forms/{form_id}/stages/{stage_id}/assign")
def assign_reviewer_to_stage(
    form_id: int,
    stage_id: int,
    data: StageAssignmentRequest,
    db: Session = Depends(get_db),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Assign a reviewer to a specific stage (admin/reviewer only)."""
    if user_role not in ["admin", "reviewer"]:
        raise HTTPException(status_code=403, detail="Admin or reviewer access required")

    review = review_workflow_service.assign_reviewer(
        db,
        form_id,
        stage_id,
        data.reviewer_id,
        data.deadline
    )

    return {
        "success": True,
        "message": "Reviewer assigned successfully",
        "review_id": review.id,
        "status": review.status,
        "deadline": review.deadline.isoformat() if review.deadline else None,
    }


@router.post("/api/review/forms/{form_id}/stages/{stage_id}/start")
def start_stage_review(
    form_id: int,
    stage_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Start working on a stage review."""
    if user_role not in ["admin", "reviewer"]:
        raise HTTPException(status_code=403, detail="Reviewer access required")

    # Find the review for this form and stage
    from app.models.review import FormReview
    review = db.query(FormReview).filter(
        FormReview.form_instance_id == form_id,
        FormReview.review_stage_id == stage_id
    ).first()

    if not review:
        raise HTTPException(status_code=404, detail="Review not found for this stage")

    # Verify the user is assigned to this review
    if review.reviewer_id and review.reviewer_id != user_id:
        raise HTTPException(status_code=403, detail="You are not assigned to this review")

    updated_review = review_workflow_service.start_stage_review(db, review.id)

    return {
        "success": True,
        "message": "Review started",
        "review_id": updated_review.id,
        "status": updated_review.status,
        "started_at": updated_review.started_at.isoformat() if updated_review.started_at else None,
    }


@router.post("/api/review/forms/{form_id}/stages/{stage_id}/complete")
def complete_stage_review(
    form_id: int,
    stage_id: int,
    data: StageCompletionRequest,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Complete a stage review with a decision."""
    if user_role not in ["admin", "reviewer"]:
        raise HTTPException(status_code=403, detail="Reviewer access required")

    # Find the review for this form and stage
    from app.models.review import FormReview
    review = db.query(FormReview).filter(
        FormReview.form_instance_id == form_id,
        FormReview.review_stage_id == stage_id
    ).first()

    if not review:
        raise HTTPException(status_code=404, detail="Review not found for this stage")

    # Verify the user is assigned to this review (unless admin)
    if user_role != "admin" and review.reviewer_id and review.reviewer_id != user_id:
        raise HTTPException(status_code=403, detail="You are not assigned to this review")

    updated_review = review_workflow_service.complete_stage_review(
        db,
        review.id,
        data.status,
        data.comments
    )

    # Get updated form status
    from app.models.form import FormInstance
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()

    return {
        "success": True,
        "message": f"Stage review completed with status: {data.status}",
        "review_id": updated_review.id,
        "review_status": updated_review.status,
        "form_status": form.status if form else None,
        "completed_at": updated_review.completed_at.isoformat() if updated_review.completed_at else None,
    }


@router.post("/api/review/forms/{form_id}/advance")
def advance_form_to_next_stage(
    form_id: int,
    reviewer_id: Optional[UUID] = None,
    db: Session = Depends(get_db),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Advance form to the next review stage (admin/reviewer only)."""
    if user_role not in ["admin", "reviewer"]:
        raise HTTPException(status_code=403, detail="Admin or reviewer access required")

    review = review_workflow_service.advance_to_next_stage(db, form_id, reviewer_id)

    if review is None:
        return {
            "success": True,
            "message": "All stages completed",
            "review_id": None,
            "next_stage": None,
        }

    # Get stage info
    stage = review_workflow_service.get_stage(db, review.review_stage_id)

    return {
        "success": True,
        "message": f"Advanced to stage: {stage.name if stage else 'Unknown'}",
        "review_id": review.id,
        "next_stage": {
            "id": stage.id if stage else None,
            "code": stage.code if stage else None,
            "name": stage.name if stage else None,
        },
        "status": review.status,
    }
