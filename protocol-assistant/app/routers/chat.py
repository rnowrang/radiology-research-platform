"""Chat and session management endpoints for Protocol Assistant."""

import asyncio
import json
import logging
from typing import AsyncGenerator
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.schemas.chat import (
    ChatMessageRequest,
    ChatMessageResponse,
    ChatResponse,
    SessionCreateRequest,
    SessionHistoryResponse,
    SessionResponse,
    SessionUpdateRequest,
)
from app.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/protocol-assistant", tags=["protocol-assistant"])


# Temporary user ID extraction (replace with real auth integration)
def get_current_user_id() -> UUID:
    """
    Get the current user ID from authentication.

    This is a placeholder implementation. In production, this should
    extract the user ID from JWT token or session.
    """
    # Default development user ID
    return UUID("00000000-0000-0000-0000-000000000001")


@router.post(
    "/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new chat session",
    description="Create a new Protocol Assistant chat session for a project.",
)
async def create_session(
    request: SessionCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> SessionResponse:
    """
    Create a new chat session for a project.

    This endpoint creates a fresh chat session associated with the specified
    project. The session will track conversation history, extracted protocol
    data, and identified gaps.
    """
    service = ChatService(db)
    session = await service.create_session(request.project_id, user_id)

    return SessionResponse(
        session_id=session.id,
        project_id=session.project_id,
        status=session.status,
        has_extracted_protocol=session.extracted_protocol is not None,
        completion_percentage=session.completion_percentage or 0,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get(
    "/sessions/{session_id}",
    response_model=SessionResponse,
    summary="Get session details",
    description="Retrieve details of a specific chat session.",
)
async def get_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> SessionResponse:
    """
    Get session details by ID.

    Returns the current state of the session including status,
    protocol extraction status, and completion percentage.
    """
    service = ChatService(db)
    session = await service.get_session(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    return SessionResponse(
        session_id=session.id,
        project_id=session.project_id,
        status=session.status,
        has_extracted_protocol=session.extracted_protocol is not None,
        completion_percentage=session.completion_percentage or 0,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.patch(
    "/sessions/{session_id}",
    response_model=SessionResponse,
    summary="Update session data",
    description="Update session with extracted protocol, gaps, or other data.",
)
async def update_session(
    session_id: UUID,
    updates: SessionUpdateRequest,
    db: AsyncSession = Depends(get_async_session),
) -> SessionResponse:
    """
    Update session data.

    This endpoint is used to update the session with:
    - Extracted protocol data from document processing
    - Identified gap questions
    - Collected user answers
    - Session status and completion percentage
    """
    service = ChatService(db)

    # Verify session exists
    existing = await service.get_session(session_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    session = await service.update_session(session_id, updates)

    return SessionResponse(
        session_id=session.id,
        project_id=session.project_id,
        status=session.status,
        has_extracted_protocol=session.extracted_protocol is not None,
        completion_percentage=session.completion_percentage or 0,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.post(
    "/sessions/{session_id}/chat",
    response_model=ChatResponse,
    summary="Send a chat message",
    description="Send a message to the Protocol Assistant and receive a response.",
)
async def chat(
    session_id: UUID,
    message: ChatMessageRequest,
    db: AsyncSession = Depends(get_async_session),
) -> ChatResponse:
    """
    Send a chat message and get AI response.

    The assistant will respond based on:
    - Current session context (extracted protocol, gaps)
    - Conversation history
    - IRB protocol requirements

    Returns the AI response along with suggested follow-ups and available actions.
    """
    service = ChatService(db)

    # Get the session
    session = await service.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    if session.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Session is {session.status}, not accepting messages",
        )

    # Process the message
    response = await service.process_message(
        session=session,
        user_message=message.content,
        message_type=message.message_type.value,
    )

    return response


@router.get(
    "/sessions/{session_id}/history",
    response_model=SessionHistoryResponse,
    summary="Get chat history",
    description="Retrieve the chat message history for a session.",
)
async def get_history(
    session_id: UUID,
    limit: int = Query(50, ge=1, le=100, description="Maximum messages to return"),
    offset: int = Query(0, ge=0, description="Number of messages to skip"),
    db: AsyncSession = Depends(get_async_session),
) -> SessionHistoryResponse:
    """
    Get chat history for a session.

    Returns paginated message history with total count.
    Messages are ordered by creation time (oldest first).
    """
    service = ChatService(db)

    # Verify session exists
    session = await service.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    messages, total = await service.get_history(session_id, limit=limit, offset=offset)

    return SessionHistoryResponse(
        messages=[
            ChatMessageResponse(
                id=msg.id,
                role=msg.role,
                content=msg.content,
                message_type=msg.message_type,
                metadata=msg.message_metadata,
                created_at=msg.created_at,
            )
            for msg in messages
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/sessions/{session_id}/close",
    status_code=status.HTTP_200_OK,
    summary="Close a session",
    description="Mark a chat session as completed.",
)
async def close_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> dict:
    """
    Close/complete a session.

    Marks the session as completed and sets the completion timestamp.
    Closed sessions will not accept new messages.
    """
    service = ChatService(db)

    # Verify session exists
    session = await service.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    if session.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is already closed",
        )

    await service.close_session(session_id)

    return {
        "status": "success",
        "message": f"Session {session_id} has been closed",
    }


@router.get(
    "/sessions/{session_id}/stream",
    summary="Stream chat response",
    description="Stream a chat response using Server-Sent Events (SSE).",
)
async def stream_response(
    session_id: UUID,
    message: str = Query(..., min_length=1, description="Message to send"),
    db: AsyncSession = Depends(get_async_session),
) -> StreamingResponse:
    """
    Stream a chat response using Server-Sent Events.

    This endpoint provides real-time streaming of the AI response,
    sending chunks as they are generated. Useful for longer responses
    to provide immediate feedback to the user.

    The response follows SSE format with event types:
    - message: Content chunks
    - done: Completion signal
    - error: Error information
    """
    service = ChatService(db)

    # Get and validate session
    session = await service.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    if session.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Session is {session.status}, not accepting messages",
        )

    async def event_generator() -> AsyncGenerator[str, None]:
        """Generate SSE events from streaming response."""
        try:
            async for chunk in service.stream_response(
                session=session,
                user_message=message,
            ):
                # Format as SSE event
                data = json.dumps({"content": chunk})
                yield f"event: message\ndata: {data}\n\n"

            # Send completion event
            yield f"event: done\ndata: {json.dumps({'status': 'complete'})}\n\n"

        except Exception as e:
            logger.error(f"Error in stream: {e}")
            error_data = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {error_data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.get(
    "/projects/{project_id}/session",
    response_model=SessionResponse,
    summary="Get or create session for project",
    description="Get an existing active session for a project or create a new one.",
)
async def get_or_create_project_session(
    project_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> SessionResponse:
    """
    Get or create a session for a project.

    This is a convenience endpoint that checks for an existing active
    session for the project and user. If none exists, creates a new one.
    """
    service = ChatService(db)
    session = await service.get_or_create_session(project_id, user_id)

    return SessionResponse(
        session_id=session.id,
        project_id=session.project_id,
        status=session.status,
        has_extracted_protocol=session.extracted_protocol is not None,
        completion_percentage=session.completion_percentage or 0,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )
