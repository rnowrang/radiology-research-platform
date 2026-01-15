"""Task definition schemas for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# =============================================================================
# Task Definition Schemas
# =============================================================================

class TaskDefinitionBase(BaseModel):
    """Base schema for task definition."""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    task_type: str = Field(..., pattern="^(document_upload|form_completion|approval_required)$")
    auto_submit: bool = False
    default_required: bool = True
    display_order: int = 0


class TaskDefinitionCreate(TaskDefinitionBase):
    """Schema for creating a task definition."""
    pass


class TaskDefinitionUpdate(BaseModel):
    """Schema for updating a task definition."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    task_type: Optional[str] = Field(None, pattern="^(document_upload|form_completion|approval_required)$")
    auto_submit: Optional[bool] = None
    default_required: Optional[bool] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class TaskDefinitionResponse(TaskDefinitionBase):
    """Schema for task definition response."""
    id: int
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TaskDefinitionListResponse(BaseModel):
    """Schema for task definition list item."""
    id: int
    name: str
    description: Optional[str] = None
    task_type: str
    auto_submit: bool
    default_required: bool
    display_order: int
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# Project Type Task Mapping Schemas
# =============================================================================

class ProjectTypeTaskMappingBase(BaseModel):
    """Base schema for project type task mapping."""
    project_type: str = Field(..., min_length=1, max_length=100)
    task_definition_id: int
    is_required: bool = True
    display_order: int = 0


class ProjectTypeTaskMappingCreate(ProjectTypeTaskMappingBase):
    """Schema for creating a project type task mapping."""
    pass


class ProjectTypeTaskMappingResponse(ProjectTypeTaskMappingBase):
    """Schema for project type task mapping response."""
    id: int
    created_at: Optional[datetime] = None
    task_definition: Optional[TaskDefinitionListResponse] = None

    class Config:
        from_attributes = True


class ProjectTypeTaskMappingListResponse(BaseModel):
    """Schema for listing mappings with task definition details."""
    id: int
    project_type: str
    task_definition_id: int
    task_definition_name: str
    task_definition_description: Optional[str] = None
    task_type: str
    is_required: bool
    display_order: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =============================================================================
# Task Progress Schemas
# =============================================================================

class TaskProgressItem(BaseModel):
    """Schema for a single task in progress response."""
    task_id: int
    task_definition_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    task_type: Optional[str] = None
    status: str
    is_required: bool
    display_order: int
    submitted_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    reviewer_comments: Optional[str] = None
    revision_count: int = 0


class ProjectTaskProgress(BaseModel):
    """Schema for project task completion progress."""
    project_id: str
    total_tasks: int
    completed_tasks: int
    pending_tasks: int
    in_progress_tasks: int
    submitted_tasks: int
    approved_tasks: int
    rejected_tasks: int
    revision_required_tasks: int
    completion_percentage: float
    tasks: List[TaskProgressItem]
