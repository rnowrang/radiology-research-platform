"""Chat request/response schemas for Protocol Assistant."""

from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    """Types of messages in a chat session."""

    CHAT = "chat"
    QUESTION = "question"
    SUGGESTION = "suggestion"
    ACTION = "action"
    SYSTEM = "system"


class ChatMessageRequest(BaseModel):
    """Request schema for sending a chat message."""

    content: str = Field(..., min_length=1, description="Message content")
    message_type: MessageType = Field(
        default=MessageType.CHAT, description="Type of message"
    )


class ChatMessageResponse(BaseModel):
    """Response schema for a single chat message."""

    id: int = Field(..., description="Message ID")
    role: str = Field(..., description="Message role (user, assistant, system)")
    content: str = Field(..., description="Message content")
    message_type: str = Field(..., description="Type of message")
    metadata: Optional[dict[str, Any]] = Field(
        default=None, description="Optional message metadata"
    )
    created_at: datetime = Field(..., description="When the message was created")

    class Config:
        from_attributes = True


class ChatResponse(BaseModel):
    """Response schema for chat completion."""

    response: str = Field(..., description="AI-generated response content")
    message_id: int = Field(..., description="ID of the saved assistant message")
    suggestions: list[str] = Field(
        default_factory=list,
        description="Follow-up suggestions for the user",
    )
    available_actions: list[str] = Field(
        default_factory=list,
        description="Available actions based on session state",
    )


class SessionCreateRequest(BaseModel):
    """Request schema for creating a new chat session."""

    project_id: UUID = Field(..., description="Project UUID to associate with session")


class SessionResponse(BaseModel):
    """Response schema for session details."""

    session_id: UUID = Field(..., description="Session UUID")
    project_id: UUID = Field(..., description="Associated project UUID")
    status: str = Field(..., description="Session status (active, completed, etc.)")
    has_extracted_protocol: bool = Field(
        ..., description="Whether protocol has been extracted"
    )
    completion_percentage: int = Field(
        default=0, description="Protocol completion percentage"
    )
    title: Optional[str] = Field(default=None, description="Session title")
    created_at: datetime = Field(..., description="Session creation timestamp")
    updated_at: Optional[datetime] = Field(
        default=None, description="Last update timestamp"
    )

    class Config:
        from_attributes = True


class SessionHistoryResponse(BaseModel):
    """Response schema for session chat history."""

    messages: list[ChatMessageResponse] = Field(
        default_factory=list, description="List of chat messages"
    )
    total: int = Field(..., description="Total number of messages")
    limit: int = Field(..., description="Maximum messages returned")
    offset: int = Field(..., description="Number of messages skipped")


class SessionUpdateRequest(BaseModel):
    """Request schema for updating session data."""

    extracted_protocol: Optional[dict[str, Any]] = Field(
        default=None, description="Extracted protocol data"
    )
    current_gaps: Optional[list[dict[str, Any]]] = Field(
        default=None, description="Current gap questions"
    )
    collected_answers: Optional[dict[str, Any]] = Field(
        default=None, description="Collected user answers to gaps"
    )
    status: Optional[str] = Field(default=None, description="Session status update")
    completion_percentage: Optional[int] = Field(
        default=None, description="Updated completion percentage"
    )
    title: Optional[str] = Field(default=None, description="Session title")


class StreamingChatRequest(BaseModel):
    """Request schema for streaming chat endpoint."""

    content: str = Field(..., min_length=1, description="Message content")
    message_type: MessageType = Field(
        default=MessageType.CHAT, description="Type of message"
    )
