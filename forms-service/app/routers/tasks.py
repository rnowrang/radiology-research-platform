"""Task management endpoints."""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.task import Task
from app.models.project import Project, ProjectCollaborator
from app.models.form import FormInstance
from app.schemas.task import (
    TaskCreate,
    TaskUpdate,
    TaskResponse,
    TaskListResponse,
    TaskSubmitRequest,
    TaskApproveRequest,
    TaskRejectRequest,
    TaskRevisionRequest,
    PendingReviewItem,
    CreateFormForTaskRequest,
    CreateFormForTaskResponse,
)
from app.services.task import create_form_for_task

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
    include_all_project_tasks: bool = Query(False, description="Include tasks from projects where user is PI or collaborator"),
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

    # Include tasks from projects where user is PI or collaborator
    if include_all_project_tasks and user_id:
        # Get projects where user is PI
        user_project_ids = db.query(Project.id).filter(
            Project.principal_investigator_id == user_id
        ).all()
        # Get projects where user is collaborator
        collab_project_ids = db.query(ProjectCollaborator.project_id).filter(
            ProjectCollaborator.user_id == user_id
        ).all()
        all_project_ids = [p.id for p in user_project_ids] + [p.project_id for p in collab_project_ids]

        if all_project_ids:
            query = query.union(
                db.query(Task).filter(Task.project_id.in_(all_project_ids))
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
            task_definition_id=task.task_definition_id,
            is_required=task.is_required if task.is_required is not None else True,
            completed_at=task.completed_at,
            submitted_at=task.submitted_at,
            reviewed_at=task.reviewed_at,
            reviewer_comments=task.reviewer_comments,
            revision_count=task.revision_count if task.revision_count is not None else 0,
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
        task_definition_id=task_data.task_definition_id,
        is_required=task_data.is_required,
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
        task_definition_id=task.task_definition_id,
        is_required=task.is_required if task.is_required is not None else True,
        completed_at=task.completed_at,
        submitted_at=task.submitted_at,
        reviewed_at=task.reviewed_at,
        reviewed_by_id=task.reviewed_by_id,
        reviewer_comments=task.reviewer_comments,
        revision_count=task.revision_count if task.revision_count is not None else 0,
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
        task_definition_id=task.task_definition_id,
        is_required=task.is_required if task.is_required is not None else True,
        completed_at=task.completed_at,
        submitted_at=task.submitted_at,
        reviewed_at=task.reviewed_at,
        reviewed_by_id=task.reviewed_by_id,
        reviewer_comments=task.reviewer_comments,
        revision_count=task.revision_count if task.revision_count is not None else 0,
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

    # Handle status change to completed/approved
    if update_data.get("status") in ("completed", "approved") and task.status not in ("completed", "approved"):
        task.completed_at = datetime.utcnow()
    elif update_data.get("status") not in ("completed", "approved"):
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
        task_definition_id=task.task_definition_id,
        is_required=task.is_required if task.is_required is not None else True,
        completed_at=task.completed_at,
        submitted_at=task.submitted_at,
        reviewed_at=task.reviewed_at,
        reviewed_by_id=task.reviewed_by_id,
        reviewer_comments=task.reviewer_comments,
        revision_count=task.revision_count if task.revision_count is not None else 0,
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
        task_definition_id=task.task_definition_id,
        is_required=task.is_required if task.is_required is not None else True,
        completed_at=task.completed_at,
        submitted_at=task.submitted_at,
        reviewed_at=task.reviewed_at,
        reviewed_by_id=task.reviewed_by_id,
        reviewer_comments=task.reviewer_comments,
        revision_count=task.revision_count if task.revision_count is not None else 0,
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


# =============================================================================
# Review Workflow
# =============================================================================

def _build_task_response(task: Task) -> TaskResponse:
    """Helper to build a TaskResponse from a Task model."""
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
        task_definition_id=task.task_definition_id,
        is_required=task.is_required if task.is_required is not None else True,
        completed_at=task.completed_at,
        submitted_at=task.submitted_at,
        reviewed_at=task.reviewed_at,
        reviewed_by_id=task.reviewed_by_id,
        reviewer_comments=task.reviewer_comments,
        revision_count=task.revision_count if task.revision_count is not None else 0,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


@router.post("/{task_id}/submit", response_model=TaskResponse)
def submit_task_for_review(
    task_id: int,
    request: TaskSubmitRequest,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Submit a task for review."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Check if user can submit (creator or assignee)
    if user_id and task.created_by_id != user_id and task.assigned_to_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to submit this task")

    # Can only submit from certain statuses
    if task.status not in ("pending", "in_progress", "revision_required"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit task with status '{task.status}'. Must be pending, in_progress, or revision_required."
        )

    task.status = "submitted"
    task.submitted_at = datetime.utcnow()
    task.reviewed_at = None
    task.reviewed_by_id = None

    db.commit()
    db.refresh(task)

    return _build_task_response(task)


@router.post("/{task_id}/approve", response_model=TaskResponse)
def approve_task(
    task_id: int,
    request: TaskApproveRequest,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Approve a submitted task."""
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Can only approve submitted tasks
    if task.status != "submitted":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot approve task with status '{task.status}'. Must be submitted."
        )

    task.status = "approved"
    task.reviewed_at = datetime.utcnow()
    task.reviewed_by_id = user_id
    task.reviewer_comments = request.comments
    task.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(task)

    return _build_task_response(task)


@router.post("/{task_id}/reject", response_model=TaskResponse)
def reject_task(
    task_id: int,
    request: TaskRejectRequest,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Reject a submitted task."""
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Can only reject submitted tasks
    if task.status != "submitted":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reject task with status '{task.status}'. Must be submitted."
        )

    task.status = "rejected"
    task.reviewed_at = datetime.utcnow()
    task.reviewed_by_id = user_id
    task.reviewer_comments = request.comments

    db.commit()
    db.refresh(task)

    return _build_task_response(task)


@router.post("/{task_id}/request-revision", response_model=TaskResponse)
def request_task_revision(
    task_id: int,
    request: TaskRevisionRequest,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Request revision of a submitted task."""
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Can only request revision for submitted tasks
    if task.status != "submitted":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot request revision for task with status '{task.status}'. Must be submitted."
        )

    task.status = "revision_required"
    task.reviewed_at = datetime.utcnow()
    task.reviewed_by_id = user_id
    task.reviewer_comments = request.comments
    task.revision_count = (task.revision_count or 0) + 1

    db.commit()
    db.refresh(task)

    return _build_task_response(task)


@router.get("/pending-review/list", response_model=List[PendingReviewItem])
def list_pending_review_tasks(
    project_id: Optional[UUID] = Query(None, description="Filter by project"),
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Get all tasks awaiting review (status = 'submitted')."""
    query = db.query(Task).filter(Task.status == "submitted")

    if project_id:
        query = query.filter(Task.project_id == project_id)

    tasks = query.order_by(Task.submitted_at.asc()).all()

    result = []
    for task in tasks:
        project_title = None
        if task.project_id:
            project = db.query(Project).filter(Project.id == task.project_id).first()
            if project:
                project_title = project.title

        result.append(PendingReviewItem(
            id=task.id,
            title=task.title,
            description=task.description,
            task_type=task.task_type,
            status=task.status,
            priority=task.priority,
            project_id=task.project_id,
            project_title=project_title,
            submitted_at=task.submitted_at,
            created_by_id=task.created_by_id,
            revision_count=task.revision_count if task.revision_count is not None else 0,
        ))

    return result


# =============================================================================
# Create Form for Task
# =============================================================================

@router.post("/{task_id}/create-form", response_model=CreateFormForTaskResponse)
def create_form_for_task_endpoint(
    task_id: int,
    data: CreateFormForTaskRequest,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """
    Create a form instance for a form_completion task.

    This endpoint:
    - Validates the task exists and is of type 'form_completion'
    - Validates the task doesn't already have a form instance linked
    - Creates a new form instance with the selected template
    - Links the form instance to the task
    - Sets the task status to 'in_progress'
    - Returns the form_instance_id for redirect

    Request Body:
        template_id: int - ID of the template to use for the form

    Returns:
        CreateFormForTaskResponse with task_id, form_instance_id, and task_status
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")

    result = create_form_for_task(db, task_id, data.template_id, user_id)

    return CreateFormForTaskResponse(
        success=result["success"],
        message=result["message"],
        task_id=result["task_id"],
        form_instance_id=result["form_instance_id"],
        task_status=result["task_status"],
    )


# =============================================================================
# Auto-Complete Upload Task
# =============================================================================

from app.services.task import auto_complete_upload_task, sync_task_status_from_form


@router.post("/auto-complete-upload")
def auto_complete_upload_task_endpoint(
    project_id: UUID = Query(..., description="Project ID"),
    file_category: str = Query(..., description="File category (proposal, abstract, protocol, etc.)"),
    db: Session = Depends(get_db),
):
    """
    Auto-complete a document_upload task when a matching file is uploaded.

    This endpoint is called by the gateway after a file is successfully uploaded.
    It finds the matching task by file_category and marks it as completed.

    File Category Mapping:
    - proposal -> Upload Research Proposal
    - abstract -> Upload Study Abstract
    - protocol -> Upload Study Protocol
    - consent_form -> Upload Consent Form
    - citi_certificate -> Upload CITI Training Certificate
    - funding -> Upload Funding Documentation
    - data_management -> Upload Data Management Plan
    """
    task = auto_complete_upload_task(db, project_id, file_category)

    if task:
        return {
            "success": True,
            "message": f"Task '{task.title}' auto-completed",
            "task_id": task.id,
            "task_title": task.title,
            "task_status": task.status,
        }
    else:
        return {
            "success": False,
            "message": "No matching task found to auto-complete",
            "task_id": None,
        }


# =============================================================================
# Sync Task Status from Form
# =============================================================================

@router.post("/sync-from-form")
def sync_task_status_from_form_endpoint(
    form_instance_id: int = Query(..., description="Form instance ID"),
    new_form_status: str = Query(..., description="New form status"),
    db: Session = Depends(get_db),
):
    """
    Sync task status when the linked form's status changes.

    This endpoint is called by review actions (submit, approve, reject, request-changes).
    It finds the task linked to the form instance and updates its status.

    Form Status to Task Status Mapping:
    - draft -> in_progress
    - submitted -> submitted
    - in_review -> submitted
    - approved -> completed
    - rejected -> rejected
    - needs_changes -> revision_required
    """
    task = sync_task_status_from_form(db, form_instance_id, new_form_status)

    if task:
        return {
            "success": True,
            "message": f"Task '{task.title}' synced to status '{task.status}'",
            "task_id": task.id,
            "task_title": task.title,
            "task_status": task.status,
            "form_status": new_form_status,
        }
    else:
        return {
            "success": False,
            "message": "No task found linked to this form instance",
            "task_id": None,
        }
