"""Feature flag models for Protocol Assistant.

This module provides database models for feature flag management:
- FeatureFlag: Defines available feature flags with defaults
- FeatureFlagOverride: Institution or user-level overrides
- FeatureFlagAudit: Audit trail for flag changes
"""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
    Index,
    UniqueConstraint,
    Float,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class FeatureFlag(Base):
    """
    Defines a feature flag with its default state.

    Feature flags control the availability of features across the system.
    They can be:
    - Globally enabled/disabled via environment variables
    - Overridden at institution level
    - Overridden at user level (for premium features)
    - Used for A/B testing with percentage rollout
    """
    __tablename__ = "feature_flags"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Flag identification
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(50), nullable=True, index=True)  # ai, ux, admin, beta, etc.

    # Default state
    is_enabled = Column(Boolean, default=False, nullable=False)

    # Rollout configuration for A/B testing
    rollout_percentage = Column(Float, default=100.0)  # 0-100, used for gradual rollout
    rollout_groups = Column(JSON, nullable=True)  # Specific groups to include/exclude

    # Metadata
    metadata = Column("flag_metadata", JSON, nullable=True)

    # Feature type
    flag_type = Column(String(20), default="boolean")  # boolean, percentage, config

    # Lifecycle
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), nullable=True)

    # Dependencies
    depends_on = Column(JSON, nullable=True)  # List of flag names this depends on

    # Relationships
    overrides = relationship("FeatureFlagOverride", back_populates="flag", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_feature_flags_category", "category"),
        Index("ix_feature_flags_enabled", "is_enabled"),
    )


class FeatureFlagOverride(Base):
    """
    Override a feature flag for a specific institution or user.

    Priority order (highest to lowest):
    1. User-level override
    2. Institution-level override
    3. Global flag default
    4. Environment variable default
    """
    __tablename__ = "feature_flag_overrides"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Reference to the flag
    flag_id = Column(Integer, ForeignKey("feature_flags.id", ondelete="CASCADE"), nullable=False)

    # Scope (one of these should be set)
    institution_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Override value
    is_enabled = Column(Boolean, nullable=False)
    custom_config = Column(JSON, nullable=True)  # For config-type flags

    # Expiration (for temporary overrides)
    expires_at = Column(DateTime, nullable=True)

    # Audit
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), nullable=True)
    reason = Column(Text, nullable=True)  # Why this override was created

    # Relationship
    flag = relationship("FeatureFlag", back_populates="overrides")

    __table_args__ = (
        # Unique constraint: one override per (flag, institution) or (flag, user)
        UniqueConstraint("flag_id", "institution_id", name="uq_flag_institution"),
        UniqueConstraint("flag_id", "user_id", name="uq_flag_user"),
        Index("ix_feature_flag_overrides_flag", "flag_id"),
        Index("ix_feature_flag_overrides_institution", "institution_id"),
        Index("ix_feature_flag_overrides_user", "user_id"),
    )


class FeatureFlagAudit(Base):
    """
    Audit trail for feature flag changes.

    Records all changes to flags and overrides for compliance.
    """
    __tablename__ = "feature_flag_audit"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # What changed
    flag_name = Column(String(100), nullable=False, index=True)
    action = Column(String(50), nullable=False)  # created, updated, deleted, override_created, etc.

    # Who made the change
    actor_id = Column(UUID(as_uuid=True), nullable=True)
    actor_email = Column(String(255), nullable=True)

    # Change details
    previous_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)

    # Scope of change
    institution_id = Column(UUID(as_uuid=True), nullable=True)
    user_id = Column(UUID(as_uuid=True), nullable=True)

    # Context
    reason = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)

    # Timestamp
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_feature_flag_audit_flag_name", "flag_name"),
        Index("ix_feature_flag_audit_created_at", "created_at"),
        Index("ix_feature_flag_audit_actor", "actor_id"),
    )


# Default feature flags to seed the database
DEFAULT_FLAGS = [
    {
        "name": "semantic_search",
        "description": "Enable vector-based semantic search in knowledge base",
        "category": "ai",
        "is_enabled": False,
    },
    {
        "name": "auto_rollback",
        "description": "Automatically rollback prompts when quality drops",
        "category": "ai",
        "is_enabled": True,
    },
    {
        "name": "quality_monitoring",
        "description": "Enable real-time quality monitoring with alerts",
        "category": "ai",
        "is_enabled": True,
    },
    {
        "name": "prompt_playground",
        "description": "Enable prompt testing playground in admin UI",
        "category": "admin",
        "is_enabled": True,
    },
    {
        "name": "cost_alerts",
        "description": "Enable cost threshold alerts",
        "category": "admin",
        "is_enabled": True,
    },
    {
        "name": "ab_testing",
        "description": "Enable A/B testing for prompts",
        "category": "ai",
        "is_enabled": True,
    },
    {
        "name": "bulk_generation",
        "description": "Enable bulk document generation",
        "category": "generation",
        "is_enabled": True,
    },
    {
        "name": "stream_responses",
        "description": "Enable streaming responses for chat",
        "category": "ux",
        "is_enabled": True,
    },
    {
        "name": "export_analytics",
        "description": "Enable analytics export functionality",
        "category": "admin",
        "is_enabled": False,
    },
    {
        "name": "compliance_reports",
        "description": "Enable automated compliance report generation",
        "category": "admin",
        "is_enabled": False,
    },
    {
        "name": "advanced_rag",
        "description": "Enable advanced RAG features (hybrid search, reranking)",
        "category": "ai",
        "is_enabled": False,
    },
    {
        "name": "multi_llm",
        "description": "Enable multi-LLM provider support",
        "category": "ai",
        "is_enabled": False,
    },
]
