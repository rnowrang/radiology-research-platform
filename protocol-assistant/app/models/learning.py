"""A/B testing and feedback models for Protocol Assistant."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
    Float,
    Index,
    CheckConstraint,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class PromptVersion(Base):
    """
    Stores different versions of prompts for A/B testing.

    Enables controlled rollout of prompt changes and measurement
    of their effectiveness through success rates and quality scores.
    """
    __tablename__ = "prompt_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Prompt identification
    prompt_key = Column(String(100), nullable=False, index=True)  # e.g., "gap_analysis", "document_generation"
    version = Column(Integer, nullable=False)
    name = Column(String(200), nullable=True)  # Human-readable version name
    description = Column(Text, nullable=True)

    # Prompt content
    content = Column(Text, nullable=False)  # The actual prompt template
    system_prompt = Column(Text, nullable=True)  # System prompt if separate
    parameters = Column(JSON, nullable=True)  # LLM parameters (temperature, etc.)

    # A/B Testing Configuration
    traffic_percentage = Column(Float, default=0.0)  # 0-100% of traffic
    is_active = Column(Boolean, default=False)
    is_default = Column(Boolean, default=False)  # Fallback version

    # Performance Metrics (updated periodically)
    success_rate = Column(Float, nullable=True)  # Percentage of successful outputs
    avg_quality_score = Column(Float, nullable=True)  # Average quality rating
    avg_latency_ms = Column(Float, nullable=True)  # Average response time
    sample_count = Column(Integer, default=0)  # Number of uses
    error_count = Column(Integer, default=0)  # Number of errors

    # Lifecycle
    created_by = Column(UUID(as_uuid=True), nullable=True)
    approved_by = Column(UUID(as_uuid=True), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    retired_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    messages = relationship("ChatMessage", back_populates="prompt_version")
    feedback = relationship("AIFeedback", back_populates="prompt_version")

    __table_args__ = (
        UniqueConstraint("prompt_key", "version", name="uq_prompt_versions_key_version"),
        Index("ix_prompt_versions_active", "is_active"),
        Index("ix_prompt_versions_key_active", "prompt_key", "is_active"),
        CheckConstraint(
            "traffic_percentage >= 0 AND traffic_percentage <= 100",
            name="ck_prompt_versions_traffic_percentage_range"
        ),
        CheckConstraint("version > 0", name="ck_prompt_versions_version_positive"),
    )


class AIFeedback(Base):
    """
    User feedback on AI-generated outputs.

    Captures ratings, comments, and corrections to enable
    continuous improvement of AI responses.
    """
    __tablename__ = "ai_feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Context
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    output_id = Column(String(255), nullable=True, index=True)  # Reference to specific output
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("generated_documents.id", ondelete="SET NULL"), nullable=True)

    # User
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    institution_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Feedback content
    rating = Column(Integer, nullable=True)  # 1-5 scale
    feedback_type = Column(String(50), nullable=False)  # quality, accuracy, helpfulness, relevance
    comment = Column(Text, nullable=True)

    # Detailed corrections
    corrections = Column(JSON, nullable=True)  # Structured corrections made by user
    original_content = Column(Text, nullable=True)  # Original AI output
    corrected_content = Column(Text, nullable=True)  # User-corrected version

    # Prompt tracking
    prompt_version_id = Column(Integer, ForeignKey("prompt_versions.id", ondelete="SET NULL"), nullable=True)

    # Classification for learning
    issue_category = Column(String(100), nullable=True)  # factual_error, formatting, tone, etc.
    severity = Column(String(20), nullable=True)  # low, medium, high, critical

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    session = relationship("ChatSession", back_populates="feedback")
    prompt_version = relationship("PromptVersion", back_populates="feedback")

    __table_args__ = (
        Index("ix_ai_feedback_user_created", "user_id", "created_at"),
        Index("ix_ai_feedback_type", "feedback_type"),
        Index("ix_ai_feedback_rating", "rating"),
        CheckConstraint(
            "rating IS NULL OR (rating >= 1 AND rating <= 5)",
            name="ck_ai_feedback_rating_range"
        ),
    )
