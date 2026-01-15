"""Pydantic schemas for review and collaboration."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from uuid import UUID


# =============================================================================
# Review Action Schemas
# =============================================================================

class ReviewActionBase(BaseModel):
    """Base review action schema."""
    action_type: str = Field(..., description="Type of action: submit_for_review, request_changes, approve, reject, return_to_draft")
    notes: Optional[str] = Field(None, description="Optional notes for the action")


class ReviewActionCreate(ReviewActionBase):
    """Schema for creating a review action."""
    pass


class ReviewActionResponse(ReviewActionBase):
    """Schema for review action response."""
    id: int
    form_instance_id: int
    version_id: Optional[int] = None
    performed_by_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Comment Schemas
# =============================================================================

class CommentBase(BaseModel):
    """Base comment schema."""
    content: str = Field(..., min_length=1, description="Comment content")


class CommentCreate(CommentBase):
    """Schema for creating a comment."""
    field_id: Optional[str] = Field(None, description="ID of the field being commented on")
    section_id: Optional[str] = Field(None, description="ID of the section being commented on")
    parent_comment_id: Optional[int] = Field(None, description="ID of parent comment for replies")


class CommentUpdate(BaseModel):
    """Schema for updating a comment."""
    content: str = Field(..., min_length=1)


class CommentResponse(CommentBase):
    """Schema for comment response."""
    id: int
    thread_id: int
    parent_comment_id: Optional[int] = None
    author_id: UUID
    author_name: Optional[str] = None  # Populated by join
    is_edited: bool = False
    is_deleted: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    replies: List["CommentResponse"] = []

    class Config:
        from_attributes = True


# =============================================================================
# Comment Thread Schemas
# =============================================================================

class CommentThreadBase(BaseModel):
    """Base comment thread schema."""
    field_id: Optional[str] = None
    section_id: Optional[str] = None


class CommentThreadCreate(CommentThreadBase):
    """Schema for creating a comment thread."""
    content: str = Field(..., min_length=1, description="Initial comment content")


class CommentThreadResponse(CommentThreadBase):
    """Schema for comment thread response."""
    id: int
    form_instance_id: int
    is_resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by_id: Optional[UUID] = None
    created_at: datetime
    comments: List[CommentResponse] = []
    comment_count: Optional[int] = None

    class Config:
        from_attributes = True


# =============================================================================
# Form Review Schemas
# =============================================================================

class FormReviewBase(BaseModel):
    """Base form review schema."""
    reviewer_id: Optional[UUID] = None
    deadline: Optional[datetime] = None
    overall_comments: Optional[str] = None


class FormReviewCreate(FormReviewBase):
    """Schema for creating a form review."""
    pass


class FormReviewResponse(FormReviewBase):
    """Schema for form review response."""
    id: int
    form_instance_id: int
    review_stage_id: Optional[int] = None
    status: str = "pending"
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Review Queue Item
# =============================================================================

class ReviewQueueItem(BaseModel):
    """Schema for items in the review queue."""
    id: int
    title: str
    template_name: str
    template_version: str
    owner_id: UUID
    owner_name: Optional[str] = None
    status: str
    submitted_at: Optional[datetime] = None
    current_version_number: int
    unresolved_comments: int = 0

    class Config:
        from_attributes = True


# =============================================================================
# Status Change Schemas
# =============================================================================

class SubmitForReviewRequest(BaseModel):
    """Request to submit form for review."""
    notes: Optional[str] = Field(None, description="Optional submission notes")


class RequestChangesRequest(BaseModel):
    """Request to request changes on a form."""
    notes: str = Field(..., min_length=1, description="Notes explaining required changes")


class ApproveFormRequest(BaseModel):
    """Request to approve a form."""
    notes: Optional[str] = Field(None, description="Optional approval notes")


class RejectFormRequest(BaseModel):
    """Request to reject a form."""
    notes: str = Field(..., min_length=1, description="Reason for rejection")


class ReturnToDraftRequest(BaseModel):
    """Request to return form to draft."""
    notes: Optional[str] = Field(None, description="Optional notes")


# Update forward references
CommentResponse.model_rebuild()
