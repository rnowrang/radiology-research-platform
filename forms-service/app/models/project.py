"""Project models."""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Date, func, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.database import Base


class Project(Base):
    """Research project."""

    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    project_type = Column(String(100), nullable=True)  # retrospective, prospective, clinical_trial, etc.
    department = Column(String(255), nullable=True)
    principal_investigator_id = Column(UUID(as_uuid=True), nullable=False)
    status = Column(String(50), default="draft")  # draft, active, completed, archived
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    collaborators = relationship("ProjectCollaborator", back_populates="project", cascade="all, delete-orphan")
    form_instances = relationship("FormInstance", backref="project", foreign_keys="FormInstance.project_id")


class ProjectCollaborator(Base):
    """Project collaborator assignment."""

    __tablename__ = "project_collaborators"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    role = Column(String(50), nullable=False)  # co_investigator, research_assistant, coordinator
    added_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", back_populates="collaborators")

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_collaborator"),
    )
