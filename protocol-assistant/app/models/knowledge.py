"""Knowledge base models for RAG (Retrieval-Augmented Generation)."""

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


class KnowledgeDocument(Base):
    """
    Stores knowledge base documents for RAG.

    These documents provide context for the AI assistant,
    including institutional guidelines, templates, and reference materials.
    """
    __tablename__ = "knowledge_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Institution scope
    institution_id = Column(
        UUID(as_uuid=True),
        ForeignKey("institution_feature_flags.institution_id", ondelete="CASCADE"),
        nullable=True,  # NULL means global/shared
        index=True,
    )

    # Document identification
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    source_url = Column(String(1000), nullable=True)
    source_filename = Column(String(500), nullable=True)

    # Content
    content = Column(Text, nullable=False)
    content_type = Column(String(50), default="text")  # text, markdown, html

    # Categorization
    category = Column(String(100), nullable=True, index=True)  # guidelines, templates, regulations, etc.
    subcategory = Column(String(100), nullable=True)
    tags = Column(JSON, default=[])  # List of tags for filtering

    # For vector search (if using pgvector extension)
    # embeddings = Column(Vector(1536), nullable=True)  # Uncomment with pgvector
    embedding_model = Column(String(100), nullable=True)  # Model used for embeddings
    has_embeddings = Column(Boolean, default=False)

    # Chunking info (for RAG)
    chunk_index = Column(Integer, nullable=True)  # If this is a chunk of a larger doc
    parent_document_id = Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_documents.id", ondelete="CASCADE"),
        nullable=True,
    )
    chunk_count = Column(Integer, nullable=True)  # Total chunks if parent

    # Metadata
    doc_metadata = Column("metadata", JSON, nullable=True)
    language = Column(String(10), default="en")
    word_count = Column(Integer, nullable=True)

    # Document versioning
    version = Column(Integer, default=1)
    is_latest = Column(Boolean, default=True)

    # Status
    is_active = Column(Boolean, default=True)
    is_public = Column(Boolean, default=False)  # Visible to all institutions

    # Lifecycle
    added_by = Column(UUID(as_uuid=True), nullable=True)
    approved_by = Column(UUID(as_uuid=True), nullable=True)
    approved_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    last_indexed_at = Column(DateTime, nullable=True)  # Last embedding update

    # Relationships
    institution = relationship("InstitutionFeatureFlags", back_populates="knowledge_documents")
    chunks = relationship(
        "KnowledgeDocument",
        backref="parent_document",
        remote_side="KnowledgeDocument.id",
        foreign_keys=[parent_document_id],
    )

    __table_args__ = (
        Index("ix_knowledge_documents_category", "category"),
        Index("ix_knowledge_documents_active", "is_active"),
        Index("ix_knowledge_documents_institution_category", "institution_id", "category"),
        Index("ix_knowledge_documents_embeddings", "has_embeddings"),
        CheckConstraint("version > 0", name="ck_knowledge_documents_version_positive"),
    )


class KnowledgeQuery(Base):
    """
    Logs queries made against the knowledge base.

    Used for analytics and improving retrieval relevance.
    """
    __tablename__ = "knowledge_queries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Context
    session_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    institution_id = Column(UUID(as_uuid=True), nullable=True)

    # Query details
    query_text = Column(Text, nullable=False)
    query_type = Column(String(50), default="semantic")  # semantic, keyword, hybrid

    # Results
    result_count = Column(Integer, nullable=True)
    result_document_ids = Column(JSON, nullable=True)  # IDs of retrieved documents
    top_similarity_score = Column(String(20), nullable=True)  # Highest similarity score

    # Performance
    latency_ms = Column(Integer, nullable=True)

    # Feedback
    was_helpful = Column(Boolean, nullable=True)
    user_feedback = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_knowledge_queries_created_at", "created_at"),
        Index("ix_knowledge_queries_type", "query_type"),
    )
