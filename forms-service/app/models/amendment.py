"""Amendment models for form changes after approval."""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.database import Base


class Amendment(Base):
    """Amendment request for an approved/locked form."""

    __tablename__ = "amendments"

    id = Column(Integer, primary_key=True, index=True)
    form_instance_id = Column(Integer, ForeignKey("form_instances.id", ondelete="CASCADE"), nullable=False)
    amendment_type = Column(String(100), nullable=False)
    status = Column(String(50), default="draft")  # draft, submitted, approved, rejected, withdrawn
    description = Column(Text, nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    submitted_by_id = Column(UUID(as_uuid=True), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by_id = Column(UUID(as_uuid=True), nullable=True)
    review_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by_id = Column(UUID(as_uuid=True), nullable=False)

    # Relationships
    form_instance = relationship("FormInstance", backref="amendments")
    field_changes = relationship(
        "AmendmentFieldChange",
        back_populates="amendment",
        cascade="all, delete-orphan",
        order_by="AmendmentFieldChange.id"
    )


class AmendmentFieldChange(Base):
    """Individual field change within an amendment."""

    __tablename__ = "amendment_field_changes"

    id = Column(Integer, primary_key=True, index=True)
    amendment_id = Column(Integer, ForeignKey("amendments.id", ondelete="CASCADE"), nullable=False)
    field_id = Column(String(255), nullable=False)
    field_label = Column(String(500), nullable=True)
    old_value = Column(JSONB, nullable=True)
    new_value = Column(JSONB, nullable=True)
    justification = Column(Text, nullable=True)

    # Relationships
    amendment = relationship("Amendment", back_populates="field_changes")
