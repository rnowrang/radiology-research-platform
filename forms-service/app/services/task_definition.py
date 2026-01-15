"""Task definition service for CRUD operations and project task creation."""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.task_definition import TaskDefinition, ProjectTypeTaskMapping
from app.models.task import Task
from app.schemas.task_definition import (
    TaskDefinitionCreate,
    TaskDefinitionUpdate,
    TaskDefinitionResponse,
    TaskDefinitionListResponse,
    ProjectTypeTaskMappingCreate,
    ProjectTypeTaskMappingResponse,
    ProjectTypeTaskMappingListResponse,
    TaskProgressItem,
    ProjectTaskProgress,
)


# =============================================================================
# Task Definition CRUD
# =============================================================================

def get_task_definitions(
    db: Session,
    include_inactive: bool = False,
) -> List[TaskDefinitionListResponse]:
    """Get all task definitions."""
    query = db.query(TaskDefinition)
    if not include_inactive:
        query = query.filter(TaskDefinition.is_active == True)

    definitions = query.order_by(TaskDefinition.display_order).all()

    return [
        TaskDefinitionListResponse(
            id=d.id,
            name=d.name,
            description=d.description,
            task_type=d.task_type,
            auto_submit=d.auto_submit,
            default_required=d.default_required,
            display_order=d.display_order,
            is_active=d.is_active,
            created_at=d.created_at,
        )
        for d in definitions
    ]


def get_task_definition(db: Session, definition_id: int) -> Optional[TaskDefinition]:
    """Get a task definition by ID."""
    return db.query(TaskDefinition).filter(TaskDefinition.id == definition_id).first()


def create_task_definition(
    db: Session,
    data: TaskDefinitionCreate,
) -> TaskDefinitionResponse:
    """Create a new task definition."""
    definition = TaskDefinition(
        name=data.name,
        description=data.description,
        task_type=data.task_type,
        auto_submit=data.auto_submit,
        default_required=data.default_required,
        display_order=data.display_order,
    )
    db.add(definition)
    db.commit()
    db.refresh(definition)

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


def update_task_definition(
    db: Session,
    definition_id: int,
    data: TaskDefinitionUpdate,
) -> Optional[TaskDefinitionResponse]:
    """Update a task definition."""
    definition = db.query(TaskDefinition).filter(TaskDefinition.id == definition_id).first()
    if not definition:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(definition, field, value)

    db.commit()
    db.refresh(definition)

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


def deactivate_task_definition(db: Session, definition_id: int) -> bool:
    """Deactivate (soft delete) a task definition."""
    definition = db.query(TaskDefinition).filter(TaskDefinition.id == definition_id).first()
    if not definition:
        return False

    definition.is_active = False
    db.commit()
    return True


# =============================================================================
# Project Type Task Mapping CRUD
# =============================================================================

def get_all_project_type_mappings(db: Session) -> List[ProjectTypeTaskMappingListResponse]:
    """Get all project type task mappings."""
    mappings = (
        db.query(ProjectTypeTaskMapping)
        .join(TaskDefinition)
        .filter(TaskDefinition.is_active == True)
        .order_by(ProjectTypeTaskMapping.project_type, ProjectTypeTaskMapping.display_order)
        .all()
    )

    return [
        ProjectTypeTaskMappingListResponse(
            id=m.id,
            project_type=m.project_type,
            task_definition_id=m.task_definition_id,
            task_definition_name=m.task_definition.name,
            task_definition_description=m.task_definition.description,
            task_type=m.task_definition.task_type,
            is_required=m.is_required,
            display_order=m.display_order,
            created_at=m.created_at,
        )
        for m in mappings
    ]


def get_project_type_mappings(
    db: Session,
    project_type: str,
) -> List[ProjectTypeTaskMappingListResponse]:
    """Get task mappings for a specific project type."""
    mappings = (
        db.query(ProjectTypeTaskMapping)
        .join(TaskDefinition)
        .filter(
            ProjectTypeTaskMapping.project_type == project_type,
            TaskDefinition.is_active == True,
        )
        .order_by(ProjectTypeTaskMapping.display_order)
        .all()
    )

    return [
        ProjectTypeTaskMappingListResponse(
            id=m.id,
            project_type=m.project_type,
            task_definition_id=m.task_definition_id,
            task_definition_name=m.task_definition.name,
            task_definition_description=m.task_definition.description,
            task_type=m.task_definition.task_type,
            is_required=m.is_required,
            display_order=m.display_order,
            created_at=m.created_at,
        )
        for m in mappings
    ]


def create_project_type_mapping(
    db: Session,
    data: ProjectTypeTaskMappingCreate,
) -> ProjectTypeTaskMappingResponse:
    """Create a new project type task mapping."""
    mapping = ProjectTypeTaskMapping(
        project_type=data.project_type,
        task_definition_id=data.task_definition_id,
        is_required=data.is_required,
        display_order=data.display_order,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)

    # Load the task definition for the response
    task_def = db.query(TaskDefinition).filter(TaskDefinition.id == mapping.task_definition_id).first()

    return ProjectTypeTaskMappingResponse(
        id=mapping.id,
        project_type=mapping.project_type,
        task_definition_id=mapping.task_definition_id,
        is_required=mapping.is_required,
        display_order=mapping.display_order,
        created_at=mapping.created_at,
        task_definition=TaskDefinitionListResponse(
            id=task_def.id,
            name=task_def.name,
            description=task_def.description,
            task_type=task_def.task_type,
            auto_submit=task_def.auto_submit,
            default_required=task_def.default_required,
            display_order=task_def.display_order,
            is_active=task_def.is_active,
            created_at=task_def.created_at,
        ) if task_def else None,
    )


def delete_project_type_mapping(db: Session, mapping_id: int) -> bool:
    """Delete a project type task mapping."""
    mapping = db.query(ProjectTypeTaskMapping).filter(ProjectTypeTaskMapping.id == mapping_id).first()
    if not mapping:
        return False

    db.delete(mapping)
    db.commit()
    return True


# =============================================================================
# Project Task Creation
# =============================================================================

def get_tasks_for_project_type(db: Session, project_type: str) -> List[ProjectTypeTaskMapping]:
    """Get the task definitions mapped to a project type."""
    return (
        db.query(ProjectTypeTaskMapping)
        .join(TaskDefinition)
        .filter(
            ProjectTypeTaskMapping.project_type == project_type,
            TaskDefinition.is_active == True,
        )
        .order_by(ProjectTypeTaskMapping.display_order)
        .all()
    )


def create_project_tasks(
    db: Session,
    project_id: UUID,
    project_type: str,
    owner_id: UUID,
) -> List[Task]:
    """Auto-create tasks for a new project based on its type."""
    mappings = get_tasks_for_project_type(db, project_type)

    created_tasks = []
    for mapping in mappings:
        task_def = mapping.task_definition

        task = Task(
            project_id=project_id,
            created_by_id=owner_id,
            assigned_to_id=owner_id,  # Initially assign to project owner
            task_definition_id=task_def.id,
            title=task_def.name,
            description=task_def.description,
            task_type=task_def.task_type,
            status="pending",
            priority="medium",
            is_required=mapping.is_required,
        )
        db.add(task)
        created_tasks.append(task)

    if created_tasks:
        db.commit()
        for task in created_tasks:
            db.refresh(task)

    return created_tasks


# =============================================================================
# Project Task Progress
# =============================================================================

def get_project_task_progress(db: Session, project_id: UUID) -> ProjectTaskProgress:
    """Get task completion progress for a project."""
    tasks = (
        db.query(Task)
        .filter(Task.project_id == project_id)
        .order_by(Task.id)
        .all()
    )

    total = len(tasks)
    completed = sum(1 for t in tasks if t.status in ('completed', 'approved'))
    pending = sum(1 for t in tasks if t.status == 'pending')
    in_progress = sum(1 for t in tasks if t.status == 'in_progress')
    submitted = sum(1 for t in tasks if t.status == 'submitted')
    approved = sum(1 for t in tasks if t.status == 'approved')
    rejected = sum(1 for t in tasks if t.status == 'rejected')
    revision_required = sum(1 for t in tasks if t.status == 'revision_required')

    completion_percentage = (completed / total * 100) if total > 0 else 0.0

    task_items = []
    for task in tasks:
        # Get display order from task definition if available
        display_order = 0
        if task.task_definition_id:
            task_def = db.query(TaskDefinition).filter(TaskDefinition.id == task.task_definition_id).first()
            if task_def:
                display_order = task_def.display_order

        task_items.append(TaskProgressItem(
            task_id=task.id,
            task_definition_id=task.task_definition_id,
            title=task.title,
            description=task.description,
            task_type=task.task_type,
            status=task.status,
            is_required=task.is_required if task.is_required is not None else True,
            display_order=display_order,
            submitted_at=task.submitted_at,
            reviewed_at=task.reviewed_at,
            reviewer_comments=task.reviewer_comments,
            revision_count=task.revision_count if task.revision_count is not None else 0,
        ))

    # Sort by display order
    task_items.sort(key=lambda x: x.display_order)

    return ProjectTaskProgress(
        project_id=str(project_id),
        total_tasks=total,
        completed_tasks=completed,
        pending_tasks=pending,
        in_progress_tasks=in_progress,
        submitted_tasks=submitted,
        approved_tasks=approved,
        rejected_tasks=rejected,
        revision_required_tasks=revision_required,
        completion_percentage=completion_percentage,
        tasks=task_items,
    )
