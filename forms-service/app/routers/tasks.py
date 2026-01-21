"""Task management endpoints."""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header, Query, Request
from sqlalchemy.orm import Session, joinedload

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


def require_reviewer_role(request: Request) -> str:
    """
    Dependency that requires admin or reviewer role.

    Returns the role if valid, raises 403 if not authorized.
    This provides defense-in-depth for review actions - even if someone
    bypasses the gateway, they cannot approve/reject without proper role.
    """
    role = request.headers.get("X-User-Role", "").lower()
    if role not in ["admin", "reviewer"]:
        raise HTTPException(
            status_code=403,
            detail="Admin or reviewer role required"
        )
    return role


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
    """List tasks with optional filters.

    Visibility rules:
    - Assigned tasks: only visible to the assignee
    - Unassigned tasks: visible to all project members (PI + collaborators)
    - Task creator always sees their own tasks
    """
    query = db.query(Task)

    # Apply visibility rules based on user
    if user_id:
        # Get project IDs where user is PI
        pi_project_ids = db.query(Project.id).filter(
            Project.principal_investigator_id == user_id
        ).subquery()

        # Get project IDs where user is collaborator
        collab_project_ids = db.query(ProjectCollaborator.project_id).filter(
            ProjectCollaborator.user_id == user_id
        ).subquery()

        # Task visibility rules:
        # 1. User is the assignee
        # 2. Task is unassigned AND user is project member (PI or collaborator)
        # 3. User created the task
        query = query.filter(
            (Task.assigned_to_id == user_id) |  # Assigned to me
            (Task.created_by_id == user_id) |   # I created it
            (
                (Task.assigned_to_id == None) &  # Unassigned task
                (
                    Task.project_id.in_(pi_project_ids) |  # I'm PI
                    Task.project_id.in_(collab_project_ids)  # I'm collaborator
                )
            )
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

    # Use joinedload to eagerly load related project and form_instance in a single query
    # This prevents N+1 query problem (was doing 2N extra queries before)
    query = query.options(
        joinedload(Task.project),
        joinedload(Task.form_instance)
    )

    tasks = query.order_by(Task.created_at.desc()).all()

    # Build response using pre-loaded relationships (no additional queries)
    result = [
        TaskListResponse(
            id=task.id,
            title=task.title,
            description=task.description,
            task_type=task.task_type,
            status=task.status,
            priority=task.priority,
            due_date=task.due_date,
            project_id=task.project_id,
            project_title=task.project.title if task.project else None,
            form_instance_id=task.form_instance_id,
            form_title=task.form_instance.title if task.form_instance else None,
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
        )
        for task in tasks
    ]

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
    http_request: Request,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    _role: str = Depends(require_reviewer_role),
):
    """Approve a submitted task. Requires admin or reviewer role."""
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
    http_request: Request,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    _role: str = Depends(require_reviewer_role),
):
    """Reject a submitted task. Requires admin or reviewer role."""
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
    http_request: Request,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    _role: str = Depends(require_reviewer_role),
):
    """Request revision of a submitted task. Requires admin or reviewer role."""
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
    request: Request,
    project_id: Optional[UUID] = Query(None, description="Filter by project"),
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    _role: str = Depends(require_reviewer_role),
):
    """Get all tasks awaiting review (status = 'submitted'). Requires admin or reviewer role."""
    query = db.query(Task).filter(Task.status == "submitted")

    if project_id:
        query = query.filter(Task.project_id == project_id)

    # Use joinedload to eagerly load project in a single query (prevents N+1)
    query = query.options(joinedload(Task.project))

    tasks = query.order_by(Task.submitted_at.asc()).all()

    # Build response using pre-loaded relationship (no additional queries)
    result = [
        PendingReviewItem(
            id=task.id,
            title=task.title,
            description=task.description,
            task_type=task.task_type,
            status=task.status,
            priority=task.priority,
            project_id=task.project_id,
            project_title=task.project.title if task.project else None,
            submitted_at=task.submitted_at,
            created_by_id=task.created_by_id,
            revision_count=task.revision_count if task.revision_count is not None else 0,
        )
        for task in tasks
    ]

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
    task_id: Optional[int] = Query(None, description="Optional specific task ID to complete directly"),
    db: Session = Depends(get_db),
):
    """
    Auto-complete a document_upload task when a matching file is uploaded.

    This endpoint is called by the gateway after a file is successfully uploaded.
    It finds the matching task by file_category and marks it as completed.

    If task_id is provided, it will complete that specific task directly
    (validating it exists, is document_upload type, and has completable status).

    File Category Mapping:
    - proposal -> Upload Research Proposal
    - abstract -> Upload Study Abstract
    - protocol -> Upload Study Protocol
    - consent_form -> Upload Consent Form
    - citi_certificate -> Upload CITI Training Certificate
    - funding -> Upload Funding Documentation
    - data_management -> Upload Data Management Plan
    """
    result = auto_complete_upload_task(db, project_id, file_category, task_id)
    return result


@router.post("/{task_id}/mark-complete", response_model=TaskResponse)
def mark_upload_task_complete(
    task_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """
    Manually mark a document_upload task as complete.

    This endpoint allows task owners (creators) or assignees to manually
    mark a document_upload task as completed.

    Validation:
    - Task must exist (404 if not)
    - Task must be of type 'document_upload' (400 if not)
    - User must be the task creator or assignee (403 if not)
    - Task status must be 'pending' or 'in_progress' (400 otherwise)

    On success:
    - Updates task status to 'completed'
    - Sets completed_at to current timestamp
    - Returns the updated TaskResponse
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")

    # Verify the task exists
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Verify it's a document_upload task
    if task.task_type != "document_upload":
        raise HTTPException(
            status_code=400,
            detail=f"Only document_upload tasks can be marked complete via this endpoint. Task type: {task.task_type}"
        )

    # Verify the user is the task creator or assignee
    if task.created_by_id != user_id and task.assigned_to_id != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the task creator or assignee can mark this task as complete"
        )

    # Only allow completion if status is pending or in_progress
    if task.status not in ("pending", "in_progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Task cannot be marked complete. Current status: {task.status}. Must be 'pending' or 'in_progress'."
        )

    # Update status to completed and set completed_at
    task.status = "completed"
    task.completed_at = datetime.utcnow()

    db.commit()
    db.refresh(task)

    return _build_task_response(task)


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
