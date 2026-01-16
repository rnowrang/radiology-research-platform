"""Project schemas for request/response validation."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID


class ProjectCollaboratorBase(BaseModel):
    """Base schema for project collaborator."""
    user_id: UUID
    role: str = Field(..., pattern="^(co_investigator|research_assistant|coordinator|viewer)$")


class ProjectCollaboratorCreate(ProjectCollaboratorBase):
    """Schema for creating a project collaborator."""
    pass


class ProjectCollaboratorResponse(ProjectCollaboratorBase):
    """Schema for project collaborator response."""
    id: UUID
    project_id: UUID
    added_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    """Base schema for project."""
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    project_type: Optional[str] = None
    department: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_public: bool = False


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""
    id: Optional[UUID] = None  # Optional ID from gateway for syncing
    principal_investigator_id: Optional[UUID] = None  # Will be set from auth context if not provided


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    description: Optional[str] = None
    project_type: Optional[str] = None
    department: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(draft|active|completed|archived)$")
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    is_public: Optional[bool] = None


class ProjectResponse(ProjectBase):
    """Schema for project response."""
    id: UUID
    principal_investigator_id: UUID
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    collaborators: List[ProjectCollaboratorResponse] = []
    form_count: int = 0

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    """Schema for project list item."""
    id: UUID
    title: str
    description: Optional[str] = None
    project_type: Optional[str] = None
    department: Optional[str] = None
    principal_investigator_id: UUID
    status: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    created_at: Optional[datetime] = None
    form_count: int = 0
    collaborator_count: int = 0

    class Config:
        from_attributes = True
