"""Event Bus Service using Redis Streams.

This service provides a publish/subscribe mechanism for real-time events
across the Research Intelligence Platform. It enables:

- Knowledge base changes triggering coherence checks
- Form changes syncing back to knowledge base
- Real-time UI updates via SSE
- Learning system event collection
- Cross-service communication

Event Categories:
- knowledge:updates    - Fact added/modified/deleted
- forms:changes        - Form field changed by user
- documents:uploaded   - New document extracted
- coherence:violations - Conflict detected
- coherence:resolved   - Conflict resolved
- learning:corrections - User corrected AI suggestion
"""

import asyncio
import json
import logging
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from uuid import UUID, uuid4

import redis.asyncio as redis
from pydantic import BaseModel, Field

from app.config import get_settings

logger = logging.getLogger(__name__)


class EventType(str, Enum):
    """Event types for the event bus."""
    # Knowledge events
    FACT_CREATED = "fact.created"
    FACT_UPDATED = "fact.updated"
    FACT_DELETED = "fact.deleted"
    KNOWLEDGE_BASE_UPDATED = "knowledge_base.updated"

    # Form events
    FORM_FIELD_CHANGED = "form.field_changed"
    FORM_SUBMITTED = "form.submitted"
    FORM_APPROVED = "form.approved"

    # Document events
    DOCUMENT_UPLOADED = "document.uploaded"
    DOCUMENT_EXTRACTED = "document.extracted"
    DOCUMENT_GENERATED = "document.generated"

    # Coherence events
    CONFLICT_DETECTED = "coherence.conflict_detected"
    CONFLICT_RESOLVED = "coherence.conflict_resolved"
    COHERENCE_CHECK_COMPLETE = "coherence.check_complete"

    # Learning events
    CORRECTION_RECORDED = "learning.correction_recorded"
    PATTERN_LEARNED = "learning.pattern_learned"

    # Project events
    PROJECT_CREATED = "project.created"
    PROJECT_UPDATED = "project.updated"
    PROJECT_STATUS_CHANGED = "project.status_changed"

    # Session events
    SESSION_CREATED = "session.created"
    SESSION_CLOSED = "session.closed"


class EventPriority(str, Enum):
    """Priority levels for events."""
    HIGH = "high"      # Process immediately (coherence violations)
    NORMAL = "normal"  # Process in order
    LOW = "low"        # Batch processing OK (learning, analytics)


class Event(BaseModel):
    """Event payload model."""
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: EventType
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    project_id: Optional[str] = None
    user_id: Optional[str] = None
    institution_id: Optional[str] = None
    priority: EventPriority = EventPriority.NORMAL
    payload: Dict[str, Any] = Field(default_factory=dict)
    correlation_id: Optional[str] = None

    class Config:
        use_enum_values = True


class EventBus:
    """Redis Streams-based event bus.

    Provides:
    - Publishing events to streams
    - Subscribing to event streams
    - Consumer groups for distributed processing
    - Event acknowledgment and retry
    """

    # Stream names
    STREAMS = {
        "knowledge": "events:knowledge",
        "forms": "events:forms",
        "documents": "events:documents",
        "coherence": "events:coherence",
        "learning": "events:learning",
        "projects": "events:projects",
        "sessions": "events:sessions",
    }

    def __init__(self):
        """Initialize the event bus."""
        self.settings = get_settings()
        self._redis: Optional[redis.Redis] = None
        self._subscribers: Dict[str, List[Callable]] = {}
        self._consumer_tasks: List[asyncio.Task] = []
        self._running = False

    async def connect(self) -> None:
        """Connect to Redis."""
        if self._redis is not None:
            return

        try:
            self._redis = redis.from_url(
                self.settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            # Test connection
            await self._redis.ping()
            logger.info("Connected to Redis at %s", self.settings.REDIS_URL)
        except Exception as e:
            logger.error("Failed to connect to Redis: %s", e)
            raise

    async def close(self) -> None:
        """Close Redis connection and stop consumers."""
        self._running = False

        # Cancel consumer tasks
        for task in self._consumer_tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._consumer_tasks.clear()

        # Close Redis
        if self._redis is not None:
            await self._redis.close()
            self._redis = None
            logger.info("Closed Redis connection")

    async def _ensure_connected(self) -> None:
        """Ensure Redis is connected."""
        if self._redis is None:
            await self.connect()

    # =========================================================================
    # Publishing
    # =========================================================================

    async def publish(self, event: Event) -> str:
        """Publish an event to the appropriate stream.

        Args:
            event: Event to publish

        Returns:
            Redis stream message ID
        """
        await self._ensure_connected()

        # Determine stream based on event type
        stream = self._get_stream_for_event(event.event_type)

        # Serialize event
        event_data = {
            "event_id": event.event_id,
            "event_type": event.event_type,
            "timestamp": event.timestamp.isoformat(),
            "project_id": event.project_id or "",
            "user_id": event.user_id or "",
            "institution_id": event.institution_id or "",
            "priority": event.priority,
            "payload": json.dumps(event.payload),
            "correlation_id": event.correlation_id or "",
        }

        # Add to stream
        message_id = await self._redis.xadd(stream, event_data)
        logger.debug("Published event %s to %s: %s", event.event_id, stream, message_id)

        # Also publish to pub/sub for real-time subscribers
        channel = f"realtime:{stream}"
        await self._redis.publish(channel, json.dumps(event.model_dump(), default=str))

        return message_id

    async def publish_fact_created(
        self,
        project_id: UUID,
        fact_key: str,
        fact_value: Any,
        source: str,
        confidence: float,
        user_id: Optional[UUID] = None,
        correlation_id: Optional[str] = None,
    ) -> str:
        """Publish a fact created event.

        Args:
            project_id: Project UUID
            fact_key: Key of the fact
            fact_value: Value of the fact
            source: Source of the fact
            confidence: Confidence score
            user_id: Optional user who created it
            correlation_id: Optional correlation ID

        Returns:
            Message ID
        """
        event = Event(
            event_type=EventType.FACT_CREATED,
            project_id=str(project_id),
            user_id=str(user_id) if user_id else None,
            priority=EventPriority.HIGH,  # Trigger coherence check
            payload={
                "fact_key": fact_key,
                "fact_value": fact_value,
                "source": source,
                "confidence": confidence,
            },
            correlation_id=correlation_id,
        )
        return await self.publish(event)

    async def publish_conflict_detected(
        self,
        project_id: UUID,
        fact_key: str,
        value1: Any,
        value2: Any,
        source1: str,
        source2: str,
        correlation_id: Optional[str] = None,
    ) -> str:
        """Publish a conflict detected event.

        Args:
            project_id: Project UUID
            fact_key: Key where conflict was found
            value1: First conflicting value
            value2: Second conflicting value
            source1: Source of first value
            source2: Source of second value
            correlation_id: Optional correlation ID

        Returns:
            Message ID
        """
        event = Event(
            event_type=EventType.CONFLICT_DETECTED,
            project_id=str(project_id),
            priority=EventPriority.HIGH,
            payload={
                "fact_key": fact_key,
                "value1": value1,
                "value2": value2,
                "source1": source1,
                "source2": source2,
            },
            correlation_id=correlation_id,
        )
        return await self.publish(event)

    async def publish_form_field_changed(
        self,
        project_id: UUID,
        form_id: UUID,
        field_id: str,
        old_value: Any,
        new_value: Any,
        user_id: UUID,
        correlation_id: Optional[str] = None,
    ) -> str:
        """Publish a form field changed event.

        Args:
            project_id: Project UUID
            form_id: Form UUID
            field_id: Field identifier
            old_value: Previous value
            new_value: New value
            user_id: User who made the change
            correlation_id: Optional correlation ID

        Returns:
            Message ID
        """
        event = Event(
            event_type=EventType.FORM_FIELD_CHANGED,
            project_id=str(project_id),
            user_id=str(user_id),
            priority=EventPriority.NORMAL,
            payload={
                "form_id": str(form_id),
                "field_id": field_id,
                "old_value": old_value,
                "new_value": new_value,
            },
            correlation_id=correlation_id,
        )
        return await self.publish(event)

    async def publish_correction_recorded(
        self,
        project_id: UUID,
        field_id: str,
        original_value: Any,
        corrected_value: Any,
        user_id: UUID,
        institution_id: Optional[UUID] = None,
        correlation_id: Optional[str] = None,
    ) -> str:
        """Publish a correction recorded event for learning.

        Args:
            project_id: Project UUID
            field_id: Field that was corrected
            original_value: AI-suggested value
            corrected_value: User's correction
            user_id: User who made correction
            institution_id: Optional institution ID
            correlation_id: Optional correlation ID

        Returns:
            Message ID
        """
        event = Event(
            event_type=EventType.CORRECTION_RECORDED,
            project_id=str(project_id),
            user_id=str(user_id),
            institution_id=str(institution_id) if institution_id else None,
            priority=EventPriority.LOW,  # Batch processing OK
            payload={
                "field_id": field_id,
                "original_value": original_value,
                "corrected_value": corrected_value,
            },
            correlation_id=correlation_id,
        )
        return await self.publish(event)

    # =========================================================================
    # Subscribing
    # =========================================================================

    def _get_stream_for_event(self, event_type: EventType) -> str:
        """Get the stream name for an event type."""
        type_str = event_type if isinstance(event_type, str) else event_type.value
        prefix = type_str.split(".")[0]
        mapping = {
            "fact": "knowledge",
            "knowledge_base": "knowledge",
            "form": "forms",
            "document": "documents",
            "coherence": "coherence",
            "learning": "learning",
            "project": "projects",
            "session": "sessions",
        }
        return self.STREAMS.get(mapping.get(prefix, "projects"), self.STREAMS["projects"])

    async def subscribe(
        self,
        event_types: List[EventType],
        callback: Callable[[Event], Any],
        consumer_group: Optional[str] = None,
        consumer_name: Optional[str] = None,
    ) -> None:
        """Subscribe to events with a callback.

        Args:
            event_types: List of event types to subscribe to
            callback: Async function to call for each event
            consumer_group: Optional consumer group for distributed processing
            consumer_name: Name of this consumer in the group
        """
        await self._ensure_connected()

        # Group events by stream
        streams_to_watch = set()
        for event_type in event_types:
            stream = self._get_stream_for_event(event_type)
            streams_to_watch.add(stream)

            # Store callback
            if stream not in self._subscribers:
                self._subscribers[stream] = []
            self._subscribers[stream].append((event_types, callback))

        # Create consumer groups if specified
        if consumer_group:
            for stream in streams_to_watch:
                try:
                    await self._redis.xgroup_create(stream, consumer_group, mkstream=True)
                except Exception:
                    # Group may already exist
                    pass

    async def start_consuming(
        self,
        consumer_group: str = "default",
        consumer_name: Optional[str] = None,
    ) -> None:
        """Start consuming events from subscribed streams.

        Args:
            consumer_group: Consumer group name
            consumer_name: This consumer's name
        """
        if self._running:
            return

        self._running = True
        consumer_name = consumer_name or f"consumer-{uuid4().hex[:8]}"

        for stream, callbacks in self._subscribers.items():
            task = asyncio.create_task(
                self._consume_stream(stream, callbacks, consumer_group, consumer_name)
            )
            self._consumer_tasks.append(task)

        logger.info("Started consuming from %d streams", len(self._consumer_tasks))

    async def _consume_stream(
        self,
        stream: str,
        callbacks: List[tuple],
        consumer_group: str,
        consumer_name: str,
    ) -> None:
        """Consume events from a stream."""
        while self._running:
            try:
                # Read from stream using consumer group
                messages = await self._redis.xreadgroup(
                    groupname=consumer_group,
                    consumername=consumer_name,
                    streams={stream: ">"},
                    count=10,
                    block=5000,  # 5 second timeout
                )

                if not messages:
                    continue

                for stream_name, stream_messages in messages:
                    for message_id, data in stream_messages:
                        try:
                            # Parse event
                            event = Event(
                                event_id=data.get("event_id", ""),
                                event_type=EventType(data.get("event_type")),
                                timestamp=datetime.fromisoformat(data.get("timestamp", datetime.utcnow().isoformat())),
                                project_id=data.get("project_id") or None,
                                user_id=data.get("user_id") or None,
                                institution_id=data.get("institution_id") or None,
                                priority=EventPriority(data.get("priority", "normal")),
                                payload=json.loads(data.get("payload", "{}")),
                                correlation_id=data.get("correlation_id") or None,
                            )

                            # Call matching callbacks
                            for event_types, callback in callbacks:
                                if event.event_type in event_types:
                                    try:
                                        result = callback(event)
                                        if asyncio.iscoroutine(result):
                                            await result
                                    except Exception as e:
                                        logger.error("Callback error for event %s: %s", event.event_id, e)

                            # Acknowledge message
                            await self._redis.xack(stream, consumer_group, message_id)

                        except Exception as e:
                            logger.error("Failed to process message %s: %s", message_id, e)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Stream consumer error: %s", e)
                await asyncio.sleep(1)  # Brief pause before retry

    # =========================================================================
    # Real-time Pub/Sub
    # =========================================================================

    async def subscribe_realtime(
        self,
        streams: List[str],
        callback: Callable[[Event], Any],
    ) -> asyncio.Task:
        """Subscribe to real-time events via pub/sub.

        This is for UI clients that need immediate updates.

        Args:
            streams: List of stream names to subscribe to
            callback: Async function to call for each event

        Returns:
            Background task handling the subscription
        """
        await self._ensure_connected()

        channels = [f"realtime:{self.STREAMS.get(s, s)}" for s in streams]

        async def listener():
            pubsub = self._redis.pubsub()
            await pubsub.subscribe(*channels)

            try:
                async for message in pubsub.listen():
                    if message["type"] == "message":
                        try:
                            data = json.loads(message["data"])
                            event = Event(**data)
                            result = callback(event)
                            if asyncio.iscoroutine(result):
                                await result
                        except Exception as e:
                            logger.error("Realtime callback error: %s", e)
            finally:
                await pubsub.unsubscribe(*channels)

        task = asyncio.create_task(listener())
        self._consumer_tasks.append(task)
        return task

    # =========================================================================
    # Utilities
    # =========================================================================

    async def get_stream_info(self, stream_name: str) -> Dict[str, Any]:
        """Get information about a stream.

        Args:
            stream_name: Name of the stream

        Returns:
            Stream information
        """
        await self._ensure_connected()
        stream = self.STREAMS.get(stream_name, stream_name)

        try:
            info = await self._redis.xinfo_stream(stream)
            return {
                "length": info.get("length", 0),
                "first_entry": info.get("first-entry"),
                "last_entry": info.get("last-entry"),
                "groups": info.get("groups", 0),
            }
        except Exception:
            return {"length": 0, "error": "Stream not found"}

    async def get_pending_events(
        self,
        stream_name: str,
        consumer_group: str,
    ) -> List[Dict[str, Any]]:
        """Get pending (unacknowledged) events.

        Args:
            stream_name: Name of the stream
            consumer_group: Consumer group name

        Returns:
            List of pending events
        """
        await self._ensure_connected()
        stream = self.STREAMS.get(stream_name, stream_name)

        try:
            pending = await self._redis.xpending(stream, consumer_group)
            return [{
                "count": pending.get("pending", 0),
                "min_id": pending.get("min"),
                "max_id": pending.get("max"),
            }]
        except Exception:
            return []


# Module-level singleton
_event_bus: Optional[EventBus] = None


def get_event_bus() -> EventBus:
    """Get the event bus singleton.

    Returns:
        EventBus instance
    """
    global _event_bus
    if _event_bus is None:
        _event_bus = EventBus()
    return _event_bus


async def init_event_bus() -> EventBus:
    """Initialize and return the event bus.

    Returns:
        Initialized EventBus instance
    """
    bus = get_event_bus()
    await bus.connect()
    return bus
