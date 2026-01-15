"""Task schemas for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID


class TaskBase(BaseModel):
    """Base schema for task."""
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    task_type: Optional[str] = Field(None, pattern="^(document_upload|form_completion|review|approval|general)$")
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    due_date: Optional[date] = None


class TaskCreate(TaskBase):
    """Schema for creating a task."""
    project_id: Optional[UUID] = None
    form_instance_id: Optional[int] = None
    assigned_to_id: Optional[UUID] = None


class TaskUpdate(BaseModel):
    """Schema for updating a task."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    task_type: Optional[str] = Field(None, pattern="^(document_upload|form_completion|review|approval|general)$")
    status: Optional[str] = Field(None, pattern="^(pending|in_progress|completed|blocked|cancelled)$")
    priority: Optional[str] = Field(None, pattern="^(low|medium|high|urgent)$")
    due_date: Optional[date] = None
    assigned_to_id: Optional[UUID] = None


class TaskResponse(TaskBase):
    """Schema for task response."""
    id: int
    project_id: Optional[UUID] = None
    form_instance_id: Optional[int] = None
    assigned_to_id: Optional[UUID] = None
    created_by_id: UUID
    status: str
    completed_at: Optional[datetime] = None
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
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
