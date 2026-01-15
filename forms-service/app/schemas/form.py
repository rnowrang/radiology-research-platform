"""Pydantic schemas for forms."""

from pydantic import BaseModel
from typing import Optional, Any, Dict, List
from datetime import datetime
from uuid import UUID


class FieldChange(BaseModel):
    """Schema for a field change."""
    field_id: str
    field_label: Optional[str] = None
    old_value: Optional[Any] = None
    new_value: Any


class FormDataUpdate(BaseModel):
    """Schema for updating form data."""
    changes: List[FieldChange]
    user_id: UUID


class FormInstanceCreate(BaseModel):
    """Schema for creating a form instance."""
    template_id: int
    title: str
    owner_id: UUID
    project_id: Optional[UUID] = None


class FormInstanceUpdate(BaseModel):
    """Schema for updating a form instance."""
    title: Optional[str] = None
    status: Optional[str] = None


class FormVersionCreate(BaseModel):
    """Schema for creating a form version."""
    version_label: Optional[str] = None
    user_id: UUID


class FormVersionResponse(BaseModel):
    """Schema for form version response."""
    id: int
    form_instance_id: int
    version_number: int
    version_label: Optional[str]
    data_snapshot: Dict[str, Any]
    status_at_creation: Optional[str]
    change_summary: Optional[str]
    generated_docx_path: Optional[str]
    generated_pdf_path: Optional[str]
    created_by_id: Optional[UUID]
    created_at: datetime

    class Config:
        from_attributes = True


class FormInstanceResponse(BaseModel):
    """Schema for form instance response."""
    id: int
    template_id: int
    project_id: Optional[UUID]
    owner_id: UUID
    title: str
    status: str
    current_version_number: int
    completion_percentage: int
    submitted_at: Optional[datetime]
    approved_at: Optional[datetime]
    created_at: datetime
    updated_at: Optional[datetime]
    data: Optional[Dict[str, Any]] = None
    template_name: Optional[str] = None

    class Config:
        from_attributes = True


class FormListResponse(BaseModel):
    """Schema for form list item."""
    id: int
    template_id: int
    owner_id: UUID
    title: str
    status: str
    current_version_number: int
    completion_percentage: int
    created_at: datetime
    updated_at: Optional[datetime]
    template_name: Optional[str] = None

    class Config:
        from_attributes = True
