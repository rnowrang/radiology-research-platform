"""Task definition models."""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class TaskDefinition(Base):
    """Task definition template for project workflows."""

    __tablename__ = "task_definitions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    task_type = Column(String(50), nullable=False)  # document_upload, form_completion, approval_required
    auto_submit = Column(Boolean, default=False)
    default_required = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=True)  # For form_completion tasks
    file_category = Column(String(50), nullable=True)  # For document_upload tasks
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    project_type_mappings = relationship("ProjectTypeTaskMapping", back_populates="task_definition", cascade="all, delete-orphan")
    tasks = relationship("Task", backref="task_definition")
    template = relationship("Template")


class ProjectTypeTaskMapping(Base):
    """Mapping between project types and task definitions."""

    __tablename__ = "project_type_task_mappings"

    id = Column(Integer, primary_key=True, index=True)
    project_type = Column(String(100), nullable=False)
    task_definition_id = Column(Integer, ForeignKey("task_definitions.id", ondelete="CASCADE"), nullable=False)
    is_required = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    task_definition = relationship("TaskDefinition", back_populates="project_type_mappings")

    __table_args__ = (
        UniqueConstraint("project_type", "task_definition_id", name="uq_project_type_task"),
    )
