"""Initial Protocol Assistant schema

Revision ID: 001
Revises:
Create Date: 2025-01-23

This migration creates all tables for the Protocol Assistant service including:
- Chat sessions and messages
- Generated documents
- Institution feature flags
- A/B testing (prompt versions) and feedback
- Provenance tracking and compliance audit logs
- Electronic signatures (21 CFR Part 11)
- Session handoffs and collaboration
- Knowledge base for RAG
- Usage analytics
- Integration credentials
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # =========================================================================
    # Institution Feature Flags (must be created first due to FK dependencies)
    # =========================================================================
    op.create_table(
        "institution_feature_flags",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("institution_name", sa.String(500), nullable=True),
        # Core AI Features
        sa.Column("ai_assistant_enabled", sa.Boolean(), default=True),
        sa.Column("document_extraction_enabled", sa.Boolean(), default=True),
        sa.Column("gap_analysis_enabled", sa.Boolean(), default=True),
        sa.Column("document_generation_enabled", sa.Boolean(), default=True),
        sa.Column("form_prefill_enabled", sa.Boolean(), default=True),
        sa.Column("coherence_checking_enabled", sa.Boolean(), default=True),
        # LLM Configuration
        sa.Column("allowed_llm_providers", postgresql.ARRAY(sa.String()), default=["claude"]),
        sa.Column("default_llm_provider", sa.String(50), default="claude"),
        sa.Column("fallback_behavior", sa.String(50), default="error"),
        sa.Column("max_retries", sa.Integer(), default=3),
        # Usage Limits
        sa.Column("daily_request_limit", sa.Integer(), default=1000),
        sa.Column("monthly_token_budget", sa.Integer(), default=1000000),
        sa.Column("max_document_size_mb", sa.Integer(), default=50),
        sa.Column("max_concurrent_sessions", sa.Integer(), default=100),
        # Integration Settings
        sa.Column("integrations_enabled", postgresql.JSON(), default={}),
        # Advanced Features
        sa.Column("custom_prompts_enabled", sa.Boolean(), default=False),
        sa.Column("rag_knowledge_base_enabled", sa.Boolean(), default=False),
        sa.Column("ab_testing_enabled", sa.Boolean(), default=True),
        sa.Column("advanced_analytics_enabled", sa.Boolean(), default=False),
        # Compliance Settings
        sa.Column("audit_log_retention_days", sa.Integer(), default=2555),
        sa.Column("require_electronic_signatures", sa.Boolean(), default=False),
        sa.Column("cfr_part_11_compliant", sa.Boolean(), default=False),
        # Custom Configuration
        sa.Column("custom_config", postgresql.JSON(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_institution_feature_flags_institution_id", "institution_feature_flags", ["institution_id"])

    # Check constraints for institution_feature_flags
    op.create_check_constraint(
        "ck_institution_daily_limit_positive",
        "institution_feature_flags",
        "daily_request_limit > 0"
    )
    op.create_check_constraint(
        "ck_institution_monthly_budget_positive",
        "institution_feature_flags",
        "monthly_token_budget > 0"
    )
    op.create_check_constraint(
        "ck_institution_max_doc_size_positive",
        "institution_feature_flags",
        "max_document_size_mb > 0"
    )
    op.create_check_constraint(
        "ck_institution_max_retries_non_negative",
        "institution_feature_flags",
        "max_retries >= 0"
    )

    # =========================================================================
    # Prompt Versions (for A/B testing) - needed before chat_messages
    # =========================================================================
    op.create_table(
        "prompt_versions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("prompt_key", sa.String(100), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        # Content
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("parameters", postgresql.JSON(), nullable=True),
        # A/B Testing
        sa.Column("traffic_percentage", sa.Float(), default=0.0),
        sa.Column("is_active", sa.Boolean(), default=False),
        sa.Column("is_default", sa.Boolean(), default=False),
        # Metrics
        sa.Column("success_rate", sa.Float(), nullable=True),
        sa.Column("avg_quality_score", sa.Float(), nullable=True),
        sa.Column("avg_latency_ms", sa.Float(), nullable=True),
        sa.Column("sample_count", sa.Integer(), default=0),
        sa.Column("error_count", sa.Integer(), default=0),
        # Lifecycle
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("retired_at", sa.DateTime(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_prompt_versions_prompt_key", "prompt_versions", ["prompt_key"])
    op.create_index("ix_prompt_versions_active", "prompt_versions", ["is_active"])
    op.create_index("ix_prompt_versions_key_active", "prompt_versions", ["prompt_key", "is_active"])
    op.create_unique_constraint("uq_prompt_versions_key_version", "prompt_versions", ["prompt_key", "version"])
    op.create_check_constraint(
        "ck_prompt_versions_traffic_percentage_range",
        "prompt_versions",
        "traffic_percentage >= 0 AND traffic_percentage <= 100"
    )
    op.create_check_constraint(
        "ck_prompt_versions_version_positive",
        "prompt_versions",
        "version > 0"
    )

    # =========================================================================
    # Chat Sessions
    # =========================================================================
    op.create_table(
        "chat_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Document reference
        sa.Column("uploaded_document_id", sa.String(255), nullable=True),
        sa.Column("document_filename", sa.String(500), nullable=True),
        # Protocol context
        sa.Column("extracted_protocol", postgresql.JSON(), nullable=True),
        sa.Column("current_gaps", postgresql.JSON(), nullable=True),
        sa.Column("collected_answers", postgresql.JSON(), default={}),
        # Session state
        sa.Column("status", sa.String(50), default="active"),
        sa.Column("completion_percentage", sa.Integer(), default=0),
        # Metadata
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        # LLM tracking
        sa.Column("llm_provider", sa.String(50), nullable=True),
        sa.Column("total_tokens_used", sa.Integer(), default=0),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_chat_sessions_project_id", "chat_sessions", ["project_id"])
    op.create_index("ix_chat_sessions_user_id", "chat_sessions", ["user_id"])
    op.create_index("ix_chat_sessions_institution_id", "chat_sessions", ["institution_id"])
    op.create_index("ix_chat_sessions_project_user", "chat_sessions", ["project_id", "user_id"])
    op.create_index("ix_chat_sessions_status", "chat_sessions", ["status"])
    op.create_index("ix_chat_sessions_created_at", "chat_sessions", ["created_at"])

    # =========================================================================
    # Chat Messages
    # =========================================================================
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        # Content
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("message_type", sa.String(50), default="chat"),
        sa.Column("metadata", postgresql.JSON(), nullable=True),
        # Prompt tracking
        sa.Column("prompt_version_id", sa.Integer(), sa.ForeignKey("prompt_versions.id"), nullable=True),
        # Token tracking
        sa.Column("tokens_used", sa.Integer(), nullable=True),
        # Gap reference
        sa.Column("gap_id", sa.String(100), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])
    op.create_index("ix_chat_messages_session_created", "chat_messages", ["session_id", "created_at"])
    op.create_index("ix_chat_messages_role", "chat_messages", ["role"])

    # =========================================================================
    # Generated Documents
    # =========================================================================
    op.create_table(
        "generated_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Document identification
        sa.Column("document_type", sa.String(100), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("version", sa.Integer(), default=1),
        sa.Column("version_label", sa.String(100), nullable=True),
        # Content
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_html", sa.Text(), nullable=True),
        sa.Column("content_format", sa.String(50), default="markdown"),
        # Template reference
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("template_version", sa.Integer(), nullable=True),
        # Generation metadata
        sa.Column("generation_metadata", postgresql.JSON(), nullable=True),
        sa.Column("source_data", postgresql.JSON(), nullable=True),
        # Document status
        sa.Column("status", sa.String(50), default="draft"),
        sa.Column("is_latest", sa.Boolean(), default=True),
        # Review tracking
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        # Quality metrics
        sa.Column("quality_score", sa.Integer(), nullable=True),
        sa.Column("coherence_score", sa.Integer(), nullable=True),
        sa.Column("completeness_score", sa.Integer(), nullable=True),
        # Hash for integrity
        sa.Column("content_hash", sa.String(64), nullable=True),
        # Parent for versioning
        sa.Column("parent_document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("generated_documents.id", ondelete="SET NULL"), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_generated_documents_session_id", "generated_documents", ["session_id"])
    op.create_index("ix_generated_documents_project_id", "generated_documents", ["project_id"])
    op.create_index("ix_generated_documents_user_id", "generated_documents", ["user_id"])
    op.create_index("ix_generated_documents_institution_id", "generated_documents", ["institution_id"])
    op.create_index("ix_generated_documents_project_type", "generated_documents", ["project_id", "document_type"])
    op.create_index("ix_generated_documents_status", "generated_documents", ["status"])
    op.create_index("ix_generated_documents_created_at", "generated_documents", ["created_at"])
    op.create_check_constraint(
        "ck_generated_documents_version_positive",
        "generated_documents",
        "version > 0"
    )
    op.create_check_constraint(
        "ck_generated_documents_quality_score_range",
        "generated_documents",
        "quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)"
    )

    # =========================================================================
    # AI Feedback
    # =========================================================================
    op.create_table(
        "ai_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Context
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("output_id", sa.String(255), nullable=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True),
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("generated_documents.id", ondelete="SET NULL"), nullable=True),
        # User
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Feedback content
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("feedback_type", sa.String(50), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        # Corrections
        sa.Column("corrections", postgresql.JSON(), nullable=True),
        sa.Column("original_content", sa.Text(), nullable=True),
        sa.Column("corrected_content", sa.Text(), nullable=True),
        # Prompt tracking
        sa.Column("prompt_version_id", sa.Integer(), sa.ForeignKey("prompt_versions.id", ondelete="SET NULL"), nullable=True),
        # Classification
        sa.Column("issue_category", sa.String(100), nullable=True),
        sa.Column("severity", sa.String(20), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_ai_feedback_session_id", "ai_feedback", ["session_id"])
    op.create_index("ix_ai_feedback_output_id", "ai_feedback", ["output_id"])
    op.create_index("ix_ai_feedback_user_id", "ai_feedback", ["user_id"])
    op.create_index("ix_ai_feedback_institution_id", "ai_feedback", ["institution_id"])
    op.create_index("ix_ai_feedback_user_created", "ai_feedback", ["user_id", "created_at"])
    op.create_index("ix_ai_feedback_type", "ai_feedback", ["feedback_type"])
    op.create_index("ix_ai_feedback_rating", "ai_feedback", ["rating"])
    op.create_check_constraint(
        "ck_ai_feedback_rating_range",
        "ai_feedback",
        "rating IS NULL OR (rating >= 1 AND rating <= 5)"
    )

    # =========================================================================
    # Provenance Nodes
    # =========================================================================
    op.create_table(
        "provenance_nodes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Session context
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Node type and actor
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("actor", sa.String(255), nullable=False),
        sa.Column("actor_type", sa.String(50), default="user"),
        # Content reference
        sa.Column("resource_type", sa.String(100), nullable=True),
        sa.Column("resource_id", sa.String(255), nullable=True),
        sa.Column("data_hash", sa.String(64), nullable=False),
        # Lineage
        sa.Column("parent_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), default=[]),
        sa.Column("depth", sa.Integer(), default=0),
        # Metadata
        sa.Column("metadata", postgresql.JSON(), nullable=True),
        sa.Column("llm_provider", sa.String(50), nullable=True),
        sa.Column("llm_model", sa.String(100), nullable=True),
        sa.Column("prompt_version_id", sa.Integer(), nullable=True),
        # Action details
        sa.Column("action", sa.String(100), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_provenance_nodes_session_id", "provenance_nodes", ["session_id"])
    op.create_index("ix_provenance_nodes_project_id", "provenance_nodes", ["project_id"])
    op.create_index("ix_provenance_nodes_type", "provenance_nodes", ["type"])
    op.create_index("ix_provenance_nodes_actor", "provenance_nodes", ["actor"])
    op.create_index("ix_provenance_nodes_resource", "provenance_nodes", ["resource_type", "resource_id"])
    op.create_index("ix_provenance_nodes_created_at", "provenance_nodes", ["created_at"])

    # =========================================================================
    # Compliance Audit Log (append-only)
    # =========================================================================
    op.create_table(
        "compliance_audit_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        # Institution context
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("institution_feature_flags.institution_id", ondelete="SET NULL"), nullable=True),
        # Event classification
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(255), nullable=True),
        # Actor information
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_name", sa.String(255), nullable=True),
        sa.Column("actor_email", sa.String(255), nullable=True),
        sa.Column("actor_role", sa.String(100), nullable=True),
        # Action details
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("action_detail", sa.Text(), nullable=True),
        sa.Column("details", postgresql.JSON(), nullable=True),
        # Request context
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(100), nullable=True),
        # Result
        sa.Column("success", sa.Boolean(), default=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        # Timestamp (immutable)
        sa.Column("timestamp", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_compliance_audit_log_institution_id", "compliance_audit_log", ["institution_id"])
    op.create_index("ix_compliance_audit_log_event_type", "compliance_audit_log", ["event_type"])
    op.create_index("ix_compliance_audit_log_timestamp", "compliance_audit_log", ["timestamp"])
    op.create_index("ix_compliance_audit_log_actor_id", "compliance_audit_log", ["actor_id"])
    op.create_index("ix_compliance_audit_log_actor_timestamp", "compliance_audit_log", ["actor_id", "timestamp"])
    op.create_index("ix_compliance_audit_log_resource", "compliance_audit_log", ["resource_type", "resource_id"])

    # =========================================================================
    # Electronic Signatures (21 CFR Part 11)
    # =========================================================================
    op.create_table(
        "electronic_signatures",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Document reference
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("generated_documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("document_version", sa.Integer(), nullable=False),
        sa.Column("document_hash", sa.String(64), nullable=False),
        # Signer information
        sa.Column("signer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("signer_name", sa.String(255), nullable=False),
        sa.Column("signer_email", sa.String(255), nullable=False),
        sa.Column("signer_title", sa.String(255), nullable=True),
        sa.Column("signer_institution", sa.String(500), nullable=True),
        # Signature details
        sa.Column("meaning", sa.String(100), nullable=False),
        sa.Column("statement", sa.Text(), nullable=True),
        # Timestamp information
        sa.Column("timestamp", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("timezone", sa.String(50), nullable=False, default="UTC"),
        sa.Column("timestamp_utc", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        # System identification
        sa.Column("system_id", sa.String(100), nullable=False),
        sa.Column("system_version", sa.String(50), nullable=True),
        # Cryptographic verification
        sa.Column("signature_hash", sa.String(128), nullable=False),
        sa.Column("signature_algorithm", sa.String(50), default="SHA-256"),
        sa.Column("public_key_fingerprint", sa.String(128), nullable=True),
        # Authentication method
        sa.Column("auth_method", sa.String(50), nullable=False),
        sa.Column("auth_timestamp", sa.DateTime(), nullable=False),
        # IP and context
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        # Validity
        sa.Column("is_valid", sa.Boolean(), default=True),
        sa.Column("invalidated_at", sa.DateTime(), nullable=True),
        sa.Column("invalidation_reason", sa.Text(), nullable=True),
    )
    op.create_index("ix_electronic_signatures_document_id", "electronic_signatures", ["document_id"])
    op.create_index("ix_electronic_signatures_signer", "electronic_signatures", ["signer_id"])
    op.create_index("ix_electronic_signatures_document_signer", "electronic_signatures", ["document_id", "signer_id"])
    op.create_index("ix_electronic_signatures_timestamp", "electronic_signatures", ["timestamp"])
    op.create_check_constraint(
        "ck_electronic_signatures_meaning_valid",
        "electronic_signatures",
        "meaning IN ('approval', 'review', 'author', 'witness', 'acknowledgment')"
    )

    # =========================================================================
    # Session Handoffs
    # =========================================================================
    op.create_table(
        "session_handoffs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Session reference
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        # Users involved
        sa.Column("from_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_user_name", sa.String(255), nullable=True),
        sa.Column("to_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("to_user_name", sa.String(255), nullable=True),
        sa.Column("to_user_email", sa.String(255), nullable=True),
        # Handoff details
        sa.Column("handoff_note", sa.Text(), nullable=True),
        sa.Column("handoff_reason", sa.String(100), nullable=True),
        # Session snapshot
        sa.Column("session_snapshot", postgresql.JSON(), nullable=True),
        sa.Column("completion_at_handoff", sa.Integer(), nullable=True),
        # Status tracking
        sa.Column("status", sa.String(50), default="pending"),
        sa.Column("response_note", sa.Text(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_session_handoffs_session_id", "session_handoffs", ["session_id"])
    op.create_index("ix_session_handoffs_from_user", "session_handoffs", ["from_user_id"])
    op.create_index("ix_session_handoffs_to_user", "session_handoffs", ["to_user_id"])
    op.create_index("ix_session_handoffs_status", "session_handoffs", ["status"])
    op.create_index("ix_session_handoffs_created_at", "session_handoffs", ["created_at"])
    op.create_check_constraint(
        "ck_session_handoffs_status_valid",
        "session_handoffs",
        "status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')"
    )

    # =========================================================================
    # Session Collaborators
    # =========================================================================
    op.create_table(
        "session_collaborators",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Session reference
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False),
        # Collaborator
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_name", sa.String(255), nullable=True),
        sa.Column("user_email", sa.String(255), nullable=True),
        # Permissions
        sa.Column("role", sa.String(50), default="viewer"),
        sa.Column("can_edit", sa.String(50), default="false"),
        sa.Column("can_invite", sa.String(50), default="false"),
        # Invitation tracking
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("invitation_status", sa.String(50), default="accepted"),
        # Activity tracking
        sa.Column("last_accessed_at", sa.DateTime(), nullable=True),
        sa.Column("contribution_count", sa.Integer(), default=0),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_session_collaborators_session_id", "session_collaborators", ["session_id"])
    op.create_index("ix_session_collaborators_user_id", "session_collaborators", ["user_id"])
    op.create_index("ix_session_collaborators_session_user", "session_collaborators", ["session_id", "user_id"], unique=True)
    op.create_index("ix_session_collaborators_role", "session_collaborators", ["role"])
    op.create_check_constraint(
        "ck_session_collaborators_role_valid",
        "session_collaborators",
        "role IN ('owner', 'editor', 'viewer', 'commenter')"
    )

    # =========================================================================
    # Knowledge Documents (RAG)
    # =========================================================================
    op.create_table(
        "knowledge_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Institution scope
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("institution_feature_flags.institution_id", ondelete="CASCADE"), nullable=True),
        # Document identification
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(1000), nullable=True),
        sa.Column("source_filename", sa.String(500), nullable=True),
        # Content
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_type", sa.String(50), default="text"),
        # Categorization
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("subcategory", sa.String(100), nullable=True),
        sa.Column("tags", postgresql.JSON(), default=[]),
        # Embeddings
        sa.Column("embedding_model", sa.String(100), nullable=True),
        sa.Column("has_embeddings", sa.Boolean(), default=False),
        # Chunking
        sa.Column("chunk_index", sa.Integer(), nullable=True),
        sa.Column("parent_document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_documents.id", ondelete="CASCADE"), nullable=True),
        sa.Column("chunk_count", sa.Integer(), nullable=True),
        # Metadata
        sa.Column("metadata", postgresql.JSON(), nullable=True),
        sa.Column("language", sa.String(10), default="en"),
        sa.Column("word_count", sa.Integer(), nullable=True),
        # Versioning
        sa.Column("version", sa.Integer(), default=1),
        sa.Column("is_latest", sa.Boolean(), default=True),
        # Status
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("is_public", sa.Boolean(), default=False),
        # Lifecycle
        sa.Column("added_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.Column("last_indexed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_knowledge_documents_institution_id", "knowledge_documents", ["institution_id"])
    op.create_index("ix_knowledge_documents_category", "knowledge_documents", ["category"])
    op.create_index("ix_knowledge_documents_active", "knowledge_documents", ["is_active"])
    op.create_index("ix_knowledge_documents_institution_category", "knowledge_documents", ["institution_id", "category"])
    op.create_index("ix_knowledge_documents_embeddings", "knowledge_documents", ["has_embeddings"])
    op.create_check_constraint(
        "ck_knowledge_documents_version_positive",
        "knowledge_documents",
        "version > 0"
    )

    # =========================================================================
    # Knowledge Queries
    # =========================================================================
    op.create_table(
        "knowledge_queries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Context
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Query details
        sa.Column("query_text", sa.Text(), nullable=False),
        sa.Column("query_type", sa.String(50), default="semantic"),
        # Results
        sa.Column("result_count", sa.Integer(), nullable=True),
        sa.Column("result_document_ids", postgresql.JSON(), nullable=True),
        sa.Column("top_similarity_score", sa.String(20), nullable=True),
        # Performance
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        # Feedback
        sa.Column("was_helpful", sa.Boolean(), nullable=True),
        sa.Column("user_feedback", sa.Text(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_knowledge_queries_session_id", "knowledge_queries", ["session_id"])
    op.create_index("ix_knowledge_queries_user_id", "knowledge_queries", ["user_id"])
    op.create_index("ix_knowledge_queries_created_at", "knowledge_queries", ["created_at"])
    op.create_index("ix_knowledge_queries_type", "knowledge_queries", ["query_type"])

    # =========================================================================
    # Usage Analytics
    # =========================================================================
    op.create_table(
        "usage_analytics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Scope
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("institution_feature_flags.institution_id", ondelete="CASCADE"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        # Session metrics
        sa.Column("session_count", sa.Integer(), default=0),
        sa.Column("session_starts", sa.Integer(), default=0),
        sa.Column("session_completions", sa.Integer(), default=0),
        sa.Column("session_abandonments", sa.Integer(), default=0),
        # Document metrics
        sa.Column("document_count", sa.Integer(), default=0),
        sa.Column("documents_uploaded", sa.Integer(), default=0),
        sa.Column("documents_extracted", sa.Integer(), default=0),
        # Generation metrics
        sa.Column("generation_count", sa.Integer(), default=0),
        sa.Column("prefill_count", sa.Integer(), default=0),
        sa.Column("gap_analyses_count", sa.Integer(), default=0),
        sa.Column("coherence_checks_count", sa.Integer(), default=0),
        # Token usage
        sa.Column("token_count", sa.Integer(), default=0),
        sa.Column("tokens_claude", sa.Integer(), default=0),
        sa.Column("tokens_openai", sa.Integer(), default=0),
        sa.Column("tokens_input", sa.Integer(), default=0),
        sa.Column("tokens_output", sa.Integer(), default=0),
        # User metrics
        sa.Column("active_user_count", sa.Integer(), default=0),
        sa.Column("unique_users", postgresql.JSON(), default=[]),
        # Performance metrics
        sa.Column("avg_session_duration_seconds", sa.Integer(), nullable=True),
        sa.Column("avg_response_time_ms", sa.Integer(), nullable=True),
        sa.Column("completion_rate", sa.Numeric(5, 2), nullable=True),
        # Error tracking
        sa.Column("error_count", sa.Integer(), default=0),
        sa.Column("errors_by_type", postgresql.JSON(), default={}),
        # Cost tracking
        sa.Column("cost_claude", sa.Numeric(10, 4), default=0),
        sa.Column("cost_openai", sa.Numeric(10, 4), default=0),
        sa.Column("cost_total", sa.Numeric(10, 4), default=0),
        # Feature usage
        sa.Column("feature_usage", postgresql.JSON(), default={}),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_usage_analytics_institution_id", "usage_analytics", ["institution_id"])
    op.create_index("ix_usage_analytics_date", "usage_analytics", ["date"])
    op.create_index("ix_usage_analytics_institution_date", "usage_analytics", ["institution_id", "date"])
    op.create_unique_constraint("uq_usage_analytics_institution_date", "usage_analytics", ["institution_id", "date"])

    # =========================================================================
    # User Activities
    # =========================================================================
    op.create_table(
        "user_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # User context
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Activity details
        sa.Column("activity_type", sa.String(100), nullable=False),
        sa.Column("activity_detail", sa.String(255), nullable=True),
        sa.Column("metadata", postgresql.JSON(), nullable=True),
        # Resource reference
        sa.Column("resource_type", sa.String(100), nullable=True),
        sa.Column("resource_id", sa.String(255), nullable=True),
        # Performance
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("success", sa.Boolean(), default=True),
        # Timestamp
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_user_activities_user_id", "user_activities", ["user_id"])
    op.create_index("ix_user_activities_institution_id", "user_activities", ["institution_id"])
    op.create_index("ix_user_activities_session_id", "user_activities", ["session_id"])
    op.create_index("ix_user_activities_type", "user_activities", ["activity_type"])
    op.create_index("ix_user_activities_user_created", "user_activities", ["user_id", "created_at"])
    op.create_index("ix_user_activities_created_at", "user_activities", ["created_at"])

    # =========================================================================
    # Feature Usage Metrics
    # =========================================================================
    op.create_table(
        "feature_usage_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Scope
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Feature identification
        sa.Column("feature_name", sa.String(100), nullable=False),
        sa.Column("feature_version", sa.String(50), nullable=True),
        # Usage
        sa.Column("invocation_count", sa.Integer(), default=1),
        sa.Column("success_count", sa.Integer(), default=0),
        sa.Column("error_count", sa.Integer(), default=0),
        # Performance
        sa.Column("avg_latency_ms", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), default=0),
        # Time period
        sa.Column("period_start", sa.DateTime(), nullable=False),
        sa.Column("period_end", sa.DateTime(), nullable=False),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_feature_usage_metrics_institution_id", "feature_usage_metrics", ["institution_id"])
    op.create_index("ix_feature_usage_metrics_user_id", "feature_usage_metrics", ["user_id"])
    op.create_index("ix_feature_usage_metrics_feature", "feature_usage_metrics", ["feature_name"])
    op.create_index("ix_feature_usage_metrics_period", "feature_usage_metrics", ["period_start", "period_end"])

    # =========================================================================
    # User Integration Credentials
    # =========================================================================
    op.create_table(
        "user_integration_credentials",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # User scope
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=True),
        # Provider
        sa.Column("provider", sa.String(100), nullable=False),
        sa.Column("provider_instance", sa.String(255), nullable=True),
        # Credentials
        sa.Column("credentials_encrypted", sa.LargeBinary(), nullable=False),
        sa.Column("encryption_key_id", sa.String(100), nullable=True),
        sa.Column("encryption_algorithm", sa.String(50), default="AES-256-GCM"),
        # Token management
        sa.Column("token_type", sa.String(50), default="oauth2"),
        sa.Column("access_token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("refresh_token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        # Scopes
        sa.Column("scopes", postgresql.JSON(), default=[]),
        sa.Column("permissions", postgresql.JSON(), nullable=True),
        # Status
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("is_valid", sa.Boolean(), default=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("error_count", sa.Integer(), default=0),
        # Metadata
        sa.Column("metadata", postgresql.JSON(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_user_integration_credentials_user_id", "user_integration_credentials", ["user_id"])
    op.create_index("ix_user_integration_credentials_institution_id", "user_integration_credentials", ["institution_id"])
    op.create_index("ix_user_integration_credentials_provider", "user_integration_credentials", ["provider"])
    op.create_index("ix_user_integration_credentials_user_provider", "user_integration_credentials", ["user_id", "provider"])
    op.create_index("ix_user_integration_credentials_expires", "user_integration_credentials", ["expires_at"])
    op.create_unique_constraint("uq_user_integration_provider", "user_integration_credentials", ["user_id", "provider", "provider_instance"])

    # =========================================================================
    # Institution Integrations
    # =========================================================================
    op.create_table(
        "institution_integrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Institution scope
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=False),
        # Integration identification
        sa.Column("integration_type", sa.String(100), nullable=False),
        sa.Column("integration_name", sa.String(255), nullable=False),
        sa.Column("provider", sa.String(100), nullable=False),
        # Configuration
        sa.Column("config", postgresql.JSON(), nullable=False, default={}),
        sa.Column("endpoint_url", sa.String(1000), nullable=True),
        # Credentials
        sa.Column("credentials_encrypted", sa.LargeBinary(), nullable=True),
        sa.Column("encryption_key_id", sa.String(100), nullable=True),
        # Status
        sa.Column("is_enabled", sa.Boolean(), default=True),
        sa.Column("is_configured", sa.Boolean(), default=False),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("health_status", sa.String(50), default="unknown"),
        # Sync settings
        sa.Column("sync_enabled", sa.Boolean(), default=False),
        sa.Column("sync_interval_minutes", sa.Integer(), nullable=True),
        sa.Column("sync_config", postgresql.JSON(), nullable=True),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_institution_integrations_institution_id", "institution_integrations", ["institution_id"])
    op.create_index("ix_institution_integrations_type", "institution_integrations", ["integration_type"])
    op.create_index("ix_institution_integrations_enabled", "institution_integrations", ["is_enabled"])
    op.create_unique_constraint("uq_institution_integration", "institution_integrations", ["institution_id", "integration_type", "provider"])

    # =========================================================================
    # Webhook Endpoints
    # =========================================================================
    op.create_table(
        "webhook_endpoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        # Scope
        sa.Column("institution_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("integration_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("institution_integrations.id", ondelete="CASCADE"), nullable=True),
        # Endpoint configuration
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("url", sa.String(1000), nullable=False),
        sa.Column("secret_key_encrypted", sa.LargeBinary(), nullable=True),
        # Event configuration
        sa.Column("events", postgresql.JSON(), default=[]),
        sa.Column("filters", postgresql.JSON(), nullable=True),
        # Status
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("last_triggered_at", sa.DateTime(), nullable=True),
        sa.Column("last_success_at", sa.DateTime(), nullable=True),
        sa.Column("last_failure_at", sa.DateTime(), nullable=True),
        sa.Column("failure_count", sa.Integer(), default=0),
        # Retry configuration
        sa.Column("max_retries", sa.Integer(), default=3),
        sa.Column("retry_delay_seconds", sa.Integer(), default=60),
        # Timestamps
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_webhook_endpoints_institution_id", "webhook_endpoints", ["institution_id"])
    op.create_index("ix_webhook_endpoints_integration_id", "webhook_endpoints", ["integration_id"])
    op.create_index("ix_webhook_endpoints_active", "webhook_endpoints", ["is_active"])


def downgrade() -> None:
    # Drop tables in reverse order (respecting foreign key constraints)
    op.drop_table("webhook_endpoints")
    op.drop_table("institution_integrations")
    op.drop_table("user_integration_credentials")
    op.drop_table("feature_usage_metrics")
    op.drop_table("user_activities")
    op.drop_table("usage_analytics")
    op.drop_table("knowledge_queries")
    op.drop_table("knowledge_documents")
    op.drop_table("session_collaborators")
    op.drop_table("session_handoffs")
    op.drop_table("electronic_signatures")
    op.drop_table("compliance_audit_log")
    op.drop_table("provenance_nodes")
    op.drop_table("ai_feedback")
    op.drop_table("generated_documents")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
    op.drop_table("prompt_versions")
    op.drop_table("institution_feature_flags")
