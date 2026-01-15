"""Review and collaboration models."""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class ReviewAction(Base):
    """Track review actions on forms."""

    __tablename__ = "review_actions"

    id = Column(Integer, primary_key=True, index=True)
    form_instance_id = Column(Integer, ForeignKey("form_instances.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(Integer, ForeignKey("form_versions.id"), nullable=True)
    performed_by_id = Column(UUID(as_uuid=True), nullable=False)
    action_type = Column(String(50), nullable=False)  # submit_for_review, request_changes, approve, reject, return_to_draft
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    form_instance = relationship("FormInstance", back_populates="review_actions")
    version = relationship("FormVersion", back_populates="review_actions")


class FormReview(Base):
    """Form review assignments."""

    __tablename__ = "form_reviews"

    id = Column(Integer, primary_key=True, index=True)
    form_instance_id = Column(Integer, ForeignKey("form_instances.id", ondelete="CASCADE"), nullable=False)
    review_stage_id = Column(Integer, ForeignKey("review_stages.id"), nullable=True)
    reviewer_id = Column(UUID(as_uuid=True), nullable=True)
    status = Column(String(50), default="pending")  # pending, assigned, in_progress, approved, rejected, revision_required
    deadline = Column(Date, nullable=True)
    overall_comments = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    form_instance = relationship("FormInstance", back_populates="reviews")
    review_stage = relationship("ReviewStage", back_populates="form_reviews")


class CommentThread(Base):
    """Comment threads on form fields or sections."""

    __tablename__ = "comment_threads"

    id = Column(Integer, primary_key=True, index=True)
    form_instance_id = Column(Integer, ForeignKey("form_instances.id", ondelete="CASCADE"), nullable=False)
    field_id = Column(String(255), nullable=True)
    section_id = Column(String(255), nullable=True)
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    form_instance = relationship("FormInstance", back_populates="comment_threads")
    comments = relationship("Comment", back_populates="thread", order_by="Comment.created_at")


class Comment(Base):
    """Individual comments within threads."""

    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    thread_id = Column(Integer, ForeignKey("comment_threads.id", ondelete="CASCADE"), nullable=False)
    parent_comment_id = Column(Integer, ForeignKey("comments.id"), nullable=True)
    author_id = Column(UUID(as_uuid=True), nullable=False)
    content = Column(Text, nullable=False)
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    thread = relationship("CommentThread", back_populates="comments")
    replies = relationship("Comment", backref="parent", remote_side=[id])
