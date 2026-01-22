"""Form management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status, Header
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm.attributes import flag_modified

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


def get_nested_value(data: dict, key: str):
    """
    Get a value from nested dict using dot notation.

    Example: get_nested_value({"a": {"b": 1}}, "a.b") returns 1
    """
    if not data or not key:
        return None

    keys = key.split(".")
    value = data

    for k in keys:
        if isinstance(value, dict) and k in value:
            value = value[k]
        else:
            return None

    return value


def calculate_completion_percentage(template_schema: dict, form_data: dict) -> int:
    """
    Calculate completion percentage based on required fields.

    Args:
        template_schema: The template schema containing sections and fields
        form_data: The current form data

    Returns:
        Completion percentage (0-100)
    """
    if not template_schema:
        return 0

    if not form_data:
        return 0

    required_fields = []

    # Extract required fields from schema
    sections = template_schema.get("sections", [])
    fields = template_schema.get("fields", [])

    # Check if fields are nested in sections or flat
    if sections and sections[0].get("fields"):
        # Fields are nested in sections
        for section in sections:
            for field in section.get("fields", []):
                if field.get("required", False):
                    required_fields.append(field.get("id"))
    else:
        # Fields are flat with section_id references
        for field in fields:
            if field.get("required", False):
                required_fields.append(field.get("id"))

    if not required_fields:
        return 100  # No required fields means 100% complete

    # Count filled required fields
    filled_count = 0
    for field_id in required_fields:
        # Use nested lookup for dot notation field IDs (e.g., "investigator.pi_name")
        value = get_nested_value(form_data, field_id)

        # Check if field has a meaningful value
        if value is not None and value != "" and value != [] and value != {}:
            filled_count += 1

    return int((filled_count / len(required_fields)) * 100)


@router.get("", response_model=List[FormListResponse])
async def get_forms(
    owner_id: Optional[UUID] = None,
    project_id: Optional[UUID] = None,
    status: Optional[str] = None,
    template_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """Get forms with optional filters."""
    query = db.query(FormInstance)

    if owner_id:
        query = query.filter(FormInstance.owner_id == owner_id)
    if project_id:
        query = query.filter(FormInstance.project_id == project_id)
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


def transform_schema_for_frontend(schema: dict) -> dict:
    """Transform schema to nest fields within their sections."""
    if not schema:
        return {"sections": []}

    sections = schema.get("sections", [])
    fields = schema.get("fields", [])

    # If fields are already nested in sections, return as-is
    if sections and sections[0].get("fields"):
        return schema

    # Group fields by section_id
    fields_by_section = {}
    for field in fields:
        section_id = field.get("section_id")
        if section_id not in fields_by_section:
            fields_by_section[section_id] = []
        fields_by_section[section_id].append(field)

    # Sort fields within each section by order
    for section_id in fields_by_section:
        fields_by_section[section_id].sort(key=lambda f: f.get("order", 0))

    # Attach fields to sections
    transformed_sections = []
    for section in sorted(sections, key=lambda s: s.get("order", 0)):
        section_copy = dict(section)
        section_copy["fields"] = fields_by_section.get(section["id"], [])
        transformed_sections.append(section_copy)

    return {
        "title": schema.get("title", ""),
        "description": schema.get("description", ""),
        "sections": transformed_sections,
        "rules": schema.get("rules", []),
    }


@router.get("/{form_id}")
async def get_form(
    form_id: int,
    db: Session = Depends(get_db),
):
    """Get a form instance with its data and template schema."""
    from sqlalchemy import text
    from app.models.project import Project

    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Get form data
    form_data = db.query(FormData).filter(FormData.form_instance_id == form_id).first()

    # Get owner information from users table
    owner_name = None
    owner_email = None
    if form.owner_id:
        query = text("""
            SELECT full_name, email FROM users
            WHERE id = :owner_id
            LIMIT 1
        """)
        row = db.execute(query, {"owner_id": str(form.owner_id)}).fetchone()
        if row:
            owner_name = row[0]
            owner_email = row[1]

    # Get project title if project_id exists
    project_title = None
    if form.project_id:
        project = db.query(Project).filter(Project.id == form.project_id).first()
        if project:
            project_title = project.title

    # Build template object with transformed schema
    template_obj = None
    if form.template:
        transformed_schema = transform_schema_for_frontend(form.template.schema)
        template_obj = {
            "id": form.template.id,
            "name": form.template.name,
            "description": form.template.description,
            "version": form.template.version,
            "schema": transformed_schema,
        }

    return {
        "id": form.id,
        "template_id": form.template_id,
        "project_id": form.project_id,
        "owner_id": str(form.owner_id),
        "owner_name": owner_name,
        "owner_email": owner_email,
        "project_title": project_title,
        "title": form.title,
        "status": form.status,
        "current_version_number": form.current_version_number,
        "completion_percentage": form.completion_percentage,
        "submitted_at": form.submitted_at,
        "approved_at": form.approved_at,
        "created_at": form.created_at,
        "updated_at": form.updated_at,
        "data": form_data.data if form_data else {},
        "conditional_state": form_data.conditional_state if form_data else {},
        "template": template_obj,
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
            section_id=data_update.section_id,
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
    flag_modified(form_data, "data")  # Tell SQLAlchemy the JSONB column was modified

    # Recalculate completion percentage
    if form.template and form.template.schema:
        new_completion = calculate_completion_percentage(form.template.schema, current_data)
        form.completion_percentage = new_completion

    db.commit()
    db.refresh(form_data)
    db.refresh(form)

    return {
        "success": True,
        "data": form_data.data,
        "completion_percentage": form.completion_percentage,
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
