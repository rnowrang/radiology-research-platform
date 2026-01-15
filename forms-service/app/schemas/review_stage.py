"""Pydantic schemas for review stages and workflow."""

from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field
from uuid import UUID


# =============================================================================
# Review Stage Schemas
# =============================================================================

class ReviewStageBase(BaseModel):
    """Base review stage schema."""
    code: str = Field(..., min_length=1, max_length=50, description="Unique code for the stage")
    name: str = Field(..., min_length=1, max_length=255, description="Display name for the stage")
    description: Optional[str] = Field(None, description="Stage description")
    sequence_order: int = Field(..., ge=0, description="Order in the workflow sequence")
    default_deadline_days: int = Field(7, ge=1, description="Default deadline in days")
    requires_all_previous: bool = Field(True, description="Whether all previous stages must be completed")
    is_active: bool = Field(True, description="Whether the stage is active")


class ReviewStageCreate(ReviewStageBase):
    """Schema for creating a review stage."""
    pass


class ReviewStageUpdate(BaseModel):
    """Schema for updating a review stage."""
    code: Optional[str] = Field(None, min_length=1, max_length=50)
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    sequence_order: Optional[int] = Field(None, ge=0)
    default_deadline_days: Optional[int] = Field(None, ge=1)
    requires_all_previous: Optional[bool] = None
    is_active: Optional[bool] = None


class ReviewStageResponse(ReviewStageBase):
    """Schema for review stage response."""
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ReviewStageReorderRequest(BaseModel):
    """Request to reorder review stages."""
    stage_ids: List[int] = Field(..., description="Ordered list of stage IDs")


# =============================================================================
# Form Review Progress Schemas
# =============================================================================

class StageReviewInfo(BaseModel):
    """Information about a form's review status at a specific stage."""
    stage_id: int
    stage_code: str
    stage_name: str
    sequence_order: int
    review_id: Optional[int] = None
    reviewer_id: Optional[UUID] = None
    reviewer_name: Optional[str] = None
    status: str = "not_started"  # not_started, pending, assigned, in_progress, approved, rejected, revision_required
    deadline: Optional[date] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    overall_comments: Optional[str] = None


class ReviewProgressResponse(BaseModel):
    """Response showing review progress across all stages."""
    form_id: int
    form_title: str
    form_status: str
    current_stage_id: Optional[int] = None
    current_stage_name: Optional[str] = None
    stages: List[StageReviewInfo] = []
    completed_stages: int = 0
    total_stages: int = 0
    progress_percentage: float = 0.0


# =============================================================================
# Stage Assignment Schemas
# =============================================================================

class StageAssignmentRequest(BaseModel):
    """Request to assign a reviewer to a stage."""
    reviewer_id: UUID = Field(..., description="ID of the reviewer to assign")
    deadline: Optional[date] = Field(None, description="Review deadline")


class StageCompletionRequest(BaseModel):
    """Request to complete a stage review."""
    status: str = Field(..., description="Completion status: approved, rejected, revision_required")
    comments: Optional[str] = Field(None, description="Overall review comments")


class FormReviewResponse(BaseModel):
    """Response for a form review record."""
    id: int
    form_instance_id: int
    review_stage_id: Optional[int] = None
    stage_code: Optional[str] = None
    stage_name: Optional[str] = None
    reviewer_id: Optional[UUID] = None
    reviewer_name: Optional[str] = None
    status: str = "pending"
    deadline: Optional[date] = None
    overall_comments: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
