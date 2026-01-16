"""Audit endpoints for field-level change tracking."""

from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.audit import FieldChange
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/api/audit", tags=["audit"])


class FieldChangeResponse(BaseModel):
    id: int
    form_instance_id: int
    version_id: Optional[int]
    user_id: str
    field_id: str
    field_label: Optional[str]
    old_value: Optional[dict]
    new_value: Optional[dict]
    action_type: str
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/form/{form_id}", response_model=List[FieldChangeResponse])
def get_form_audit_log(
    form_id: int,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """Get all field changes for a form."""
    changes = db.query(FieldChange).filter(
        FieldChange.form_instance_id == form_id
    ).order_by(FieldChange.created_at.desc()).offset(offset).limit(limit).all()
    return changes


@router.get("/form/{form_id}/field/{field_id}", response_model=List[FieldChangeResponse])
def get_field_history(
    form_id: int,
    field_id: str,
    db: Session = Depends(get_db),
):
    """Get change history for a specific field."""
    changes = db.query(FieldChange).filter(
        FieldChange.form_instance_id == form_id,
        FieldChange.field_id == field_id
    ).order_by(FieldChange.created_at.desc()).all()
    return changes
