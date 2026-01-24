"""Audit, provenance, and compliance models for Protocol Assistant."""

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
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, ARRAY, INET
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class ProvenanceNode(Base):
    """
    Tracks the lineage of AI-generated outputs.

    Creates an audit trail showing how data flows through the system,
    from input documents through extraction, generation, and editing.
    """
    __tablename__ = "provenance_nodes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Session context
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    project_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Node type and actor
    type = Column(String(50), nullable=False)  # input, extraction, generation, edit, approval, review
    actor = Column(String(255), nullable=False)  # user_id or "system" or "llm:{provider}"
    actor_type = Column(String(50), default="user")  # user, system, llm

    # Content reference
    resource_type = Column(String(100), nullable=True)  # document, message, section
    resource_id = Column(String(255), nullable=True)
    data_hash = Column(String(64), nullable=False)  # SHA-256 hash of content

    # Lineage
    parent_ids = Column(ARRAY(UUID(as_uuid=True)), default=[])  # Parent nodes in the chain
    depth = Column(Integer, default=0)  # Depth in the provenance tree

    # Metadata
    node_metadata = Column("metadata", JSON, nullable=True)  # Additional context
    llm_provider = Column(String(50), nullable=True)  # If AI-generated
    llm_model = Column(String(100), nullable=True)
    prompt_version_id = Column(Integer, nullable=True)

    # Action details
    action = Column(String(100), nullable=True)  # Specific action taken
    description = Column(Text, nullable=True)  # Human-readable description

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    session = relationship("ChatSession", back_populates="provenance_nodes")

    __table_args__ = (
        Index("ix_provenance_nodes_type", "type"),
        Index("ix_provenance_nodes_actor", "actor"),
        Index("ix_provenance_nodes_resource", "resource_type", "resource_id"),
        Index("ix_provenance_nodes_created_at", "created_at"),
    )


class ComplianceAuditLog(Base):
    """
    Append-only compliance audit log.

    Records all significant actions for regulatory compliance,
    including HIPAA, 21 CFR Part 11, and institutional policies.
    """
    __tablename__ = "compliance_audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Institution context
    institution_id = Column(
        UUID(as_uuid=True),
        ForeignKey("institution_feature_flags.institution_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Event classification
    event_type = Column(String(100), nullable=False)  # access, create, update, delete, export, login, etc.
    resource_type = Column(String(100), nullable=False)  # document, session, user, etc.
    resource_id = Column(String(255), nullable=True)

    # Actor information
    actor_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    actor_name = Column(String(255), nullable=True)  # Captured at time of action
    actor_email = Column(String(255), nullable=True)
    actor_role = Column(String(100), nullable=True)

    # Action details
    action = Column(String(100), nullable=False)
    action_detail = Column(Text, nullable=True)
    details = Column(JSON, nullable=True)  # Structured details

    # Request context
    ip_address = Column(INET, nullable=True)
    user_agent = Column(Text, nullable=True)
    request_id = Column(String(100), nullable=True)  # For tracing

    # Result
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)

    # Timestamp (immutable)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)

    # Relationships
    institution = relationship("InstitutionFeatureFlags", back_populates="compliance_logs")

    __table_args__ = (
        Index("ix_compliance_audit_log_event_type", "event_type"),
        Index("ix_compliance_audit_log_timestamp", "timestamp"),
        Index("ix_compliance_audit_log_actor_timestamp", "actor_id", "timestamp"),
        Index("ix_compliance_audit_log_resource", "resource_type", "resource_id"),
    )


class ElectronicSignature(Base):
    """
    Electronic signatures for 21 CFR Part 11 compliance.

    Captures legally binding signatures on documents with
    all required metadata for regulatory compliance.
    """
    __tablename__ = "electronic_signatures"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Document reference
    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("generated_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_version = Column(Integer, nullable=False)
    document_hash = Column(String(64), nullable=False)  # SHA-256 of document at signing

    # Signer information
    signer_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    signer_name = Column(String(255), nullable=False)  # Full name at time of signing
    signer_email = Column(String(255), nullable=False)
    signer_title = Column(String(255), nullable=True)
    signer_institution = Column(String(500), nullable=True)

    # Signature details
    meaning = Column(String(100), nullable=False)  # approval, review, author, witness
    statement = Column(Text, nullable=True)  # Optional statement with signature

    # Timestamp information (21 CFR Part 11 requirements)
    timestamp = Column(DateTime, server_default=func.now(), nullable=False)
    timezone = Column(String(50), nullable=False, default="UTC")
    timestamp_utc = Column(DateTime, server_default=func.now(), nullable=False)

    # System identification
    system_id = Column(String(100), nullable=False)  # Unique system identifier
    system_version = Column(String(50), nullable=True)

    # Cryptographic verification
    signature_hash = Column(String(128), nullable=False)  # Hash of signature data
    signature_algorithm = Column(String(50), default="SHA-256")
    public_key_fingerprint = Column(String(128), nullable=True)  # If using PKI

    # Authentication method
    auth_method = Column(String(50), nullable=False)  # password, mfa, biometric, certificate
    auth_timestamp = Column(DateTime, nullable=False)  # When authentication occurred

    # IP and context
    ip_address = Column(INET, nullable=True)
    user_agent = Column(Text, nullable=True)

    # Validity
    is_valid = Column(Boolean, default=True)
    invalidated_at = Column(DateTime, nullable=True)
    invalidation_reason = Column(Text, nullable=True)

    # Relationships
    document = relationship("GeneratedDocument", back_populates="signatures")

    __table_args__ = (
        Index("ix_electronic_signatures_signer", "signer_id"),
        Index("ix_electronic_signatures_document_signer", "document_id", "signer_id"),
        Index("ix_electronic_signatures_timestamp", "timestamp"),
        CheckConstraint(
            "meaning IN ('approval', 'review', 'author', 'witness', 'acknowledgment')",
            name="ck_electronic_signatures_meaning_valid"
        ),
    )
