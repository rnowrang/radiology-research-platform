"""Review workflow and comments router."""

from typing import List, Optional
from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import FormInstance, FormVersion, FormData
from app.models.review import ReviewAction, CommentThread, Comment, FormReview
from app.schemas.review import (
    ReviewActionResponse,
    CommentCreate,
    CommentUpdate,
    CommentResponse,
    CommentThreadCreate,
    CommentThreadResponse,
    ReviewQueueItem,
    SubmitForReviewRequest,
    RequestChangesRequest,
    ApproveFormRequest,
    RejectFormRequest,
    ReturnToDraftRequest,
)
from app.services.mention import MentionService
from app.services.task import sync_task_status_from_form

router = APIRouter(prefix="/api/review", tags=["review"])


def get_user_id(x_user_id: Optional[str] = Header(None)) -> Optional[UUID]:
    """Extract user ID from header."""
    if x_user_id:
        return UUID(x_user_id)
    return None


def get_user_role(x_user_role: Optional[str] = Header(None)) -> Optional[str]:
    """Extract user role from header."""
    return x_user_role


# =============================================================================
# Review Queue
# =============================================================================

@router.get("/queue", response_model=List[ReviewQueueItem])
def get_review_queue(
    status: Optional[str] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Get forms pending review (for reviewers/admins)."""
    if user_role not in ["admin", "reviewer"]:
        raise HTTPException(status_code=403, detail="Only reviewers can access the review queue")

    query = db.query(FormInstance).filter(
        FormInstance.status.in_(["in_review", "needs_changes"])
    )

    if status:
        query = query.filter(FormInstance.status == status)

    forms = query.order_by(FormInstance.submitted_at.desc()).all()

    result = []
    for form in forms:
        # Count unresolved comments
        unresolved = db.query(func.count(CommentThread.id)).filter(
            CommentThread.form_instance_id == form.id,
            CommentThread.is_resolved == False
        ).scalar()

        result.append(ReviewQueueItem(
            id=form.id,
            title=form.title,
            template_name=form.template.name if form.template else "Unknown",
            template_version=form.template.version if form.template else "1.0",
            owner_id=form.owner_id,
            owner_name=None,  # Would need user lookup
            status=form.status,
            submitted_at=form.submitted_at,
            current_version_number=form.current_version_number,
            unresolved_comments=unresolved or 0,
        ))

    return result


# =============================================================================
# Review Actions
# =============================================================================

@router.post("/forms/{form_id}/submit", response_model=ReviewActionResponse)
def submit_for_review(
    form_id: int,
    request: SubmitForReviewRequest = None,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Submit a form for review."""
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if form.status not in ["draft", "needs_changes"]:
        raise HTTPException(status_code=400, detail=f"Cannot submit form with status '{form.status}'")

    # Get the next version number
    max_version = db.query(func.max(FormVersion.version_number)).filter(
        FormVersion.form_instance_id == form_id
    ).scalar() or 0
    next_version_number = max_version + 1

    # Create version snapshot
    form_data = db.query(FormData).filter(FormData.form_instance_id == form_id).first()
    version = FormVersion(
        form_instance_id=form_id,
        version_number=next_version_number,
        version_label=f"Submitted v{next_version_number}",
        data_snapshot=form_data.data if form_data else {},
        conditional_state_snapshot=form_data.conditional_state if form_data else {},
        status_at_creation=form.status,
        change_summary="Submitted for review",
        created_by_id=user_id,
    )
    db.add(version)
    db.flush()

    # Update form status
    form.status = "in_review"
    form.submitted_at = datetime.utcnow()
    form.current_version_number = next_version_number + 1

    # Create review action record
    action = ReviewAction(
        form_instance_id=form_id,
        version_id=version.id,
        performed_by_id=user_id,
        action_type="submit_for_review",
        notes=request.notes if request else None,
    )
    db.add(action)
    db.commit()
    db.refresh(action)

    # Sync linked task status (form in_review -> task submitted)
    sync_task_status_from_form(db, form_id, form.status)

    return action


@router.post("/forms/{form_id}/request-changes", response_model=ReviewActionResponse)
def request_changes(
    form_id: int,
    request: RequestChangesRequest,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Request changes on a form (reviewer/admin only)."""
    if user_role not in ["admin", "reviewer"]:
        raise HTTPException(status_code=403, detail="Only reviewers can request changes")

    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if form.status != "in_review":
        raise HTTPException(status_code=400, detail="Can only request changes on forms in review")

    # Update form status
    form.status = "needs_changes"

    # Create review action record
    action = ReviewAction(
        form_instance_id=form_id,
        performed_by_id=user_id,
        action_type="request_changes",
        notes=request.notes,
    )
    db.add(action)
    db.commit()
    db.refresh(action)

    # Sync linked task status (form needs_changes -> task revision_required)
    sync_task_status_from_form(db, form_id, form.status)

    return action


@router.post("/forms/{form_id}/approve", response_model=ReviewActionResponse)
def approve_form(
    form_id: int,
    request: ApproveFormRequest = None,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Approve a form (reviewer/admin only)."""
    if user_role not in ["admin", "reviewer"]:
        raise HTTPException(status_code=403, detail="Only reviewers can approve forms")

    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if form.status != "in_review":
        raise HTTPException(status_code=400, detail="Can only approve forms in review")

    # Update form status
    form.status = "approved"
    form.approved_at = datetime.utcnow()

    # Create review action record
    action = ReviewAction(
        form_instance_id=form_id,
        performed_by_id=user_id,
        action_type="approve",
        notes=request.notes if request else None,
    )
    db.add(action)
    db.commit()
    db.refresh(action)

    # Sync linked task status (form approved -> task approved)
    sync_task_status_from_form(db, form_id, form.status)

    return action


@router.post("/forms/{form_id}/reject", response_model=ReviewActionResponse)
def reject_form(
    form_id: int,
    request: RejectFormRequest,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
    user_role: Optional[str] = Depends(get_user_role),
):
    """Reject a form (reviewer/admin only)."""
    if user_role not in ["admin", "reviewer"]:
        raise HTTPException(status_code=403, detail="Only reviewers can reject forms")

    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if form.status != "in_review":
        raise HTTPException(status_code=400, detail="Can only reject forms in review")

    # Update form status
    form.status = "rejected"

    # Create review action record
    action = ReviewAction(
        form_instance_id=form_id,
        performed_by_id=user_id,
        action_type="reject",
        notes=request.notes,
    )
    db.add(action)
    db.commit()
    db.refresh(action)

    # Sync linked task status (form rejected -> task rejected)
    sync_task_status_from_form(db, form_id, form.status)

    return action


@router.post("/forms/{form_id}/return-to-draft", response_model=ReviewActionResponse)
def return_to_draft(
    form_id: int,
    request: ReturnToDraftRequest = None,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Return a form to draft status."""
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    if form.status not in ["in_review", "needs_changes"]:
        raise HTTPException(status_code=400, detail="Can only return forms in review or needs_changes to draft")

    # Update form status
    form.status = "draft"

    # Create review action record
    action = ReviewAction(
        form_instance_id=form_id,
        performed_by_id=user_id,
        action_type="return_to_draft",
        notes=request.notes if request else None,
    )
    db.add(action)
    db.commit()
    db.refresh(action)

    # Sync linked task status (form draft -> task in_progress)
    sync_task_status_from_form(db, form_id, form.status)

    return action


@router.get("/forms/{form_id}/history", response_model=List[ReviewActionResponse])
def get_review_history(
    form_id: int,
    db: Session = Depends(get_db),
):
    """Get review history for a form."""
    actions = db.query(ReviewAction).filter(
        ReviewAction.form_instance_id == form_id
    ).order_by(ReviewAction.created_at.desc()).all()

    return actions


# =============================================================================
# Comments
# =============================================================================

@router.get("/forms/{form_id}/comments", response_model=List[CommentThreadResponse])
def get_comment_threads(
    form_id: int,
    include_resolved: bool = Query(False, description="Include resolved threads"),
    db: Session = Depends(get_db),
):
    """Get comment threads for a form."""
    query = db.query(CommentThread).filter(CommentThread.form_instance_id == form_id)

    if not include_resolved:
        query = query.filter(CommentThread.is_resolved == False)

    threads = query.order_by(CommentThread.created_at.desc()).all()

    result = []
    for thread in threads:
        comments = [c for c in thread.comments if not c.is_deleted]
        result.append(CommentThreadResponse(
            id=thread.id,
            form_instance_id=thread.form_instance_id,
            field_id=thread.field_id,
            section_id=thread.section_id,
            is_resolved=thread.is_resolved,
            resolved_at=thread.resolved_at,
            resolved_by_id=thread.resolved_by_id,
            created_at=thread.created_at,
            comments=[CommentResponse(
                id=c.id,
                thread_id=c.thread_id,
                parent_comment_id=c.parent_comment_id,
                author_id=c.author_id,
                content=c.content,
                is_edited=c.is_edited,
                is_deleted=c.is_deleted,
                created_at=c.created_at,
                updated_at=c.updated_at,
            ) for c in comments],
            comment_count=len(comments),
        ))

    return result


@router.get("/forms/{form_id}/mentionable-users")
def get_mentionable_users(
    form_id: int,
    db: Session = Depends(get_db),
):
    """
    Get users that can be mentioned in comments on this form.

    Returns collaborators, owner, and reviewers.
    """
    # Check form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    users = MentionService.get_mentionable_users(db, form_id)
    return {"users": users}


@router.post("/forms/{form_id}/comments", response_model=CommentThreadResponse)
def create_comment(
    form_id: int,
    request: CommentCreate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Create a new comment (creates thread if needed)."""
    # Check form exists
    form = db.query(FormInstance).filter(FormInstance.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")

    # Find or create thread for this field/section
    thread = None
    if request.field_id or request.section_id:
        thread = db.query(CommentThread).filter(
            CommentThread.form_instance_id == form_id,
            CommentThread.field_id == request.field_id,
            CommentThread.section_id == request.section_id,
            CommentThread.is_resolved == False,
        ).first()

    if not thread:
        thread = CommentThread(
            form_instance_id=form_id,
            field_id=request.field_id,
            section_id=request.section_id,
        )
        db.add(thread)
        db.flush()

    # Create comment
    comment = Comment(
        thread_id=thread.id,
        parent_comment_id=request.parent_comment_id,
        author_id=user_id,
        content=request.content,
    )
    db.add(comment)
    db.flush()

    # Process mentions in the comment
    mentions, mentioned_users = MentionService.process_comment_mentions(
        db=db,
        comment_id=comment.id,
        content=request.content,
        form_id=form_id,
    )

    db.commit()
    db.refresh(thread)

    comments = [c for c in thread.comments if not c.is_deleted]
    response = CommentThreadResponse(
        id=thread.id,
        form_instance_id=thread.form_instance_id,
        field_id=thread.field_id,
        section_id=thread.section_id,
        is_resolved=thread.is_resolved,
        resolved_at=thread.resolved_at,
        resolved_by_id=thread.resolved_by_id,
        created_at=thread.created_at,
        comments=[CommentResponse(
            id=c.id,
            thread_id=c.thread_id,
            parent_comment_id=c.parent_comment_id,
            author_id=c.author_id,
            content=c.content,
            is_edited=c.is_edited,
            is_deleted=c.is_deleted,
            created_at=c.created_at,
            updated_at=c.updated_at,
        ) for c in comments],
        comment_count=len(comments),
    )

    # Add mentioned users to response for notification purposes
    if mentioned_users:
        return {
            **response.model_dump(),
            "mentioned_users": mentioned_users,
        }

    return response


@router.post("/threads/{thread_id}/reply", response_model=CommentResponse)
def reply_to_thread(
    thread_id: int,
    request: CommentCreate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Reply to an existing comment thread."""
    thread = db.query(CommentThread).filter(CommentThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    if thread.is_resolved:
        raise HTTPException(status_code=400, detail="Cannot reply to resolved thread")

    comment = Comment(
        thread_id=thread_id,
        parent_comment_id=request.parent_comment_id,
        author_id=user_id,
        content=request.content,
    )
    db.add(comment)
    db.flush()

    # Process mentions in the reply
    mentions, mentioned_users = MentionService.process_comment_mentions(
        db=db,
        comment_id=comment.id,
        content=request.content,
        form_id=thread.form_instance_id,
    )

    db.commit()
    db.refresh(comment)

    response = CommentResponse(
        id=comment.id,
        thread_id=comment.thread_id,
        parent_comment_id=comment.parent_comment_id,
        author_id=comment.author_id,
        content=comment.content,
        is_edited=comment.is_edited,
        is_deleted=comment.is_deleted,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )

    # Add mentioned users to response for notification purposes
    if mentioned_users:
        return {
            **response.model_dump(),
            "mentioned_users": mentioned_users,
        }

    return response


@router.post("/threads/{thread_id}/resolve")
def resolve_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Resolve a comment thread."""
    thread = db.query(CommentThread).filter(CommentThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread.is_resolved = True
    thread.resolved_at = datetime.utcnow()
    thread.resolved_by_id = user_id

    db.commit()

    return {"success": True, "message": "Thread resolved"}


@router.post("/threads/{thread_id}/reopen")
def reopen_thread(
    thread_id: int,
    db: Session = Depends(get_db),
):
    """Reopen a resolved comment thread."""
    thread = db.query(CommentThread).filter(CommentThread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    thread.is_resolved = False
    thread.resolved_at = None
    thread.resolved_by_id = None

    db.commit()

    return {"success": True, "message": "Thread reopened"}


@router.put("/comments/{comment_id}", response_model=CommentResponse)
def update_comment(
    comment_id: int,
    request: CommentUpdate,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Update a comment."""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.author_id != user_id:
        raise HTTPException(status_code=403, detail="Can only edit your own comments")

    comment.content = request.content
    comment.is_edited = True
    comment.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(comment)

    return CommentResponse(
        id=comment.id,
        thread_id=comment.thread_id,
        parent_comment_id=comment.parent_comment_id,
        author_id=comment.author_id,
        content=comment.content,
        is_edited=comment.is_edited,
        is_deleted=comment.is_deleted,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[UUID] = Depends(get_user_id),
):
    """Soft delete a comment."""
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.author_id != user_id:
        raise HTTPException(status_code=403, detail="Can only delete your own comments")

    comment.is_deleted = True
    comment.updated_at = datetime.utcnow()

    db.commit()

    return {"success": True, "message": "Comment deleted"}
