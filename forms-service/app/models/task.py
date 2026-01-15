"""Task models."""

from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Boolean, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Task(Base):
    """Task for project or form work."""

    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    form_instance_id = Column(Integer, ForeignKey("form_instances.id"), nullable=True)
    assigned_to_id = Column(UUID(as_uuid=True), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), nullable=False)
    task_definition_id = Column(Integer, ForeignKey("task_definitions.id"), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    task_type = Column(String(100), nullable=True)  # document_upload, form_completion, review, approval, general
    status = Column(String(50), default="pending")  # pending, in_progress, submitted, approved, rejected, revision_required, completed, blocked, cancelled
    priority = Column(String(20), default="medium")  # low, medium, high, urgent
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_id = Column(UUID(as_uuid=True), nullable=True)  # FK to users.id set at DB level
    reviewer_comments = Column(Text, nullable=True)
    revision_count = Column(Integer, default=0)
    is_required = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    project = relationship("Project", backref="tasks")
    form_instance = relationship("FormInstance", backref="tasks")
