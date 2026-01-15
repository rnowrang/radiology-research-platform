"""Form version management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.form import FormInstance, FormData, FormVersion
from app.schemas.form import FormVersionCreate, FormVersionResponse

router = APIRouter(prefix="/api/versions", tags=["versions"])


@router.get("/form/{form_id}", response_model=List[FormVersionResponse])
async def get_form_versions(
    form_id: int,
    db: Session = Depends(get_db),
):
    """Get all versions of a form."""
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    versions = (
        db.query(FormVersion)
        .filter(FormVersion.form_instance_id == form_id)
        .order_by(FormVersion.version_number.desc())
        .all()
    )
    return versions


@router.get("/{version_id}", response_model=FormVersionResponse)
async def get_version(
    version_id: int,
    db: Session = Depends(get_db),
):
    """Get a specific version."""
    version = db.query(FormVersion).filter(FormVersion.id == version_id).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found",
        )
    return version


@router.post("/form/{form_id}/create", response_model=FormVersionResponse, status_code=status.HTTP_201_CREATED)
async def create_version(
    form_id: int,
    version_data: FormVersionCreate,
    db: Session = Depends(get_db),
):
    """Create a new version snapshot."""
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Get current form data
    form_data = db.query(FormData).filter(FormData.form_instance_id == form_id).first()
    data_snapshot = form_data.data if form_data else {}
    conditional_state = form_data.conditional_state if form_data else {}

    # Get next version number
    max_version = (
        db.query(FormVersion)
        .filter(FormVersion.form_instance_id == form_id)
        .order_by(FormVersion.version_number.desc())
        .first()
    )
    next_version_number = (max_version.version_number + 1) if max_version else 1

    # Create version
    version = FormVersion(
        form_instance_id=form_id,
        version_number=next_version_number,
        version_label=version_data.version_label,
        data_snapshot=data_snapshot,
        conditional_state_snapshot=conditional_state,
        status_at_creation=form.status,
        created_by_id=version_data.user_id,
    )
    db.add(version)

    # Update form's current version number
    form.current_version_number = next_version_number

    db.commit()
    db.refresh(version)
    return version
