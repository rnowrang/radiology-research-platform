"""Review stage models for multi-stage workflow."""

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from app.database import Base


class ReviewStage(Base):
    """Define review stages in a workflow."""

    __tablename__ = "review_stages"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    sequence_order = Column(Integer, nullable=False)
    default_deadline_days = Column(Integer, default=7)
    requires_all_previous = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    form_reviews = relationship("FormReview", back_populates="review_stage")
