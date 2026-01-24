"""Collaboration and session handoff models for Protocol Assistant."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Index,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base
import uuid


class SessionHandoff(Base):
    """
    Tracks handoffs of chat sessions between users.

    Enables collaboration by allowing users to transfer sessions
    to colleagues with context and notes.
    """
    __tablename__ = "session_handoffs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Session reference
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Users involved
    from_user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    from_user_name = Column(String(255), nullable=True)  # Captured at handoff time
    to_user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    to_user_name = Column(String(255), nullable=True)
    to_user_email = Column(String(255), nullable=True)

    # Handoff details
    handoff_note = Column(Text, nullable=True)  # Message from sender
    handoff_reason = Column(String(100), nullable=True)  # collaboration, expertise_needed, unavailable

    # Session snapshot at handoff
    session_snapshot = Column(JSON, nullable=True)  # Captured state of session
    completion_at_handoff = Column(Integer, nullable=True)  # Completion percentage when handed off

    # Status tracking
    status = Column(String(50), default="pending")  # pending, accepted, declined, expired
    response_note = Column(Text, nullable=True)  # Response from recipient

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    responded_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)  # Optional expiration

    # Relationships
    session = relationship("ChatSession", back_populates="handoffs")

    __table_args__ = (
        Index("ix_session_handoffs_from_user", "from_user_id"),
        Index("ix_session_handoffs_to_user", "to_user_id"),
        Index("ix_session_handoffs_status", "status"),
        Index("ix_session_handoffs_created_at", "created_at"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')",
            name="ck_session_handoffs_status_valid"
        ),
    )


class SessionCollaborator(Base):
    """
    Tracks users who have access to collaborate on a session.

    Supports multi-user collaboration with different permission levels.
    """
    __tablename__ = "session_collaborators"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Session reference
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Collaborator
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_name = Column(String(255), nullable=True)
    user_email = Column(String(255), nullable=True)

    # Permissions
    role = Column(String(50), default="viewer")  # owner, editor, viewer
    can_edit = Column(String(50), default="false")  # true, false
    can_invite = Column(String(50), default="false")  # true, false

    # Invitation tracking
    invited_by = Column(UUID(as_uuid=True), nullable=True)
    invitation_status = Column(String(50), default="accepted")  # pending, accepted, declined

    # Activity tracking
    last_accessed_at = Column(DateTime, nullable=True)
    contribution_count = Column(Integer, default=0)  # Number of contributions

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_session_collaborators_session_user", "session_id", "user_id", unique=True),
        Index("ix_session_collaborators_role", "role"),
        CheckConstraint(
            "role IN ('owner', 'editor', 'viewer', 'commenter')",
            name="ck_session_collaborators_role_valid"
        ),
    )
