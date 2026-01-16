"""Services for Forms Service."""

from app.services.document import DocumentService
from app.services.lock import LockService, lock_service
from app.services.mention import MentionService, mention_service
from app.services.task import (
    auto_complete_upload_task,
    auto_complete_upload_task_by_name,
    sync_task_status_from_form,
    get_task_for_form,
    create_form_for_task,
    FILE_CATEGORY_TASK_MAP,
    FORM_TO_TASK_STATUS_MAP,
)

__all__ = [
    "DocumentService",
    "LockService",
    "lock_service",
    "MentionService",
    "mention_service",
    "auto_complete_upload_task",
    "auto_complete_upload_task_by_name",
    "sync_task_status_from_form",
    "get_task_for_form",
    "create_form_for_task",
    "FILE_CATEGORY_TASK_MAP",
    "FORM_TO_TASK_STATUS_MAP",
]
