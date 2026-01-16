"""Task schemas for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID


class TaskBase(BaseModel):
    """Base schema for task."""
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    task_type: Optional[str] = Field(None, pattern="^(document_upload|form_completion|review|approval|approval_required|general)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    due_date: Optional[date] = None


class TaskCreate(TaskBase):
    """Schema for creating a task."""
    project_id: Optional[UUID] = None
    form_instance_id: Optional[int] = None
    assigned_to_id: Optional[UUID] = None
    task_definition_id: Optional[int] = None
    is_required: bool = True


class TaskUpdate(BaseModel):
    """Schema for updating a task."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    task_type: Optional[str] = Field(None, pattern="^(document_upload|form_completion|review|approval|approval_required|general)$")
    status: Optional[str] = Field(None, pattern="^(pending|in_progress|submitted|approved|rejected|revision_required|completed|blocked|cancelled)$")
    priority: Optional[str] = Field(None, pattern="^(low|medium|high|urgent)$")
    due_date: Optional[date] = None
    assigned_to_id: Optional[UUID] = None
    is_required: Optional[bool] = None


class TaskResponse(TaskBase):
    """Schema for task response."""
    id: int
    project_id: Optional[UUID] = None
    form_instance_id: Optional[int] = None
    assigned_to_id: Optional[UUID] = None
    created_by_id: UUID
    task_definition_id: Optional[int] = None
    status: str
    is_required: bool = True
    completed_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    reviewed_by_id: Optional[UUID] = None
    reviewer_comments: Optional[str] = None
    revision_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TaskListResponse(BaseModel):
    """Schema for task list item."""
    id: int
    title: str
    description: Optional[str] = None
    task_type: Optional[str] = None
    status: str
    priority: str
    due_date: Optional[date] = None
    project_id: Optional[UUID] = None
    project_title: Optional[str] = None
    form_instance_id: Optional[int] = None
    form_title: Optional[str] = None
    assigned_to_id: Optional[UUID] = None
    created_by_id: UUID
    task_definition_id: Optional[int] = None
    is_required: bool = True
    completed_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    reviewer_comments: Optional[str] = None
    revision_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# Review Workflow Schemas
# =============================================================================

class TaskSubmitRequest(BaseModel):
    """Schema for submitting a task for review."""
    comments: Optional[str] = None


class TaskApproveRequest(BaseModel):
    """Schema for approving a task."""
    comments: Optional[str] = None


class TaskRejectRequest(BaseModel):
    """Schema for rejecting a task."""
    comments: str = Field(..., min_length=1)


class TaskRevisionRequest(BaseModel):
    """Schema for requesting task revision."""
    comments: str = Field(..., min_length=1)


class PendingReviewItem(BaseModel):
    """Schema for a task pending review."""
    id: int
    title: str
    description: Optional[str] = None
    task_type: Optional[str] = None
    status: str
    priority: str
    project_id: Optional[UUID] = None
    project_title: Optional[str] = None
    submitted_at: Optional[datetime] = None
    created_by_id: UUID
    revision_count: int = 0

    class Config:
        from_attributes = True


# =============================================================================
# Create Form for Task
# =============================================================================

class CreateFormForTaskRequest(BaseModel):
    """Schema for creating a form instance for a task."""
    template_id: int = Field(..., description="ID of the template to use for the form")


class CreateFormForTaskResponse(BaseModel):
    """Schema for the response after creating a form for a task."""
    success: bool = True
    message: str
    task_id: int
    form_instance_id: int
    task_status: str

    class Config:
        from_attributes = True
