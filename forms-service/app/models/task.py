"""Task models."""

from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, func
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
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    task_type = Column(String(100), nullable=True)  # document_upload, form_completion, review, approval, general
    status = Column(String(50), default="pending")  # pending, in_progress, completed, blocked, cancelled
    priority = Column(String(20), default="medium")  # low, medium, high, urgent
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    project = relationship("Project", backref="tasks")
    form_instance = relationship("FormInstance", backref="tasks")
