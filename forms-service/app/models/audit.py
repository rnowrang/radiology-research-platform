"""Audit models for field-level change tracking."""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.database import Base


class FieldChange(Base):
    """Field-level change history for audit trail."""

    __tablename__ = "field_changes"

    id = Column(Integer, primary_key=True, index=True)
    form_instance_id = Column(Integer, ForeignKey("form_instances.id", ondelete="CASCADE"), nullable=False)
    version_id = Column(Integer, ForeignKey("form_versions.id"), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    field_id = Column(String(255), nullable=False)
    field_label = Column(String(500), nullable=True)
    old_value = Column(JSONB, nullable=True)
    new_value = Column(JSONB, nullable=True)
    action_type = Column(String(50), default="update")
    session_id = Column(String(255), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    form_instance = relationship("FormInstance", back_populates="field_changes")
    version = relationship("FormVersion", back_populates="field_changes")
