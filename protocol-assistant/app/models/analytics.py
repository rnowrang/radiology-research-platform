"""Usage analytics models for Protocol Assistant."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
    Index,
    Numeric,
    Date,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class UsageAnalytics(Base):
    """
    Daily aggregate usage statistics per institution.

    Provides insights into feature usage, costs, and user activity
    for billing and optimization purposes.
    """
    __tablename__ = "usage_analytics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Scope
    institution_id = Column(
        UUID(as_uuid=True),
        ForeignKey("institution_feature_flags.institution_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date = Column(Date, nullable=False, index=True)

    # Session metrics
    session_count = Column(Integer, default=0)
    session_starts = Column(Integer, default=0)
    session_completions = Column(Integer, default=0)
    session_abandonments = Column(Integer, default=0)

    # Document metrics
    document_count = Column(Integer, default=0)
    documents_uploaded = Column(Integer, default=0)
    documents_extracted = Column(Integer, default=0)

    # Generation metrics
    generation_count = Column(Integer, default=0)
    prefill_count = Column(Integer, default=0)
    gap_analyses_count = Column(Integer, default=0)
    coherence_checks_count = Column(Integer, default=0)

    # Token usage
    token_count = Column(Integer, default=0)
    tokens_claude = Column(Integer, default=0)
    tokens_openai = Column(Integer, default=0)
    tokens_input = Column(Integer, default=0)
    tokens_output = Column(Integer, default=0)

    # User metrics
    active_user_count = Column(Integer, default=0)
    unique_users = Column(JSON, default=[])  # List of unique user IDs

    # Performance metrics
    avg_session_duration_seconds = Column(Integer, nullable=True)
    avg_response_time_ms = Column(Integer, nullable=True)
    completion_rate = Column(Numeric(5, 2), nullable=True)  # Percentage

    # Error tracking
    error_count = Column(Integer, default=0)
    errors_by_type = Column(JSON, default={})

    # Cost tracking
    cost_claude = Column(Numeric(10, 4), default=0)  # USD
    cost_openai = Column(Numeric(10, 4), default=0)  # USD
    cost_total = Column(Numeric(10, 4), default=0)

    # Feature usage breakdown
    feature_usage = Column(JSON, default={})  # Counts by feature

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    institution = relationship("InstitutionFeatureFlags", back_populates="usage_analytics")

    __table_args__ = (
        UniqueConstraint("institution_id", "date", name="uq_usage_analytics_institution_date"),
        Index("ix_usage_analytics_date", "date"),
        Index("ix_usage_analytics_institution_date", "institution_id", "date"),
    )


class UserActivity(Base):
    """
    Individual user activity tracking.

    Records significant user actions for analytics and
    understanding usage patterns.
    """
    __tablename__ = "user_activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # User context
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    institution_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    session_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Activity details
    activity_type = Column(String(100), nullable=False)  # session_start, document_upload, generation, etc.
    activity_detail = Column(String(255), nullable=True)
    activity_metadata = Column("metadata", JSON, nullable=True)

    # Resource reference
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(String(255), nullable=True)

    # Performance
    duration_ms = Column(Integer, nullable=True)
    success = Column(Boolean, default=True)

    # Timestamp
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_user_activities_type", "activity_type"),
        Index("ix_user_activities_user_created", "user_id", "created_at"),
        Index("ix_user_activities_created_at", "created_at"),
    )


class FeatureUsageMetric(Base):
    """
    Tracks usage of specific features for optimization and reporting.
    """
    __tablename__ = "feature_usage_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Scope
    institution_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Feature identification
    feature_name = Column(String(100), nullable=False, index=True)
    feature_version = Column(String(50), nullable=True)

    # Usage
    invocation_count = Column(Integer, default=1)
    success_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)

    # Performance
    avg_latency_ms = Column(Integer, nullable=True)
    total_tokens = Column(Integer, default=0)

    # Time period
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_feature_usage_metrics_feature", "feature_name"),
        Index("ix_feature_usage_metrics_period", "period_start", "period_end"),
    )
