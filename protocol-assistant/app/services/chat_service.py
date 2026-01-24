"""Chat service with session management and message handling."""

import json
import logging
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatMessage, ChatSession
from app.schemas.chat import ChatResponse, SessionUpdateRequest
from app.services.llm import LLMMessage, get_llm_orchestrator

logger = logging.getLogger(__name__)

# System prompt for the Protocol Assistant
CHAT_SYSTEM_PROMPT = """You are a Protocol Assistant helping researchers prepare IRB protocols.
You have access to the extracted protocol information and gap questions.
Be helpful, precise, and focus on IRB requirements.
If the user asks about specific sections, reference the extracted protocol.
Suggest actions when appropriate (generate_abstract, generate_consent, prefill_form).

When responding:
1. Be concise but thorough
2. Reference specific protocol sections when relevant
3. If gaps are identified, help the user address them
4. Suggest next steps based on protocol completeness
5. Always prioritize regulatory compliance and participant safety"""


class ChatService:
    """Service for managing chat sessions and processing messages."""

    def __init__(self, db: AsyncSession):
        """
        Initialize the chat service.

        Args:
            db: Async database session
        """
        self.db = db
        self.orchestrator = get_llm_orchestrator()

    async def create_session(
        self,
        project_id: UUID,
        user_id: UUID,
        institution_id: Optional[UUID] = None,
    ) -> ChatSession:
        """
        Create a new chat session for a project.

        Args:
            project_id: UUID of the associated project
            user_id: UUID of the user creating the session
            institution_id: Optional institution UUID

        Returns:
            Newly created ChatSession
        """
        session = ChatSession(
            project_id=project_id,
            user_id=user_id,
            institution_id=institution_id,
            status="active",
            completion_percentage=0,
        )
        self.db.add(session)
        await self.db.flush()
        await self.db.refresh(session)

        logger.info(f"Created chat session {session.id} for project {project_id}")
        return session

    async def get_session(self, session_id: UUID) -> Optional[ChatSession]:
        """
        Get a session by ID.

        Args:
            session_id: UUID of the session

        Returns:
            ChatSession if found, None otherwise
        """
        result = await self.db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create_session(
        self,
        project_id: UUID,
        user_id: UUID,
        institution_id: Optional[UUID] = None,
    ) -> ChatSession:
        """
        Get an existing active session or create a new one.

        Args:
            project_id: UUID of the project
            user_id: UUID of the user
            institution_id: Optional institution UUID

        Returns:
            Active ChatSession for the project/user
        """
        # Try to find an existing active session
        result = await self.db.execute(
            select(ChatSession).where(
                ChatSession.project_id == project_id,
                ChatSession.user_id == user_id,
                ChatSession.status == "active",
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            logger.debug(f"Found existing session {existing.id}")
            return existing

        # Create a new session
        return await self.create_session(project_id, user_id, institution_id)

    async def update_session(
        self,
        session_id: UUID,
        updates: SessionUpdateRequest,
    ) -> Optional[ChatSession]:
        """
        Update session with extracted protocol, gaps, etc.

        Args:
            session_id: UUID of the session to update
            updates: SessionUpdateRequest with fields to update

        Returns:
            Updated ChatSession
        """
        update_data = updates.model_dump(exclude_unset=True, exclude_none=True)
        if not update_data:
            return await self.get_session(session_id)

        await self.db.execute(
            update(ChatSession)
            .where(ChatSession.id == session_id)
            .values(**update_data, updated_at=datetime.utcnow())
        )
        await self.db.flush()

        session = await self.get_session(session_id)
        logger.info(f"Updated session {session_id} with fields: {list(update_data.keys())}")
        return session

    async def get_history(
        self,
        session_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ChatMessage], int]:
        """
        Get chat history for a session.

        Args:
            session_id: UUID of the session
            limit: Maximum number of messages to return
            offset: Number of messages to skip

        Returns:
            Tuple of (list of messages, total count)
        """
        # Get total count
        count_result = await self.db.execute(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.session_id == session_id
            )
        )
        total = count_result.scalar() or 0

        # Get messages with pagination
        result = await self.db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        messages = list(result.scalars().all())

        return messages, total

    async def save_message(
        self,
        session_id: UUID,
        role: str,
        content: str,
        message_type: str = "chat",
        metadata: Optional[dict[str, Any]] = None,
        tokens_used: Optional[int] = None,
        gap_id: Optional[str] = None,
    ) -> ChatMessage:
        """
        Save a message to the session.

        Args:
            session_id: UUID of the session
            role: Message role (user, assistant, system)
            content: Message content
            message_type: Type of message (chat, question, suggestion, action)
            metadata: Optional additional metadata
            tokens_used: Optional token count for LLM messages
            gap_id: Optional gap identifier if related to a gap question

        Returns:
            Saved ChatMessage
        """
        message = ChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            message_type=message_type,
            metadata=metadata,
            tokens_used=tokens_used,
            gap_id=gap_id,
        )
        self.db.add(message)
        await self.db.flush()
        await self.db.refresh(message)

        logger.debug(f"Saved {role} message {message.id} to session {session_id}")
        return message

    async def process_message(
        self,
        session: ChatSession,
        user_message: str,
        message_type: str = "chat",
    ) -> ChatResponse:
        """
        Process a user message and generate an AI response.

        Args:
            session: The chat session
            user_message: The user's message content
            message_type: Type of message

        Returns:
            ChatResponse with AI response and metadata
        """
        # Save the user message
        user_msg = await self.save_message(
            session_id=session.id,
            role="user",
            content=user_message,
            message_type=message_type,
        )

        # Get recent history for context
        history, _ = await self.get_history(session.id, limit=20)

        # Build the context-enhanced system prompt
        context_prompt = self._build_context_prompt(session)
        full_system_prompt = f"{CHAT_SYSTEM_PROMPT}\n\n{context_prompt}"

        # Convert history to LLM messages
        llm_messages = [
            LLMMessage(role=msg.role, content=msg.content)
            for msg in history
            if msg.role in ("user", "assistant")
        ]

        # Generate response
        try:
            response = await self.orchestrator.generate(
                messages=llm_messages,
                system_prompt=full_system_prompt,
                task_type="protocol_generation",
                max_tokens=2048,
                temperature=0.7,
            )

            # Save the assistant response
            assistant_msg = await self.save_message(
                session_id=session.id,
                role="assistant",
                content=response.content,
                message_type="chat",
                tokens_used=response.usage.get("total_tokens"),
            )

            # Update session token count
            await self._update_token_count(session.id, response.usage.get("total_tokens", 0))

            # Detect available actions
            available_actions = self._detect_available_actions(session)

            # Generate suggestions based on response and context
            suggestions = self._generate_suggestions(session, response.content)

            return ChatResponse(
                response=response.content,
                message_id=assistant_msg.id,
                suggestions=suggestions,
                available_actions=available_actions,
            )

        except Exception as e:
            logger.error(f"Error processing message: {e}")
            # Save error message
            error_msg = await self.save_message(
                session_id=session.id,
                role="assistant",
                content="I apologize, but I encountered an error processing your request. Please try again.",
                message_type="error",
                metadata={"error": str(e)},
            )
            return ChatResponse(
                response=error_msg.content,
                message_id=error_msg.id,
                suggestions=["Try rephrasing your question"],
                available_actions=[],
            )

    async def stream_response(
        self,
        session: ChatSession,
        user_message: str,
        message_type: str = "chat",
    ):
        """
        Stream a response for a user message.

        Args:
            session: The chat session
            user_message: The user's message content
            message_type: Type of message

        Yields:
            String chunks of the response
        """
        from app.services.llm import get_llm_router

        # Save the user message
        await self.save_message(
            session_id=session.id,
            role="user",
            content=user_message,
            message_type=message_type,
        )

        # Get recent history
        history, _ = await self.get_history(session.id, limit=20)

        # Build context
        context_prompt = self._build_context_prompt(session)
        full_system_prompt = f"{CHAT_SYSTEM_PROMPT}\n\n{context_prompt}"

        # Convert to LLM messages
        llm_messages = [
            LLMMessage(role=msg.role, content=msg.content)
            for msg in history
            if msg.role in ("user", "assistant")
        ]

        # Get provider for streaming
        router = get_llm_router()
        provider = router.get_provider_for_task("protocol_generation")

        # Stream the response
        full_response = ""
        try:
            async for chunk in provider.stream(
                messages=llm_messages,
                system_prompt=full_system_prompt,
                max_tokens=2048,
                temperature=0.7,
            ):
                full_response += chunk
                yield chunk

            # Save the complete response
            await self.save_message(
                session_id=session.id,
                role="assistant",
                content=full_response,
                message_type="chat",
            )

        except Exception as e:
            logger.error(f"Error streaming response: {e}")
            error_message = "I apologize, but I encountered an error. Please try again."
            yield error_message
            await self.save_message(
                session_id=session.id,
                role="assistant",
                content=error_message,
                message_type="error",
                metadata={"error": str(e)},
            )

    async def close_session(self, session_id: UUID) -> None:
        """
        Mark a session as completed.

        Args:
            session_id: UUID of the session to close
        """
        await self.db.execute(
            update(ChatSession)
            .where(ChatSession.id == session_id)
            .values(
                status="completed",
                completed_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
        )
        await self.db.flush()
        logger.info(f"Closed session {session_id}")

    async def _update_token_count(self, session_id: UUID, tokens: int) -> None:
        """Update the total token count for a session."""
        await self.db.execute(
            update(ChatSession)
            .where(ChatSession.id == session_id)
            .values(
                total_tokens_used=ChatSession.total_tokens_used + tokens,
                updated_at=datetime.utcnow(),
            )
        )
        await self.db.flush()

    def _build_context_prompt(self, session: ChatSession) -> str:
        """
        Build context from extracted protocol and gaps.

        Args:
            session: The chat session with context data

        Returns:
            Context string to append to system prompt
        """
        context_parts = []

        # Add extracted protocol context
        if session.extracted_protocol:
            protocol_summary = self._summarize_protocol(session.extracted_protocol)
            context_parts.append(f"## Extracted Protocol Information\n{protocol_summary}")

        # Add current gaps
        if session.current_gaps:
            gaps_text = self._format_gaps(session.current_gaps)
            context_parts.append(f"## Information Gaps\n{gaps_text}")

        # Add collected answers
        if session.collected_answers:
            answers_text = self._format_collected_answers(session.collected_answers)
            context_parts.append(f"## Collected Information\n{answers_text}")

        # Add completion status
        context_parts.append(
            f"## Session Status\nProtocol completion: {session.completion_percentage}%"
        )

        if not context_parts:
            return "No protocol information has been extracted yet."

        return "\n\n".join(context_parts)

    def _summarize_protocol(self, protocol: dict[str, Any]) -> str:
        """Create a readable summary of extracted protocol data."""
        if not protocol:
            return "No protocol data available."

        summary_parts = []
        key_fields = [
            ("title", "Title"),
            ("principal_investigator", "Principal Investigator"),
            ("study_type", "Study Type"),
            ("population", "Study Population"),
            ("objectives", "Objectives"),
        ]

        for key, label in key_fields:
            if key in protocol:
                value = protocol[key]
                if isinstance(value, list):
                    value = ", ".join(str(v) for v in value[:3])
                    if len(protocol[key]) > 3:
                        value += f" (+{len(protocol[key]) - 3} more)"
                summary_parts.append(f"- **{label}**: {value}")

        return "\n".join(summary_parts) if summary_parts else "Protocol data is being processed."

    def _format_gaps(self, gaps: list[dict[str, Any]]) -> str:
        """Format gap questions for context."""
        if not gaps:
            return "No gaps identified."

        formatted = []
        for i, gap in enumerate(gaps[:5], 1):  # Limit to first 5 gaps
            question = gap.get("question", gap.get("description", "Unknown gap"))
            priority = gap.get("priority", "medium")
            formatted.append(f"{i}. [{priority.upper()}] {question}")

        remaining = len(gaps) - 5
        if remaining > 0:
            formatted.append(f"... and {remaining} more gaps")

        return "\n".join(formatted)

    def _format_collected_answers(self, answers: dict[str, Any]) -> str:
        """Format collected answers for context."""
        if not answers:
            return "No answers collected yet."

        formatted = []
        for key, value in list(answers.items())[:5]:
            if isinstance(value, str) and len(value) > 100:
                value = value[:100] + "..."
            formatted.append(f"- **{key}**: {value}")

        return "\n".join(formatted) if formatted else "No answers collected yet."

    def _detect_available_actions(self, session: ChatSession) -> list[str]:
        """
        Determine what actions are available based on session state.

        Args:
            session: The current chat session

        Returns:
            List of available action identifiers
        """
        actions = []

        # Check if protocol is extracted
        has_protocol = session.extracted_protocol is not None

        if has_protocol:
            actions.append("generate_abstract")
            actions.append("prefill_form")

            # If completion is high enough, offer more actions
            if session.completion_percentage >= 50:
                actions.append("generate_consent")
                actions.append("generate_summary")

            if session.completion_percentage >= 80:
                actions.append("export_protocol")
                actions.append("submit_for_review")

        # Always available actions
        actions.append("upload_document")
        actions.append("view_gaps")

        return actions

    def _generate_suggestions(
        self,
        session: ChatSession,
        response_content: str,
    ) -> list[str]:
        """
        Generate follow-up suggestions based on session state and response.

        Args:
            session: The current chat session
            response_content: The AI response content

        Returns:
            List of suggested follow-up prompts
        """
        suggestions = []

        # Suggestions based on session state
        if not session.extracted_protocol:
            suggestions.append("Upload your protocol document to get started")
            suggestions.append("What information do I need for an IRB protocol?")
        elif session.current_gaps:
            # Suggest addressing gaps
            gap_count = len(session.current_gaps)
            suggestions.append(f"Help me address the {gap_count} identified gaps")
            suggestions.append("What's the most critical missing information?")
        elif session.completion_percentage < 100:
            suggestions.append("What else is needed to complete the protocol?")
            suggestions.append("Generate a summary of the current protocol")

        # Always offer some standard suggestions
        if session.extracted_protocol:
            suggestions.append("Generate an abstract for this study")
            if session.completion_percentage >= 50:
                suggestions.append("Help me write the consent form")

        return suggestions[:3]  # Return max 3 suggestions
