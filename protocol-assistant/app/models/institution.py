"""Institution feature flags and configuration models."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    JSON,
    Boolean,
    Index,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class InstitutionFeatureFlags(Base):
    """
    Feature flags and configuration for each institution.

    Controls which AI features are enabled, LLM provider settings,
    rate limits, and integration configurations.
    """
    __tablename__ = "institution_feature_flags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    institution_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    institution_name = Column(String(500), nullable=True)

    # Core AI Features
    ai_assistant_enabled = Column(Boolean, default=True)
    document_extraction_enabled = Column(Boolean, default=True)
    gap_analysis_enabled = Column(Boolean, default=True)
    document_generation_enabled = Column(Boolean, default=True)
    form_prefill_enabled = Column(Boolean, default=True)
    coherence_checking_enabled = Column(Boolean, default=True)

    # LLM Provider Configuration
    allowed_llm_providers = Column(ARRAY(String), default=["claude"])  # claude, openai, etc.
    default_llm_provider = Column(String(50), default="claude")
    fallback_behavior = Column(String(50), default="error")  # error, queue, alternate
    max_retries = Column(Integer, default=3)

    # Usage Limits
    daily_request_limit = Column(Integer, default=1000)
    monthly_token_budget = Column(Integer, default=1000000)
    max_document_size_mb = Column(Integer, default=50)
    max_concurrent_sessions = Column(Integer, default=100)

    # Integration Settings
    integrations_enabled = Column(JSON, default=dict)  # {"hl7_fhir": true, "redcap": false}

    # Advanced Features
    custom_prompts_enabled = Column(Boolean, default=False)
    rag_knowledge_base_enabled = Column(Boolean, default=False)
    ab_testing_enabled = Column(Boolean, default=True)
    advanced_analytics_enabled = Column(Boolean, default=False)

    # Compliance Settings
    audit_log_retention_days = Column(Integer, default=2555)  # ~7 years for compliance
    require_electronic_signatures = Column(Boolean, default=False)
    cfr_part_11_compliant = Column(Boolean, default=False)

    # Custom Configuration
    custom_config = Column(JSON, nullable=True)  # Institution-specific settings

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    knowledge_documents = relationship("KnowledgeDocument", back_populates="institution")
    usage_analytics = relationship("UsageAnalytics", back_populates="institution")
    compliance_logs = relationship("ComplianceAuditLog", back_populates="institution")

    __table_args__ = (
        CheckConstraint("daily_request_limit > 0", name="ck_institution_daily_limit_positive"),
        CheckConstraint("monthly_token_budget > 0", name="ck_institution_monthly_budget_positive"),
        CheckConstraint("max_document_size_mb > 0", name="ck_institution_max_doc_size_positive"),
        CheckConstraint("max_retries >= 0", name="ck_institution_max_retries_non_negative"),
    )
