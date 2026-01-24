"""Generated document models for Protocol Assistant."""

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
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class GeneratedDocument(Base):
    """
    Stores AI-generated documents such as protocols, consent forms,
    and other research documents.

    Documents can be versioned, reviewed, and exported in multiple formats.
    """
    __tablename__ = "generated_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    project_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    institution_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Document identification
    document_type = Column(String(100), nullable=False)  # protocol, consent_form, amendment, etc.
    title = Column(String(500), nullable=False)
    version = Column(Integer, default=1)
    version_label = Column(String(100), nullable=True)  # e.g., "v1.0", "Draft 2"

    # Content
    content = Column(Text, nullable=False)  # Primary document content (markdown/text)
    content_html = Column(Text, nullable=True)  # Rendered HTML version
    content_format = Column(String(50), default="markdown")  # markdown, html, plain

    # Template reference
    template_id = Column(UUID(as_uuid=True), nullable=True)
    template_version = Column(Integer, nullable=True)

    # Generation metadata
    generation_metadata = Column(JSON, nullable=True)  # LLM params, prompt info, etc.
    source_data = Column(JSON, nullable=True)  # Input data used to generate

    # Document status
    status = Column(String(50), default="draft")  # draft, review, approved, final, archived
    is_latest = Column(Boolean, default=True)

    # Review tracking
    reviewed_by = Column(UUID(as_uuid=True), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_notes = Column(Text, nullable=True)

    # Quality metrics
    quality_score = Column(Integer, nullable=True)  # AI-assessed quality score
    coherence_score = Column(Integer, nullable=True)  # Coherence check score
    completeness_score = Column(Integer, nullable=True)  # Completeness check score

    # Hash for integrity verification
    content_hash = Column(String(64), nullable=True)  # SHA-256 hash

    # Parent document for versioning
    parent_document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("generated_documents.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    session = relationship("ChatSession", back_populates="generated_documents")
    signatures = relationship("ElectronicSignature", back_populates="document", cascade="all, delete-orphan")
    child_versions = relationship(
        "GeneratedDocument",
        backref="parent_document",
        remote_side="GeneratedDocument.id",
        foreign_keys=[parent_document_id],
    )

    __table_args__ = (
        Index("ix_generated_documents_project_type", "project_id", "document_type"),
        Index("ix_generated_documents_status", "status"),
        Index("ix_generated_documents_created_at", "created_at"),
        CheckConstraint("version > 0", name="ck_generated_documents_version_positive"),
        CheckConstraint(
            "quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)",
            name="ck_generated_documents_quality_score_range"
        ),
    )
