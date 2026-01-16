"""Project management endpoints."""

from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.project import Project, ProjectCollaborator
from app.models.form import FormInstance
from app.models.task import Task
from app.schemas.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    ProjectCollaboratorCreate,
    ProjectCollaboratorResponse,
)
from app.schemas.task import TaskCreateForProject, TaskResponse
from app.schemas.task_definition import ProjectTaskProgress
from app.models.task_definition import TaskDefinition
from app.services import task_definition as task_def_service

router = APIRouter(prefix="/api/projects", tags=["projects"])


def get_user_id(x_user_id: Optional[str] = Header(None)) -> Optional[UUID]:
    """Extract user ID from header."""
    if x_user_id:
        return UUID(x_user_id)
    return None


def get_user_role(x_user_role: Optional[str] = Header(None)) -> Optional[str]:
    """Extract user role from header."""
    return x_user_role


# =============================================================================
# Project CRUD
# =============================================================================

@router.get("", response_model=List[ProjectListResponse])
def list_projects(
    status: Optional[str] = Query(None, description="Filter by status"),
    principal_investigator_id: Optional[UUID] = Query(None, description="Filter by PI"),
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """List all projects the user has access to."""
    query = db.query(Project)

    if status:
        query = query.filter(Project.status == status)

    if principal_investigator_id:
        query = query.filter(Project.principal_investigator_id == principal_investigator_id)

    # Admin users can see all projects; others only see projects they own, collaborate on, or are public
    if user_role != "admin" and user_id:
        collaborator_project_ids = db.query(ProjectCollaborator.project_id).filter(
            ProjectCollaborator.user_id == user_id
        ).subquery()
        query = query.filter(
            (Project.principal_investigator_id == user_id) |
            (Project.id.in_(collaborator_project_ids)) |
            (Project.is_public == True)
        )

    projects = query.order_by(Project.created_at.desc()).all()

    result = []
    for project in projects:
        # Count forms and collaborators
        form_count = db.query(func.count(FormInstance.id)).filter(
            FormInstance.project_id == project.id
        ).scalar() or 0

        collaborator_count = len(project.collaborators)

        result.append(ProjectListResponse(
            id=project.id,
            title=project.title,
            description=project.description,
            project_type=project.project_type,
            department=project.department,
            principal_investigator_id=project.principal_investigator_id,
            status=project.status,
            start_date=project.start_date,
            end_date=project.end_date,
            created_at=project.created_at,
            form_count=form_count,
            collaborator_count=collaborator_count,
        ))

    return result


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(
    project_data: ProjectCreate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Create a new project."""
    # Use provided PI or fall back to authenticated user
    pi_id = project_data.principal_investigator_id or user_id
    if not pi_id:
        raise HTTPException(status_code=400, detail="Principal investigator ID required")

    # Check if project with provided ID already exists (gateway sync case)
    existing_project = None
    if project_data.id:
        existing_project = db.query(Project).filter(Project.id == project_data.id).first()

    if existing_project:
        # Project already exists - update it and ensure tasks exist
        project = existing_project
        project.title = project_data.title
        project.description = project_data.description
        project.project_type = project_data.project_type
        project.department = project_data.department
        project.start_date = project_data.start_date
        project.end_date = project_data.end_date
        project.is_public = project_data.is_public
        db.commit()
        db.refresh(project)
    else:
        # Create new project
        project_kwargs = {
            "title": project_data.title,
            "description": project_data.description,
            "project_type": project_data.project_type,
            "department": project_data.department,
            "principal_investigator_id": pi_id,
            "start_date": project_data.start_date,
            "end_date": project_data.end_date,
            "is_public": project_data.is_public,
            "status": "draft",
        }
        if project_data.id:
            project_kwargs["id"] = project_data.id

        project = Project(**project_kwargs)
        db.add(project)
        db.commit()
        db.refresh(project)

    # Auto-create tasks based on project type (only if no tasks exist yet)
    if project.project_type:
        existing_tasks = db.query(Task).filter(Task.project_id == project.id).first()
        if not existing_tasks:
            task_def_service.create_project_tasks(
                db=db,
                project_id=project.id,
                project_type=project.project_type,
                owner_id=pi_id,
            )

    return ProjectResponse(
        id=project.id,
        title=project.title,
        description=project.description,
        project_type=project.project_type,
        department=project.department,
        principal_investigator_id=project.principal_investigator_id,
        status=project.status,
        start_date=project.start_date,
        end_date=project.end_date,
        is_public=project.is_public,
        created_at=project.created_at,
        updated_at=project.updated_at,
        collaborators=[],
        form_count=0,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
):
    """Get a project by ID."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    form_count = db.query(func.count(FormInstance.id)).filter(
        FormInstance.project_id == project.id
    ).scalar() or 0

    return ProjectResponse(
        id=project.id,
        title=project.title,
        description=project.description,
        project_type=project.project_type,
        department=project.department,
        principal_investigator_id=project.principal_investigator_id,
        status=project.status,
        start_date=project.start_date,
        end_date=project.end_date,
        is_public=project.is_public,
        created_at=project.created_at,
        updated_at=project.updated_at,
        collaborators=[
            ProjectCollaboratorResponse(
                id=c.id,
                project_id=c.project_id,
                user_id=c.user_id,
                role=c.role,
                added_at=c.added_at,
            )
            for c in project.collaborators
        ],
        form_count=form_count,
    )


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: UUID,
    project_update: ProjectUpdate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Update a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check ownership (PI or admin can update)
    if user_id and project.principal_investigator_id != user_id and user_role != "admin":
        raise HTTPException(status_code=403, detail="Only the principal investigator or admin can update this project")

    update_data = project_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)

    db.commit()
    db.refresh(project)

    form_count = db.query(func.count(FormInstance.id)).filter(
        FormInstance.project_id == project.id
    ).scalar() or 0

    return ProjectResponse(
        id=project.id,
        title=project.title,
        description=project.description,
        project_type=project.project_type,
        department=project.department,
        principal_investigator_id=project.principal_investigator_id,
        status=project.status,
        start_date=project.start_date,
        end_date=project.end_date,
        is_public=project.is_public,
        created_at=project.created_at,
        updated_at=project.updated_at,
        collaborators=[
            ProjectCollaboratorResponse(
                id=c.id,
                project_id=c.project_id,
                user_id=c.user_id,
                role=c.role,
                added_at=c.added_at,
            )
            for c in project.collaborators
        ],
        form_count=form_count,
    )


@router.delete("/{project_id}")
def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Delete a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check ownership (PI or admin can delete)
    if user_id and project.principal_investigator_id != user_id and user_role != "admin":
        raise HTTPException(status_code=403, detail="Only the principal investigator or admin can delete this project")

    # Check if project has forms
    form_count = db.query(func.count(FormInstance.id)).filter(
        FormInstance.project_id == project.id
    ).scalar()

    if form_count and form_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete project with {form_count} associated forms"
        )

    db.delete(project)
    db.commit()

    return {"success": True, "message": "Project deleted"}


# =============================================================================
# Collaborators
# =============================================================================

@router.get("/{project_id}/collaborators", response_model=List[ProjectCollaboratorResponse])
def list_collaborators(
    project_id: UUID,
    db: Session = Depends(get_db),
):
    """List collaborators for a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return [
        ProjectCollaboratorResponse(
            id=c.id,
            project_id=c.project_id,
            user_id=c.user_id,
            role=c.role,
            added_at=c.added_at,
        )
        for c in project.collaborators
    ]


@router.post("/{project_id}/collaborators", response_model=ProjectCollaboratorResponse, status_code=201)
def add_collaborator(
    project_id: UUID,
    collaborator_data: ProjectCollaboratorCreate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Add a collaborator to a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check ownership (PI or admin can add collaborators)
    if user_id and project.principal_investigator_id != user_id and user_role != "admin":
        raise HTTPException(status_code=403, detail="Only the principal investigator or admin can add collaborators")

    # Check if already a collaborator
    existing = db.query(ProjectCollaborator).filter(
        ProjectCollaborator.project_id == project_id,
        ProjectCollaborator.user_id == collaborator_data.user_id,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="User is already a collaborator")

    collaborator = ProjectCollaborator(
        project_id=project_id,
        user_id=collaborator_data.user_id,
        role=collaborator_data.role,
    )
    db.add(collaborator)
    db.commit()
    db.refresh(collaborator)

    return ProjectCollaboratorResponse(
        id=collaborator.id,
        project_id=collaborator.project_id,
        user_id=collaborator.user_id,
        role=collaborator.role,
        added_at=collaborator.added_at,
    )


@router.delete("/{project_id}/collaborators/{collaborator_id}")
def remove_collaborator(
    project_id: UUID,
    collaborator_id: UUID,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Remove a collaborator from a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check ownership (PI or admin can remove collaborators)
    if user_id and project.principal_investigator_id != user_id and user_role != "admin":
        raise HTTPException(status_code=403, detail="Only the principal investigator or admin can remove collaborators")

    collaborator = db.query(ProjectCollaborator).filter(
        ProjectCollaborator.id == collaborator_id,
        ProjectCollaborator.project_id == project_id,
    ).first()

    if not collaborator:
        raise HTTPException(status_code=404, detail="Collaborator not found")

    db.delete(collaborator)
    db.commit()

    return {"success": True, "message": "Collaborator removed"}


# =============================================================================
# Project Forms
# =============================================================================

@router.get("/{project_id}/forms")
def list_project_forms(
    project_id: UUID,
    status: Optional[str] = Query(None, description="Filter by form status"),
    db: Session = Depends(get_db),
):
    """List forms associated with a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = db.query(FormInstance).filter(FormInstance.project_id == project_id)

    if status:
        query = query.filter(FormInstance.status == status)

    forms = query.order_by(FormInstance.created_at.desc()).all()

    return [
        {
            "id": form.id,
            "template_id": form.template_id,
            "owner_id": str(form.owner_id),
            "title": form.title,
            "status": form.status,
            "current_version_number": form.current_version_number,
            "completion_percentage": form.completion_percentage,
            "created_at": form.created_at,
            "updated_at": form.updated_at,
            "template_name": form.template.name if form.template else None,
        }
        for form in forms
    ]


# =============================================================================
# Project Tasks
# =============================================================================

@router.get("/{project_id}/tasks")
def list_project_tasks(
    project_id: UUID,
    status: Optional[str] = Query(None, description="Filter by task status"),
    db: Session = Depends(get_db),
):
    """List all tasks associated with a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = db.query(Task).filter(Task.project_id == project_id)

    if status:
        query = query.filter(Task.status == status)

    tasks = query.order_by(Task.id).all()

    return [
        {
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "task_type": task.task_type,
            "status": task.status,
            "priority": task.priority,
            "due_date": task.due_date,
            "is_required": task.is_required if task.is_required is not None else True,
            "task_definition_id": task.task_definition_id,
            "assigned_to_id": str(task.assigned_to_id) if task.assigned_to_id else None,
            "created_by_id": str(task.created_by_id),
            "submitted_at": task.submitted_at,
            "reviewed_at": task.reviewed_at,
            "reviewed_by_id": str(task.reviewed_by_id) if task.reviewed_by_id else None,
            "reviewer_comments": task.reviewer_comments,
            "revision_count": task.revision_count if task.revision_count is not None else 0,
            "completed_at": task.completed_at,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
        }
        for task in tasks
    ]


@router.post("/{project_id}/tasks", response_model=TaskResponse, status_code=201)
def create_project_task(
    project_id: UUID,
    task_data: TaskCreateForProject,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """
    Manually create a task for a project.

    Can either:
    - Use an existing task definition (provide task_definition_id)
    - Create an ad-hoc custom task (provide title and task_type)
    """
    # Validate user_id is provided
    if not user_id:
        raise HTTPException(status_code=401, detail="X-User-Id header required")

    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Determine title, description, and task_type based on input
    title = task_data.title
    description = task_data.description
    task_type = task_data.task_type

    if task_data.task_definition_id:
        # Fetch the task definition
        task_definition = db.query(TaskDefinition).filter(
            TaskDefinition.id == task_data.task_definition_id
        ).first()

        if not task_definition:
            raise HTTPException(
                status_code=404,
                detail=f"Task definition with id {task_data.task_definition_id} not found"
            )

        # Use definition values (can be overridden by provided values)
        title = title or task_definition.name
        description = description or task_definition.description
        task_type = task_type or task_definition.task_type
    else:
        # No task definition - require title and task_type
        if not title:
            raise HTTPException(
                status_code=400,
                detail="title is required when task_definition_id is not provided"
            )
        if not task_type:
            raise HTTPException(
                status_code=400,
                detail="task_type is required when task_definition_id is not provided"
            )

    # Create the task
    task = Task(
        project_id=project_id,
        created_by_id=user_id,
        task_definition_id=task_data.task_definition_id,
        title=title,
        description=description,
        task_type=task_type,
        assigned_to_id=task_data.assigned_to_id,
        due_date=task_data.due_date,
        priority=task_data.priority,
        is_required=task_data.is_required,
        status="pending",
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    return TaskResponse(
        id=task.id,
        project_id=task.project_id,
        form_instance_id=task.form_instance_id,
        assigned_to_id=task.assigned_to_id,
        created_by_id=task.created_by_id,
        task_definition_id=task.task_definition_id,
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        is_required=task.is_required,
        completed_at=task.completed_at,
        submitted_at=task.submitted_at,
        reviewed_at=task.reviewed_at,
        reviewed_by_id=task.reviewed_by_id,
        reviewer_comments=task.reviewer_comments,
        revision_count=task.revision_count or 0,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("/{project_id}/task-progress", response_model=ProjectTaskProgress)
def get_project_task_progress(
    project_id: UUID,
    db: Session = Depends(get_db),
):
    """Get task completion progress for a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    return task_def_service.get_project_task_progress(db, project_id)
