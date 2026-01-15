"""Task management endpoints."""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.task import Task
from app.models.project import Project
from app.models.form import FormInstance
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskListResponse,
)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def get_user_id(x_user_id: Optional[str] = Header(None)) -> Optional[UUID]:
    """Extract user ID from header."""
    if x_user_id:
        return UUID(x_user_id)
    return None


# =============================================================================
# Task CRUD
# =============================================================================

@router.get("", response_model=List[TaskListResponse])
def list_tasks(
    status: Optional[str] = Query(None, description="Filter by status"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    assigned_to: Optional[UUID] = Query(None, description="Filter by assignee"),
    project_id: Optional[UUID] = Query(None, description="Filter by project"),
    form_instance_id: Optional[int] = Query(None, description="Filter by form"),
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """List tasks with optional filters."""
    query = db.query(Task)

    # Filter to tasks assigned to user or created by user
    if user_id:
        query = query.filter(
            (Task.assigned_to_id == user_id) |
            (Task.created_by_id == user_id)
        )

    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    if assigned_to:
        query = query.filter(Task.assigned_to_id == assigned_to)
    if project_id:
        query = query.filter(Task.project_id == project_id)
    if form_instance_id:
        query = query.filter(Task.form_instance_id == form_instance_id)

    tasks = query.order_by(Task.created_at.desc()).all()

    result = []
    for task in tasks:
        project_title = None
        form_title = None

        if task.project_id:
            project = db.query(Project).filter(Project.id == task.project_id).first()
            if project:
                project_title = project.title

        if task.form_instance_id:
            form = db.query(FormInstance).filter(FormInstance.id == task.form_instance_id).first()
            if form:
                form_title = form.title

        result.append(TaskListResponse(
            id=task.id,
            title=task.title,
            description=task.description,
            task_type=task.task_type,
            status=task.status,
            priority=task.priority,
            due_date=task.due_date,
            project_id=task.project_id,
            project_title=project_title,
            form_instance_id=task.form_instance_id,
            form_title=form_title,
            assigned_to_id=task.assigned_to_id,
            created_by_id=task.created_by_id,
            completed_at=task.completed_at,
            created_at=task.created_at,
        ))

    return result


@router.post("", response_model=TaskResponse, status_code=201)
def create_task(
    task_data: TaskCreate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Create a new task."""
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")

    # Validate project exists if provided
    if task_data.project_id:
        project = db.query(Project).filter(Project.id == task_data.project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

    # Validate form exists if provided
    if task_data.form_instance_id:
        form = db.query(FormInstance).filter(FormInstance.id == task_data.form_instance_id).first()
        if not form:
            raise HTTPException(status_code=404, detail="Form not found")

    task = Task(
        title=task_data.title,
        description=task_data.description,
        task_type=task_data.task_type,
        priority=task_data.priority,
        due_date=task_data.due_date,
        project_id=task_data.project_id,
        form_instance_id=task_data.form_instance_id,
        assigned_to_id=task_data.assigned_to_id,
        created_by_id=user_id,
        status="pending",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        project_id=task.project_id,
        form_instance_id=task.form_instance_id,
        assigned_to_id=task.assigned_to_id,
        created_by_id=task.created_by_id,
        completed_at=task.completed_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
):
    """Get a task by ID."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        project_id=task.project_id,
        form_instance_id=task.form_instance_id,
        assigned_to_id=task.assigned_to_id,
        created_by_id=task.created_by_id,
        completed_at=task.completed_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    task_update: TaskUpdate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Update a task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check if user can update (creator or assignee)
    if user_id and task.created_by_id != user_id and task.assigned_to_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this task")

    update_data = task_update.model_dump(exclude_unset=True)

    # Handle status change to completed
    if update_data.get("status") == "completed" and task.status != "completed":
        task.completed_at = datetime.utcnow()
    elif update_data.get("status") != "completed":
        task.completed_at = None

    for field, value in update_data.items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)

    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        project_id=task.project_id,
        form_instance_id=task.form_instance_id,
        assigned_to_id=task.assigned_to_id,
        created_by_id=task.created_by_id,
        completed_at=task.completed_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.post("/{task_id}/complete", response_model=TaskResponse)
def complete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Mark a task as completed."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check if user can complete (creator or assignee)
    if user_id and task.created_by_id != user_id and task.assigned_to_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to complete this task")

    task.status = "completed"
    task.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(task)

    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        status=task.status,
        priority=task.priority,
        due_date=task.due_date,
        project_id=task.project_id,
        form_instance_id=task.form_instance_id,
        assigned_to_id=task.assigned_to_id,
        created_by_id=task.created_by_id,
        completed_at=task.completed_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Delete a task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Only creator can delete
    if user_id and task.created_by_id != user_id:
        raise HTTPException(status_code=403, detail="Only the creator can delete this task")

    db.delete(task)
    db.commit()

    return {"success": True, "message": "Task deleted"}
