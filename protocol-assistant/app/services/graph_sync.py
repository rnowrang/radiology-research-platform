"""Graph Sync Service - PostgreSQL to Neo4j synchronization.

This service handles:
- Initial seeding of existing projects to Neo4j
- Real-time sync of changes via events
- Batch sync operations
- Conflict detection during sync

Sync Strategy:
- PostgreSQL remains the source of truth for transactional data
- Neo4j is a derived view optimized for relationship queries
- Changes flow: PostgreSQL -> Event Bus -> Graph Sync -> Neo4j
"""

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services.graph_service import GraphService, get_graph_service
from app.services.event_bus import (
    EventBus,
    EventType,
    Event,
    get_event_bus,
)

logger = logging.getLogger(__name__)


class GraphSyncService:
    """Service for synchronizing PostgreSQL data to Neo4j.

    Handles both initial seeding and ongoing synchronization
    of projects, facts, documents, and relationships.
    """

    def __init__(
        self,
        db: AsyncSession,
        graph_service: Optional[GraphService] = None,
        event_bus: Optional[EventBus] = None,
    ):
        """Initialize the sync service.

        Args:
            db: Async database session
            graph_service: Optional graph service instance
            event_bus: Optional event bus instance
        """
        self.db = db
        self.graph = graph_service or get_graph_service()
        self.event_bus = event_bus or get_event_bus()
        self._sync_lock = asyncio.Lock()

    async def sync_all_projects(self) -> Dict[str, Any]:
        """Sync all projects from PostgreSQL to Neo4j.

        This is typically run once during initial setup or for recovery.

        Returns:
            Sync statistics
        """
        async with self._sync_lock:
            logger.info("Starting full project sync to Neo4j")
            stats = {
                "projects_synced": 0,
                "facts_synced": 0,
                "documents_synced": 0,
                "errors": [],
                "started_at": datetime.utcnow().isoformat(),
            }

            try:
                # Get all projects
                result = await self.db.execute(
                    text("""
                        SELECT p.id, p.title, p.status, p.created_at,
                               p.principal_investigator_id, p.department_id,
                               u.name as pi_name, u.email as pi_email
                        FROM projects p
                        LEFT JOIN users u ON p.principal_investigator_id = u.id
                        ORDER BY p.created_at DESC
                    """)
                )
                projects = result.fetchall()

                for project in projects:
                    try:
                        await self._sync_single_project(
                            project_id=UUID(project.id),
                            project_data={
                                "id": project.id,
                                "title": project.title,
                                "status": project.status,
                                "created_at": project.created_at,
                                "department_id": project.department_id,
                            },
                            pi_data={
                                "id": project.principal_investigator_id,
                                "name": project.pi_name,
                                "email": project.pi_email,
                            } if project.principal_investigator_id else None,
                        )
                        stats["projects_synced"] += 1
                    except Exception as e:
                        logger.error("Failed to sync project %s: %s", project.id, e)
                        stats["errors"].append({
                            "project_id": project.id,
                            "error": str(e),
                        })

                stats["completed_at"] = datetime.utcnow().isoformat()
                logger.info(
                    "Full sync complete: %d projects synced, %d errors",
                    stats["projects_synced"],
                    len(stats["errors"]),
                )

            except Exception as e:
                logger.error("Full sync failed: %s", e)
                stats["errors"].append({"error": str(e)})

            return stats

    async def _sync_single_project(
        self,
        project_id: UUID,
        project_data: Dict[str, Any],
        pi_data: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Sync a single project with its knowledge base.

        Args:
            project_id: Project UUID
            project_data: Project record data
            pi_data: Optional PI data
        """
        # Get study type from knowledge base if available
        kb_result = await self.db.execute(
            text("""
                SELECT protocol_data, facts, documents
                FROM project_knowledge_base
                WHERE project_id = :project_id
            """),
            {"project_id": str(project_id)}
        )
        kb_row = kb_result.fetchone()

        study_type = None
        facts = []
        documents = []

        if kb_row:
            protocol_data = kb_row.protocol_data or {}
            study_type = protocol_data.get("study_type")
            facts = kb_row.facts or []
            documents = kb_row.documents or []

        # Sync to graph
        await self.graph.sync_project_from_postgres(
            project_data={
                **project_data,
                "study_type": study_type,
            },
            facts=facts,
            documents=documents,
            pi_data=pi_data,
        )

    async def sync_project(self, project_id: UUID) -> bool:
        """Sync a single project on-demand.

        Args:
            project_id: Project UUID to sync

        Returns:
            True if sync successful
        """
        try:
            # Get project data
            result = await self.db.execute(
                text("""
                    SELECT p.id, p.title, p.status, p.created_at,
                           p.principal_investigator_id, p.department_id,
                           u.name as pi_name, u.email as pi_email
                    FROM projects p
                    LEFT JOIN users u ON p.principal_investigator_id = u.id
                    WHERE p.id = :project_id
                """),
                {"project_id": str(project_id)}
            )
            project = result.fetchone()

            if not project:
                logger.warning("Project %s not found for sync", project_id)
                return False

            await self._sync_single_project(
                project_id=project_id,
                project_data={
                    "id": project.id,
                    "title": project.title,
                    "status": project.status,
                    "created_at": project.created_at,
                    "department_id": project.department_id,
                },
                pi_data={
                    "id": project.principal_investigator_id,
                    "name": project.pi_name,
                    "email": project.pi_email,
                } if project.principal_investigator_id else None,
            )

            logger.info("Synced project %s to Neo4j", project_id)
            return True

        except Exception as e:
            logger.error("Failed to sync project %s: %s", project_id, e)
            return False

    async def sync_fact(
        self,
        project_id: UUID,
        fact_key: str,
        fact_value: Any,
        source: str,
        confidence: float,
    ) -> bool:
        """Sync a single fact to the graph.

        Args:
            project_id: Project UUID
            fact_key: Fact key
            fact_value: Fact value
            source: Source of the fact
            confidence: Confidence score

        Returns:
            True if sync successful
        """
        try:
            from uuid import uuid4

            # Create fact in graph
            await self.graph.create_fact(
                fact_id=uuid4(),
                project_id=project_id,
                key=fact_key,
                value=fact_value,
                source=source,
                confidence=confidence,
            )

            # Check for conflicts
            conflicts = await self.graph.find_conflicting_facts(
                project_id=project_id,
                key=fact_key,
            )

            # Create conflict relationships if found
            for conflict in conflicts:
                await self.graph.create_conflict_relationship(
                    fact1_id=UUID(conflict["fact1"]["id"]),
                    fact2_id=UUID(conflict["fact2"]["id"]),
                )

                # Publish conflict event
                await self.event_bus.publish_conflict_detected(
                    project_id=project_id,
                    fact_key=fact_key,
                    value1=conflict["value1"],
                    value2=conflict["value2"],
                    source1=conflict["source1"],
                    source2=conflict["source2"],
                )

            return True

        except Exception as e:
            logger.error("Failed to sync fact to graph: %s", e)
            return False

    async def handle_knowledge_event(self, event: Event) -> None:
        """Handle knowledge base events for graph sync.

        Args:
            event: Knowledge event to process
        """
        if not event.project_id:
            return

        project_id = UUID(event.project_id)

        if event.event_type == EventType.FACT_CREATED:
            await self.sync_fact(
                project_id=project_id,
                fact_key=event.payload.get("fact_key", ""),
                fact_value=event.payload.get("fact_value"),
                source=event.payload.get("source", "unknown"),
                confidence=event.payload.get("confidence", 1.0),
            )

        elif event.event_type == EventType.FACT_UPDATED:
            # For updates, we update the existing fact node
            await self.sync_fact(
                project_id=project_id,
                fact_key=event.payload.get("fact_key", ""),
                fact_value=event.payload.get("fact_value"),
                source=event.payload.get("source", "unknown"),
                confidence=event.payload.get("confidence", 1.0),
            )

        elif event.event_type == EventType.KNOWLEDGE_BASE_UPDATED:
            # Full KB update - resync the project
            await self.sync_project(project_id)

    async def handle_project_event(self, event: Event) -> None:
        """Handle project events for graph sync.

        Args:
            event: Project event to process
        """
        if not event.project_id:
            return

        project_id = UUID(event.project_id)

        if event.event_type == EventType.PROJECT_CREATED:
            await self.sync_project(project_id)

        elif event.event_type == EventType.PROJECT_UPDATED:
            # Update project node properties
            payload = event.payload
            update_props = {}
            if "title" in payload:
                update_props["title"] = payload["title"]
            if "status" in payload:
                update_props["status"] = payload["status"]
            if "study_type" in payload:
                update_props["study_type"] = payload["study_type"]

            if update_props:
                await self.graph.update_project(project_id, **update_props)

        elif event.event_type == EventType.PROJECT_STATUS_CHANGED:
            await self.graph.update_project(
                project_id,
                status=event.payload.get("new_status"),
            )

    async def start_event_consumers(self) -> None:
        """Start consuming events for graph sync."""
        # Subscribe to relevant events
        await self.event_bus.subscribe(
            event_types=[
                EventType.FACT_CREATED,
                EventType.FACT_UPDATED,
                EventType.KNOWLEDGE_BASE_UPDATED,
            ],
            callback=self.handle_knowledge_event,
            consumer_group="graph-sync",
            consumer_name="graph-sync-knowledge",
        )

        await self.event_bus.subscribe(
            event_types=[
                EventType.PROJECT_CREATED,
                EventType.PROJECT_UPDATED,
                EventType.PROJECT_STATUS_CHANGED,
            ],
            callback=self.handle_project_event,
            consumer_group="graph-sync",
            consumer_name="graph-sync-projects",
        )

        # Start consuming
        await self.event_bus.start_consuming(
            consumer_group="graph-sync",
            consumer_name="graph-sync-worker",
        )

        logger.info("Graph sync event consumers started")


async def run_initial_sync(db: AsyncSession) -> Dict[str, Any]:
    """Run initial sync of all projects to Neo4j.

    Args:
        db: Database session

    Returns:
        Sync statistics
    """
    sync_service = GraphSyncService(db)
    return await sync_service.sync_all_projects()


def get_graph_sync_service(db: AsyncSession) -> GraphSyncService:
    """Get a GraphSyncService instance.

    Args:
        db: Async database session

    Returns:
        GraphSyncService instance
    """
    return GraphSyncService(db)
