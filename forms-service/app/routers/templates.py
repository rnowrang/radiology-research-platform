"""Template management endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models.template import Template
from app.schemas.template import TemplateResponse, TemplateCreate, TemplateUpdate

router = APIRouter(prefix="/api/templates", tags=["templates"])


@router.get("", response_model=List[TemplateResponse])
async def get_templates(
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    """Get all templates."""
    query = db.query(Template)
    if active_only:
        query = query.filter(Template.is_active == True)
    templates = query.order_by(Template.name).all()
    return templates


@router.get("/published", response_model=List[TemplateResponse])
async def get_published_templates(db: Session = Depends(get_db)):
    """Get published templates only."""
    templates = (
        db.query(Template)
        .filter(Template.is_active == True, Template.is_published == True)
        .order_by(Template.name)
        .all()
    )
    return templates


@router.get("/{template_id}", response_model=TemplateResponse)
async def get_template(template_id: int, db: Session = Depends(get_db)):
    """Get a single template by ID."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )
    return template


@router.post("", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(
    template_data: TemplateCreate,
    db: Session = Depends(get_db),
):
    """Create a new template."""
    template = Template(
        name=template_data.name,
        description=template_data.description,
        version=template_data.version,
        schema=template_data.schema.model_dump(),
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/{template_id}", response_model=TemplateResponse)
async def update_template(
    template_id: int,
    template_data: TemplateUpdate,
    db: Session = Depends(get_db),
):
    """Update a template."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    update_data = template_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "schema" and value is not None:
            setattr(template, field, value.model_dump() if hasattr(value, 'model_dump') else value)
        else:
            setattr(template, field, value)

    db.commit()
    db.refresh(template)
    return template


@router.post("/{template_id}/publish", response_model=TemplateResponse)
async def publish_template(template_id: int, db: Session = Depends(get_db)):
    """Publish a template."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    template.is_published = True
    db.commit()
    db.refresh(template)
    return template


@router.post("/{template_id}/unpublish", response_model=TemplateResponse)
async def unpublish_template(template_id: int, db: Session = Depends(get_db)):
    """Unpublish a template."""
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    template.is_published = False
    db.commit()
    db.refresh(template)
    return template
