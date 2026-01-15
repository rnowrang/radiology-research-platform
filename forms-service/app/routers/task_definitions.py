"""Task definition management endpoints (admin)."""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.task_definition import TaskDefinition, ProjectTypeTaskMapping
from app.schemas.task_definition import (
    TaskDefinitionCreate,
    TaskDefinitionUpdate,
    TaskDefinitionResponse,
    TaskDefinitionListResponse,
    ProjectTypeTaskMappingCreate,
    ProjectTypeTaskMappingResponse,
    ProjectTypeTaskMappingListResponse,
)
from app.services import task_definition as task_def_service

router = APIRouter(prefix="/api/task-definitions", tags=["task-definitions"])


def get_user_id(x_user_id: Optional[str] = Header(None)) -> Optional[UUID]:
    """Extract user ID from header."""
    if x_user_id:
        return UUID(x_user_id)
    return None


# =============================================================================
# Task Definition CRUD
# =============================================================================

@router.get("", response_model=List[TaskDefinitionListResponse])
def list_task_definitions(
    include_inactive: bool = Query(False, description="Include inactive definitions"),
    db: Session = Depends(get_db),
):
    """List all task definitions."""
    return task_def_service.get_task_definitions(db, include_inactive=include_inactive)


@router.post("", response_model=TaskDefinitionResponse, status_code=201)
def create_task_definition(
    data: TaskDefinitionCreate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Create a new task definition (admin only)."""
    # Check for duplicate name
    existing = db.query(TaskDefinition).filter(TaskDefinition.name == data.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Task definition with this name already exists")

    return task_def_service.create_task_definition(db, data)


@router.get("/{definition_id}", response_model=TaskDefinitionResponse)
def get_task_definition(
    definition_id: int,
    db: Session = Depends(get_db),
):
    """Get a task definition by ID."""
    definition = task_def_service.get_task_definition(db, definition_id)
    if not definition:
        raise HTTPException(status_code=404, detail="Task definition not found")

    return TaskDefinitionResponse(
        id=definition.id,
        name=definition.name,
        description=definition.description,
        task_type=definition.task_type,
        auto_submit=definition.auto_submit,
        default_required=definition.default_required,
        display_order=definition.display_order,
        is_active=definition.is_active,
        created_at=definition.created_at,
        updated_at=definition.updated_at,
    )


@router.put("/{definition_id}", response_model=TaskDefinitionResponse)
def update_task_definition(
    definition_id: int,
    data: TaskDefinitionUpdate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Update a task definition (admin only)."""
    # Check if name is being changed and if it conflicts
    if data.name:
        existing = db.query(TaskDefinition).filter(
            TaskDefinition.name == data.name,
            TaskDefinition.id != definition_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Task definition with this name already exists")

    result = task_def_service.update_task_definition(db, definition_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Task definition not found")

    return result


@router.delete("/{definition_id}")
def delete_task_definition(
    definition_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Deactivate (soft delete) a task definition (admin only)."""
    success = task_def_service.deactivate_task_definition(db, definition_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task definition not found")

    return {"success": True, "message": "Task definition deactivated"}


# =============================================================================
# Project Type Task Mappings
# =============================================================================

@router.get("/mappings/all", response_model=List[ProjectTypeTaskMappingListResponse])
def list_all_project_type_mappings(
    db: Session = Depends(get_db),
):
    """List all project type task mappings."""
    return task_def_service.get_all_project_type_mappings(db)


@router.get("/mappings/{project_type}", response_model=List[ProjectTypeTaskMappingListResponse])
def get_project_type_mappings(
    project_type: str,
    db: Session = Depends(get_db),
):
    """Get task mappings for a specific project type."""
    return task_def_service.get_project_type_mappings(db, project_type)


@router.post("/mappings", response_model=ProjectTypeTaskMappingResponse, status_code=201)
def create_project_type_mapping(
    data: ProjectTypeTaskMappingCreate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Add a task mapping for a project type (admin only)."""
    # Verify task definition exists
    task_def = task_def_service.get_task_definition(db, data.task_definition_id)
    if not task_def:
        raise HTTPException(status_code=404, detail="Task definition not found")

    # Check for duplicate mapping
    existing = db.query(ProjectTypeTaskMapping).filter(
        ProjectTypeTaskMapping.project_type == data.project_type,
        ProjectTypeTaskMapping.task_definition_id == data.task_definition_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="This mapping already exists")

    return task_def_service.create_project_type_mapping(db, data)


@router.delete("/mappings/{mapping_id}")
def delete_project_type_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Remove a project type task mapping (admin only)."""
    success = task_def_service.delete_project_type_mapping(db, mapping_id)
    if not success:
        raise HTTPException(status_code=404, detail="Mapping not found")

    return {"success": True, "message": "Mapping removed"}


# =============================================================================
# Project Types List
# =============================================================================

@router.get("/project-types/available", response_model=List[str])
def list_available_project_types(
    db: Session = Depends(get_db),
):
    """List all project types that have task mappings configured."""
    mappings = db.query(ProjectTypeTaskMapping.project_type).distinct().all()
    return sorted([m[0] for m in mappings])
