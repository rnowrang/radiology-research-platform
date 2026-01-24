"""Chat session and message models for Protocol Assistant."""

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
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class ChatSession(Base):
    """
    Represents a chat session between a user and the Protocol Assistant.

    Each session tracks the context of a protocol review conversation,
    including extracted protocol data, identified gaps, and collected answers.
    """
    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    institution_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Document reference
    uploaded_document_id = Column(String(255), nullable=True)
    document_filename = Column(String(500), nullable=True)

    # Protocol context (JSONB for flexibility)
    extracted_protocol = Column(JSON, nullable=True)  # Structured protocol data
    current_gaps = Column(JSON, nullable=True)  # List of identified gaps
    collected_answers = Column(JSON, default=dict)  # User responses to gap questions

    # Session state
    status = Column(String(50), default="active")  # active, completed, abandoned, handed_off
    completion_percentage = Column(Integer, default=0)

    # Metadata
    title = Column(String(500), nullable=True)  # Session title for display
    summary = Column(Text, nullable=True)  # AI-generated session summary

    # LLM tracking
    llm_provider = Column(String(50), nullable=True)  # claude, openai, etc.
    total_tokens_used = Column(Integer, default=0)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    generated_documents = relationship("GeneratedDocument", back_populates="session", cascade="all, delete-orphan")
    feedback = relationship("AIFeedback", back_populates="session", cascade="all, delete-orphan")
    handoffs = relationship("SessionHandoff", back_populates="session", foreign_keys="SessionHandoff.session_id")
    provenance_nodes = relationship("ProvenanceNode", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_chat_sessions_project_user", "project_id", "user_id"),
        Index("ix_chat_sessions_status", "status"),
        Index("ix_chat_sessions_created_at", "created_at"),
    )


class ChatMessage(Base):
    """
    Individual messages within a chat session.

    Supports different message types including regular chat, questions,
    suggestions, and action messages.
    """
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Message content
    role = Column(String(20), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)

    # Message classification
    message_type = Column(String(50), default="chat")  # chat, question, suggestion, action, error

    # Extended metadata
    message_metadata = Column("metadata", JSON, nullable=True)  # Flexible additional data

    # For assistant messages: track which prompt version was used
    prompt_version_id = Column(Integer, ForeignKey("prompt_versions.id"), nullable=True)

    # Token tracking
    tokens_used = Column(Integer, nullable=True)

    # Gap reference (if this message relates to a specific gap)
    gap_id = Column(String(100), nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    session = relationship("ChatSession", back_populates="messages")
    prompt_version = relationship("PromptVersion", back_populates="messages")

    __table_args__ = (
        Index("ix_chat_messages_session_created", "session_id", "created_at"),
        Index("ix_chat_messages_role", "role"),
    )
