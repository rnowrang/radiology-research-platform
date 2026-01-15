"""Form management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from app.database import get_db
from app.models.template import Template
from app.models.form import FormInstance, FormData, FormVersion
from app.models.audit import FieldChange
from app.schemas.form import (
    FormInstanceCreate,
    FormInstanceUpdate,
    FormInstanceResponse,
    FormDataUpdate,
    FormListResponse,
)

router = APIRouter(prefix="/api/forms", tags=["forms"])


@router.get("", response_model=List[FormListResponse])
async def get_forms(
    owner_id: Optional[UUID] = None,
    status: Optional[str] = None,
    template_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Get forms with optional filters."""
    query = db.query(FormInstance)

    if owner_id:
        query = query.filter(FormInstance.owner_id == owner_id)
    if status:
        query = query.filter(FormInstance.status == status)
    if template_id:
        query = query.filter(FormInstance.template_id == template_id)

    forms = query.order_by(FormInstance.created_at.desc()).all()

    # Add template names
    result = []
    for form in forms:
        form_dict = {
            "id": form.id,
            "template_id": form.template_id,
            "owner_id": form.owner_id,
            "title": form.title,
            "status": form.status,
            "current_version_number": form.current_version_number,
            "completion_percentage": form.completion_percentage,
            "created_at": form.created_at,
            "updated_at": form.updated_at,
            "template_name": form.template.name if form.template else None,
        }
        result.append(form_dict)

    return result


@router.post("", response_model=FormInstanceResponse, status_code=status.HTTP_201_CREATED)
async def create_form(
    form_data: FormInstanceCreate,
    db: Session = Depends(get_db),
):
    """Create a new form instance."""
    # Verify template exists
    template = db.query(Template).filter(Template.id == form_data.template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    # Create form instance
    form = FormInstance(
        template_id=form_data.template_id,
        owner_id=form_data.owner_id,
        title=form_data.title,
        project_id=form_data.project_id,
        status="draft",
    )
    db.add(form)
    db.flush()

    # Create empty form data
    form_data_record = FormData(
        form_instance_id=form.id,
        data={},
        conditional_state={},
    )
    db.add(form_data_record)

    # Create initial version
    version = FormVersion(
        form_instance_id=form.id,
        version_number=1,
        version_label="Initial",
        data_snapshot={},
        status_at_creation="draft",
        created_by_id=form_data.owner_id,
    )
    db.add(version)

    db.commit()
    db.refresh(form)

    return {
        **form.__dict__,
        "data": {},
        "template_name": template.name,
    }


@router.get("/{form_id}", response_model=FormInstanceResponse)
async def get_form(
    form_id: int,
    db: Session = Depends(get_db),
):
    """Get a form instance with its data."""
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Get form data
    form_data = db.query(FormData).filter(FormData.form_instance_id == form_id).first()

    return {
        **form.__dict__,
        "data": form_data.data if form_data else {},
        "template_name": form.template.name if form.template else None,
    }


@router.put("/{form_id}", response_model=FormInstanceResponse)
async def update_form(
    form_id: int,
    form_update: FormInstanceUpdate,
    db: Session = Depends(get_db),
):
    """Update form metadata."""
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    update_data = form_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(form, field, value)

    db.commit()
    db.refresh(form)

    form_data = db.query(FormData).filter(FormData.form_instance_id == form_id).first()

    return {
        **form.__dict__,
        "data": form_data.data if form_data else {},
        "template_name": form.template.name if form.template else None,
    }


@router.post("/{form_id}/data")
async def update_form_data(
    form_id: int,
    data_update: FormDataUpdate,
    db: Session = Depends(get_db),
):
    """Update form field data (autosave)."""
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Check form is editable
    if form.status not in ["draft", "needs_changes"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Form is not editable in current status",
        )

    # Get or create form data
    form_data = db.query(FormData).filter(FormData.form_instance_id == form_id).first()
    if not form_data:
        form_data = FormData(form_instance_id=form_id, data={})
        db.add(form_data)

    current_data = form_data.data or {}

    # Apply changes and create audit trail
    for change in data_update.changes:
        # Create field change record
        field_change = FieldChange(
            form_instance_id=form_id,
            user_id=data_update.user_id,
            field_id=change.field_id,
            field_label=change.field_label,
            old_value=change.old_value,
            new_value=change.new_value,
        )
        db.add(field_change)

        # Update data (handle nested keys)
        keys = change.field_id.split(".")
        if len(keys) == 1:
            current_data[change.field_id] = change.new_value
        else:
            # Nested key handling
            parent = current_data
            for key in keys[:-1]:
                if key not in parent:
                    parent[key] = {}
                parent = parent[key]
            parent[keys[-1]] = change.new_value

    form_data.data = current_data
    db.commit()
    db.refresh(form_data)

    return {
        "success": True,
        "data": form_data.data,
    }


@router.delete("/{form_id}")
async def delete_form(
    form_id: int,
    db: Session = Depends(get_db),
):
    """Delete a form instance."""
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Only allow deletion of drafts
    if form.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft forms can be deleted",
        )

    db.delete(form)
    db.commit()

    return {"success": True, "message": "Form deleted"}
