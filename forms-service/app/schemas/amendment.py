"""Pydantic schemas for amendments."""

from pydantic import BaseModel
from typing import Optional, Any, List
from datetime import datetime
from uuid import UUID
from enum import Enum


class AmendmentType(str, Enum):
    """Supported amendment types."""
    PROTOCOL_CHANGE = "protocol_change"
    PERSONNEL_CHANGE = "personnel_change"
    FUNDING_CHANGE = "funding_change"
    SITE_CHANGE = "site_change"
    PROCEDURE_CHANGE = "procedure_change"
    CONSENT_UPDATE = "consent_update"
    OTHER = "other"


class AmendmentStatus(str, Enum):
    """Amendment status values."""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


# Field Change Schemas
class AmendmentFieldChangeCreate(BaseModel):
    """Schema for creating a field change."""
    field_id: str
    field_label: Optional[str] = None
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    justification: Optional[str] = None


class AmendmentFieldChangeUpdate(BaseModel):
    """Schema for updating a field change."""
    field_label: Optional[str] = None
    old_value: Optional[Any] = None
    new_value: Optional[Any] = None
    justification: Optional[str] = None


class AmendmentFieldChangeResponse(BaseModel):
    """Schema for field change response."""
    id: int
    amendment_id: int
    field_id: str
    field_label: Optional[str]
    old_value: Optional[Any]
    new_value: Optional[Any]
    justification: Optional[str]

    class Config:
        from_attributes = True


# Amendment Schemas
class AmendmentCreate(BaseModel):
    """Schema for creating an amendment."""
    amendment_type: AmendmentType
    description: Optional[str] = None


class AmendmentUpdate(BaseModel):
    """Schema for updating an amendment."""
    amendment_type: Optional[AmendmentType] = None
    description: Optional[str] = None


class AmendmentResponse(BaseModel):
    """Schema for amendment response."""
    id: int
    form_instance_id: int
    amendment_type: str
    status: str
    description: Optional[str]
    submitted_at: Optional[datetime]
    submitted_by_id: Optional[UUID]
    reviewed_at: Optional[datetime]
    reviewed_by_id: Optional[UUID]
    review_notes: Optional[str]
    created_at: datetime
    created_by_id: UUID

    class Config:
        from_attributes = True


class AmendmentWithChangesResponse(AmendmentResponse):
    """Schema for amendment with field changes."""
    field_changes: List[AmendmentFieldChangeResponse] = []

    class Config:
        from_attributes = True


class AmendmentListResponse(BaseModel):
    """Schema for amendment list item."""
    id: int
    form_instance_id: int
    amendment_type: str
    status: str
    description: Optional[str]
    submitted_at: Optional[datetime]
    reviewed_at: Optional[datetime]
    created_at: datetime
    field_changes_count: int = 0

    class Config:
        from_attributes = True


# Request Schemas
class SubmitAmendmentRequest(BaseModel):
    """Schema for submitting an amendment."""
    pass  # User ID comes from header


class ApproveAmendmentRequest(BaseModel):
    """Schema for approving an amendment."""
    notes: Optional[str] = None


class RejectAmendmentRequest(BaseModel):
    """Schema for rejecting an amendment."""
    notes: str


class WithdrawAmendmentRequest(BaseModel):
    """Schema for withdrawing an amendment."""
    pass  # User ID comes from header
