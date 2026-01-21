"""Task service for auto-completion and status synchronization."""

from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID

from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.task import Task
from app.models.task_definition import TaskDefinition
from app.models.project import Project
from app.models.form import FormInstance, FormData
from app.models.template import Template
from app.schemas.task import TaskCreateForProject


# =============================================================================
# File Category to Task Name Mapping
# =============================================================================

FILE_CATEGORY_TASK_MAP = {
    "proposal": "Upload Research Proposal",
    "abstract": "Upload Study Abstract",
    "protocol": "Upload Study Protocol",
    "consent_form": "Upload Consent Form",
    "citi_certificate": "Upload CITI Training Certificate",
    "funding": "Upload Funding Documentation",
    "data_management": "Upload Data Management Plan",
}


# =============================================================================
# Form Status to Task Status Mapping
# =============================================================================

FORM_TO_TASK_STATUS_MAP = {
    "draft": "in_progress",
    "submitted": "submitted",
    "in_review": "submitted",
    "approved": "completed",
    "rejected": "rejected",
    "needs_changes": "revision_required",
}


# =============================================================================
# Auto-complete Functions
# =============================================================================

def auto_complete_upload_task(
    db: Session,
    project_id: UUID,
    file_category: str,
) -> Optional[Task]:
    """
    Auto-complete a document_upload task when a matching file is uploaded.

    Finds a task in the project where:
    - task_type = 'document_upload'
    - status in ('pending', 'in_progress')
    - task_definition.file_category = file_category

    If found, updates task status to 'completed' and sets completed_at.

    Args:
        db: Database session
        project_id: UUID of the project
        file_category: Category of the uploaded file

    Returns:
        The updated Task if found and updated, None otherwise
    """
    if not project_id or not file_category:
        return None

    # Find matching task by joining with task_definition to check file_category
    task = (
        db.query(Task)
        .join(TaskDefinition, Task.task_definition_id == TaskDefinition.id)
        .filter(
            Task.project_id == project_id,
            Task.task_type == "document_upload",
            Task.status.in_(["pending", "in_progress"]),
            TaskDefinition.file_category == file_category,
        )
        .first()
    )

    # If no task found by file_category, try matching by task name
    if not task:
        task_name = FILE_CATEGORY_TASK_MAP.get(file_category)
        if task_name:
            task = (
                db.query(Task)
                .filter(
                    Task.project_id == project_id,
                    Task.task_type == "document_upload",
                    Task.status.in_(["pending", "in_progress"]),
                    Task.title == task_name,
                )
                .first()
            )

    if task:
        task.status = "completed"
        task.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(task)
        return task

    return None


def auto_complete_upload_task_by_name(
    db: Session,
    project_id: UUID,
    task_name: str,
) -> Optional[Task]:
    """
    Auto-complete a document_upload task by task name.

    Finds a task in the project where:
    - task_type = 'document_upload'
    - status in ('pending', 'in_progress')
    - title = task_name

    If found, updates task status to 'completed' and sets completed_at.

    Args:
        db: Database session
        project_id: UUID of the project
        task_name: Name/title of the task to complete

    Returns:
        The updated Task if found and updated, None otherwise
    """
    if not project_id or not task_name:
        return None

    task = (
        db.query(Task)
        .filter(
            Task.project_id == project_id,
            Task.task_type == "document_upload",
            Task.status.in_(["pending", "in_progress"]),
            Task.title == task_name,
        )
        .first()
    )

    if task:
        task.status = "completed"
        task.completed_at = datetime.utcnow()
        db.commit()
        db.refresh(task)
        return task

    return None


# =============================================================================
# Form-Task Status Synchronization
# =============================================================================

def sync_task_status_from_form(
    db: Session,
    form_instance_id: int,
    new_form_status: str,
) -> Optional[Task]:
    """
    Update linked task status when form status changes.

    Finds the task linked to the form instance and updates its status
    based on the form status mapping:
    - draft -> in_progress
    - submitted -> submitted
    - in_review -> submitted
    - approved -> completed
    - rejected -> rejected
    - needs_changes -> revision_required

    Args:
        db: Database session
        form_instance_id: ID of the form instance
        new_form_status: New status of the form

    Returns:
        The updated Task if found and updated, None otherwise
    """
    if not form_instance_id or not new_form_status:
        return None

    # Find task linked to this form instance
    task = (
        db.query(Task)
        .filter(Task.form_instance_id == form_instance_id)
        .first()
    )

    if not task:
        return None

    # Map form status to task status
    new_task_status = FORM_TO_TASK_STATUS_MAP.get(new_form_status)

    if not new_task_status:
        # Unknown form status, don't update
        return None

    # Update task status
    task.status = new_task_status

    # Set additional timestamps based on the new status
    if new_task_status == "completed":
        task.completed_at = datetime.utcnow()
    elif new_task_status == "submitted":
        task.submitted_at = datetime.utcnow()
        # Clear previous review data when resubmitting
        task.reviewed_at = None
        task.reviewed_by_id = None
    elif new_task_status == "revision_required":
        task.revision_count = (task.revision_count or 0) + 1

    db.commit()
    db.refresh(task)

    return task


def get_task_for_form(db: Session, form_instance_id: int) -> Optional[Task]:
    """
    Get the task linked to a form instance.

    Args:
        db: Database session
        form_instance_id: ID of the form instance

    Returns:
        The Task if found, None otherwise
    """
    return (
        db.query(Task)
        .filter(Task.form_instance_id == form_instance_id)
        .first()
    )


# =============================================================================
# Create Form for Task
# =============================================================================

def create_form_for_task(
    db: Session,
    task_id: int,
    template_id: int,
    user_id: UUID,
) -> Dict[str, Any]:
    """
    Create a form instance and link it to a form_completion task.

    This function:
    1. Validates the task exists and is of type 'form_completion'
    2. Validates the task doesn't already have a form linked
    3. Validates the template exists and is active
    4. Creates a new FormInstance
    5. Links the form to the task
    6. Sets task status to 'in_progress'

    Args:
        db: Database session
        task_id: ID of the task to create form for
        template_id: ID of the template to use
        user_id: UUID of the user creating the form

    Returns:
        Dict with success status, task_id, form_instance_id, and task_status

    Raises:
        HTTPException: If validation fails
    """
    # 1. Validate task exists
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # 2. Validate task is form_completion type
    if task.task_type != "form_completion":
        raise HTTPException(
            status_code=400,
            detail=f"Task is not a form_completion task. Task type: {task.task_type}"
        )

    # 3. Validate task doesn't already have a form
    if task.form_instance_id is not None:
        raise HTTPException(
            status_code=400,
            detail=f"Task already has a form instance linked (form_instance_id: {task.form_instance_id})"
        )

    # 4. Validate template exists and is active
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if not template.is_active:
        raise HTTPException(status_code=400, detail="Template is not active")

    # 5. Create form instance
    form_title = f"{task.title} - {template.name}"
    form_instance = FormInstance(
        template_id=template_id,
        project_id=task.project_id,
        owner_id=user_id,
        title=form_title,
        status="draft",
        current_version_number=1,
        completion_percentage=0,
    )
    db.add(form_instance)
    db.flush()  # Get the form_instance.id

    # Create empty form data
    form_data = FormData(
        form_instance_id=form_instance.id,
        data={},
        conditional_state={},
    )
    db.add(form_data)

    # 6. Link form instance to task and update task status
    task.form_instance_id = form_instance.id
    task.status = "in_progress"

    db.commit()
    db.refresh(task)
    db.refresh(form_instance)

    return {
        "success": True,
        "message": "Form instance created and linked to task",
        "task_id": task.id,
        "form_instance_id": form_instance.id,
        "task_status": task.status,
    }


# =============================================================================
# Create Task for Project
# =============================================================================

def create_task_for_project(
    db: Session,
    project_id: UUID,
    task_data: TaskCreateForProject,
    created_by_id: UUID,
) -> Task:
    """
    Create a new task for a specific project.

    Can either:
    - Use an existing task definition (provide task_definition_id)
    - Create an ad-hoc custom task (provide title and task_type)

    Args:
        db: Database session
        project_id: UUID of the project to create the task for
        task_data: Task creation data (TaskCreateForProject schema)
        created_by_id: UUID of the user creating the task

    Returns:
        The created Task

    Raises:
        HTTPException: If validation fails (project not found, missing fields, etc.)
    """
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

    # Create the task with defaults
    task = Task(
        project_id=project_id,
        created_by_id=created_by_id,
        task_definition_id=task_data.task_definition_id,
        title=title,
        description=description,
        task_type=task_type,
        assigned_to_id=task_data.assigned_to_id,
        due_date=task_data.due_date,
        priority=task_data.priority or "medium",
        is_required=task_data.is_required if task_data.is_required is not None else True,
        status="pending",
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    return task
