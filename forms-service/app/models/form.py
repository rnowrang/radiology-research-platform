"""Form instance and version models."""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.database import Base


class FormInstance(Base):
    """Form instance - a user's form submission."""

    __tablename__ = "form_instances"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    owner_id = Column(UUID(as_uuid=True), nullable=False)
    title = Column(String(500), nullable=False)
    status = Column(String(50), default="draft")
    current_version_number = Column(Integer, default=1)
    completion_percentage = Column(Integer, default=0)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    template = relationship("Template", back_populates="form_instances")
    data = relationship("FormData", back_populates="form_instance", uselist=False)
    versions = relationship("FormVersion", back_populates="form_instance", order_by="FormVersion.version_number.desc()")
    field_changes = relationship("FieldChange", back_populates="form_instance")
    review_actions = relationship("ReviewAction", back_populates="form_instance", order_by="ReviewAction.created_at.desc()")
    reviews = relationship("FormReview", back_populates="form_instance")
    comment_threads = relationship("CommentThread", back_populates="form_instance")


class FormData(Base):
    """Current working data for a form instance."""

    __tablename__ = "form_data"

    id = Column(Integer, primary_key=True, index=True)
    form_instance_id = Column(Integer, ForeignKey("form_instances.id", ondelete="CASCADE"), unique=True, nullable=False)
    data = Column(JSONB, default=dict)
    conditional_state = Column(JSONB, default=dict)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    form_instance = relationship("FormInstance", back_populates="data")


class FormVersion(Base):
    """Immutable snapshot of form data at a point in time."""

    __tablename__ = "form_versions"

    id = Column(Integer, primary_key=True, index=True)
    form_instance_id = Column(Integer, ForeignKey("form_instances.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    version_label = Column(String(100), nullable=True)
    data_snapshot = Column(JSONB, nullable=False)
    conditional_state_snapshot = Column(JSONB, nullable=True)
    status_at_creation = Column(String(50), nullable=True)
    change_summary = Column(Text, nullable=True)
    generated_docx_path = Column(String(500), nullable=True)
    generated_pdf_path = Column(String(500), nullable=True)
    created_by_id = Column(UUID(as_uuid=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    form_instance = relationship("FormInstance", back_populates="versions")
    field_changes = relationship("FieldChange", back_populates="version")
    review_actions = relationship("ReviewAction", back_populates="version")
