"""Neo4j Graph Service for Research Intelligence Platform.

This service manages the Neo4j graph database which stores:
- Project relationships and metadata
- Researcher connections and collaborations
- Document relationships and derivations
- Fact provenance and conflict relationships
- Learning patterns and corrections

The graph enables:
- Cross-project queries ("who else studies X?")
- Coherence checking (conflict detection)
- Similarity matching
- Research network analysis
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from neo4j import AsyncGraphDatabase, AsyncDriver, AsyncSession
from neo4j.exceptions import ServiceUnavailable, SessionExpired

from app.config import get_settings

logger = logging.getLogger(__name__)


class GraphService:
    """Service for Neo4j graph database operations.

    Provides methods for:
    - Node CRUD (Project, Person, Document, Fact, Protocol)
    - Relationship management
    - Graph queries and traversals
    - Conflict detection
    - Similarity searches
    """

    _driver: Optional[AsyncDriver] = None
    _initialized: bool = False

    def __init__(self):
        """Initialize the graph service."""
        self.settings = get_settings()
        self._retry_count = 3
        self._retry_delay = 1.0

    async def connect(self) -> None:
        """Establish connection to Neo4j."""
        if GraphService._driver is not None:
            return

        try:
            GraphService._driver = AsyncGraphDatabase.driver(
                self.settings.NEO4J_URI,
                auth=(self.settings.NEO4J_USER, self.settings.NEO4J_PASSWORD),
                max_connection_lifetime=3600,
                max_connection_pool_size=50,
                connection_acquisition_timeout=60,
            )
            # Verify connectivity
            await GraphService._driver.verify_connectivity()
            logger.info("Connected to Neo4j at %s", self.settings.NEO4J_URI)
        except Exception as e:
            logger.error("Failed to connect to Neo4j: %s", e)
            raise

    async def close(self) -> None:
        """Close the Neo4j connection."""
        if GraphService._driver is not None:
            await GraphService._driver.close()
            GraphService._driver = None
            logger.info("Closed Neo4j connection")

    async def initialize_schema(self) -> None:
        """Initialize graph schema with constraints and indexes."""
        if GraphService._initialized:
            return

        constraints = [
            # Unique constraints
            "CREATE CONSTRAINT project_id IF NOT EXISTS FOR (p:Project) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE",
            "CREATE CONSTRAINT fact_id IF NOT EXISTS FOR (f:Fact) REQUIRE f.id IS UNIQUE",
            "CREATE CONSTRAINT protocol_id IF NOT EXISTS FOR (p:Protocol) REQUIRE p.id IS UNIQUE",
            "CREATE CONSTRAINT department_id IF NOT EXISTS FOR (d:Department) REQUIRE d.id IS UNIQUE",
            "CREATE CONSTRAINT institution_id IF NOT EXISTS FOR (i:Institution) REQUIRE i.id IS UNIQUE",
        ]

        indexes = [
            # Performance indexes
            "CREATE INDEX project_status IF NOT EXISTS FOR (p:Project) ON (p.status)",
            "CREATE INDEX project_type IF NOT EXISTS FOR (p:Project) ON (p.study_type)",
            "CREATE INDEX fact_key IF NOT EXISTS FOR (f:Fact) ON (f.key)",
            "CREATE INDEX document_type IF NOT EXISTS FOR (d:Document) ON (d.type)",
            "CREATE INDEX person_role IF NOT EXISTS FOR (p:Person) ON (p.role)",
        ]

        async with self._session() as session:
            for constraint in constraints:
                try:
                    await session.run(constraint)
                except Exception as e:
                    # Constraint may already exist
                    logger.debug("Constraint creation note: %s", e)

            for index in indexes:
                try:
                    await session.run(index)
                except Exception as e:
                    logger.debug("Index creation note: %s", e)

        GraphService._initialized = True
        logger.info("Neo4j schema initialized")

    @asynccontextmanager
    async def _session(self):
        """Get a Neo4j session with retry logic."""
        if GraphService._driver is None:
            await self.connect()

        for attempt in range(self._retry_count):
            try:
                async with GraphService._driver.session() as session:
                    yield session
                    return
            except (ServiceUnavailable, SessionExpired) as e:
                if attempt < self._retry_count - 1:
                    logger.warning("Neo4j session error, retrying: %s", e)
                    await asyncio.sleep(self._retry_delay * (attempt + 1))
                else:
                    raise

    # =====================================================================
    # Project Operations
    # =====================================================================

    async def create_project(
        self,
        project_id: UUID,
        title: str,
        status: str,
        study_type: Optional[str] = None,
        department_id: Optional[UUID] = None,
        institution_id: Optional[UUID] = None,
        created_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Create a Project node in the graph.

        Args:
            project_id: UUID of the project
            title: Project title
            status: Project status
            study_type: Type of study (retrospective, prospective, etc.)
            department_id: Optional department UUID
            institution_id: Optional institution UUID
            created_at: Creation timestamp

        Returns:
            Created project node properties
        """
        query = """
        MERGE (p:Project {id: $id})
        SET p.title = $title,
            p.status = $status,
            p.study_type = $study_type,
            p.created_at = $created_at,
            p.updated_at = datetime()
        WITH p
        OPTIONAL MATCH (d:Department {id: $department_id})
        OPTIONAL MATCH (i:Institution {id: $institution_id})
        FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |
            MERGE (p)-[:IN_DEPARTMENT]->(d)
        )
        FOREACH (_ IN CASE WHEN i IS NOT NULL THEN [1] ELSE [] END |
            MERGE (p)-[:IN_INSTITUTION]->(i)
        )
        RETURN p
        """
        async with self._session() as session:
            result = await session.run(
                query,
                id=str(project_id),
                title=title,
                status=status,
                study_type=study_type,
                department_id=str(department_id) if department_id else None,
                institution_id=str(institution_id) if institution_id else None,
                created_at=(created_at or datetime.utcnow()).isoformat(),
            )
            record = await result.single()
            return dict(record["p"]) if record else {}

    async def update_project(
        self,
        project_id: UUID,
        **properties
    ) -> Dict[str, Any]:
        """Update a Project node.

        Args:
            project_id: UUID of the project
            **properties: Properties to update

        Returns:
            Updated project node properties
        """
        set_clauses = ", ".join(f"p.{k} = ${k}" for k in properties.keys())
        query = f"""
        MATCH (p:Project {{id: $id}})
        SET {set_clauses}, p.updated_at = datetime()
        RETURN p
        """
        async with self._session() as session:
            result = await session.run(query, id=str(project_id), **properties)
            record = await result.single()
            return dict(record["p"]) if record else {}

    async def get_project(self, project_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a Project node by ID.

        Args:
            project_id: UUID of the project

        Returns:
            Project node properties or None if not found
        """
        query = """
        MATCH (p:Project {id: $id})
        RETURN p
        """
        async with self._session() as session:
            result = await session.run(query, id=str(project_id))
            record = await result.single()
            return dict(record["p"]) if record else None

    async def delete_project(self, project_id: UUID) -> bool:
        """Delete a Project node and its relationships.

        Args:
            project_id: UUID of the project

        Returns:
            True if deleted, False if not found
        """
        query = """
        MATCH (p:Project {id: $id})
        DETACH DELETE p
        RETURN count(p) as deleted
        """
        async with self._session() as session:
            result = await session.run(query, id=str(project_id))
            record = await result.single()
            return record["deleted"] > 0 if record else False

    # =====================================================================
    # Person Operations
    # =====================================================================

    async def create_person(
        self,
        person_id: UUID,
        name: str,
        email: Optional[str] = None,
        role: Optional[str] = None,
        department_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """Create a Person node.

        Args:
            person_id: UUID of the person
            name: Person's name
            email: Optional email
            role: Role (e.g., 'researcher', 'admin')
            department_id: Optional department UUID

        Returns:
            Created person node properties
        """
        query = """
        MERGE (p:Person {id: $id})
        SET p.name = $name,
            p.email = $email,
            p.role = $role,
            p.updated_at = datetime()
        WITH p
        OPTIONAL MATCH (d:Department {id: $department_id})
        FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |
            MERGE (p)-[:BELONGS_TO]->(d)
        )
        RETURN p
        """
        async with self._session() as session:
            result = await session.run(
                query,
                id=str(person_id),
                name=name,
                email=email,
                role=role,
                department_id=str(department_id) if department_id else None,
            )
            record = await result.single()
            return dict(record["p"]) if record else {}

    async def link_person_to_project(
        self,
        person_id: UUID,
        project_id: UUID,
        relationship: str = "LED_BY",
        role_in_project: Optional[str] = None,
    ) -> bool:
        """Link a person to a project with a relationship.

        Args:
            person_id: UUID of the person
            project_id: UUID of the project
            relationship: Type of relationship (LED_BY, COLLABORATES_ON, etc.)
            role_in_project: Optional role specification

        Returns:
            True if link created
        """
        query = f"""
        MATCH (person:Person {{id: $person_id}})
        MATCH (project:Project {{id: $project_id}})
        MERGE (project)-[r:{relationship}]->(person)
        SET r.role = $role_in_project,
            r.created_at = datetime()
        RETURN r
        """
        async with self._session() as session:
            result = await session.run(
                query,
                person_id=str(person_id),
                project_id=str(project_id),
                role_in_project=role_in_project,
            )
            record = await result.single()
            return record is not None

    # =====================================================================
    # Fact Operations
    # =====================================================================

    async def create_fact(
        self,
        fact_id: UUID,
        project_id: UUID,
        key: str,
        value: Any,
        source: str,
        confidence: float = 1.0,
        source_reference: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a Fact node linked to a project.

        Args:
            fact_id: UUID for the fact
            project_id: UUID of the project
            key: Fact key
            value: Fact value (will be stringified)
            source: Source of the fact
            confidence: Confidence score (0-1)
            source_reference: Optional reference

        Returns:
            Created fact node properties
        """
        query = """
        MATCH (project:Project {id: $project_id})
        MERGE (f:Fact {id: $fact_id})
        SET f.key = $key,
            f.value = $value,
            f.source = $source,
            f.confidence = $confidence,
            f.source_reference = $source_reference,
            f.created_at = datetime(),
            f.updated_at = datetime()
        MERGE (project)-[:HAS_FACT]->(f)
        RETURN f
        """
        async with self._session() as session:
            result = await session.run(
                query,
                fact_id=str(fact_id),
                project_id=str(project_id),
                key=key,
                value=str(value) if value is not None else None,
                source=source,
                confidence=confidence,
                source_reference=source_reference,
            )
            record = await result.single()
            return dict(record["f"]) if record else {}

    async def find_conflicting_facts(
        self,
        project_id: UUID,
        key: str,
    ) -> List[Dict[str, Any]]:
        """Find facts with the same key but different values.

        Args:
            project_id: UUID of the project
            key: Fact key to check

        Returns:
            List of conflicting fact pairs with details
        """
        query = """
        MATCH (p:Project {id: $project_id})-[:HAS_FACT]->(f1:Fact {key: $key})
        MATCH (p)-[:HAS_FACT]->(f2:Fact {key: $key})
        WHERE f1.id < f2.id AND f1.value <> f2.value
        RETURN f1, f2,
               f1.source as source1, f2.source as source2,
               f1.value as value1, f2.value as value2
        """
        async with self._session() as session:
            result = await session.run(query, project_id=str(project_id), key=key)
            conflicts = []
            async for record in result:
                conflicts.append({
                    "fact1": dict(record["f1"]),
                    "fact2": dict(record["f2"]),
                    "source1": record["source1"],
                    "source2": record["source2"],
                    "value1": record["value1"],
                    "value2": record["value2"],
                })
            return conflicts

    async def create_conflict_relationship(
        self,
        fact1_id: UUID,
        fact2_id: UUID,
        detected_at: Optional[datetime] = None,
    ) -> bool:
        """Create a CONFLICTS_WITH relationship between two facts.

        Args:
            fact1_id: UUID of first fact
            fact2_id: UUID of second fact
            detected_at: When conflict was detected

        Returns:
            True if relationship created
        """
        query = """
        MATCH (f1:Fact {id: $fact1_id})
        MATCH (f2:Fact {id: $fact2_id})
        MERGE (f1)-[r:CONFLICTS_WITH]->(f2)
        SET r.detected_at = $detected_at,
            r.resolved = false
        RETURN r
        """
        async with self._session() as session:
            result = await session.run(
                query,
                fact1_id=str(fact1_id),
                fact2_id=str(fact2_id),
                detected_at=(detected_at or datetime.utcnow()).isoformat(),
            )
            record = await result.single()
            return record is not None

    async def resolve_conflict(
        self,
        fact1_id: UUID,
        fact2_id: UUID,
        resolution: str,
        resolved_by: Optional[UUID] = None,
    ) -> bool:
        """Mark a conflict as resolved.

        Args:
            fact1_id: UUID of first fact
            fact2_id: UUID of second fact
            resolution: How it was resolved
            resolved_by: UUID of user who resolved it

        Returns:
            True if updated
        """
        query = """
        MATCH (f1:Fact {id: $fact1_id})-[r:CONFLICTS_WITH]-(f2:Fact {id: $fact2_id})
        SET r.resolved = true,
            r.resolution = $resolution,
            r.resolved_by = $resolved_by,
            r.resolved_at = datetime()
        RETURN r
        """
        async with self._session() as session:
            result = await session.run(
                query,
                fact1_id=str(fact1_id),
                fact2_id=str(fact2_id),
                resolution=resolution,
                resolved_by=str(resolved_by) if resolved_by else None,
            )
            record = await result.single()
            return record is not None

    # =====================================================================
    # Document Operations
    # =====================================================================

    async def create_document(
        self,
        document_id: UUID,
        project_id: UUID,
        doc_type: str,
        filename: Optional[str] = None,
        status: str = "draft",
    ) -> Dict[str, Any]:
        """Create a Document node linked to a project.

        Args:
            document_id: UUID of the document
            project_id: UUID of the project
            doc_type: Document type (protocol, consent, irb_form, etc.)
            filename: Original filename
            status: Document status

        Returns:
            Created document node properties
        """
        query = """
        MATCH (p:Project {id: $project_id})
        MERGE (d:Document {id: $document_id})
        SET d.type = $doc_type,
            d.filename = $filename,
            d.status = $status,
            d.created_at = datetime(),
            d.updated_at = datetime()
        MERGE (p)-[:HAS_DOCUMENT]->(d)
        RETURN d
        """
        async with self._session() as session:
            result = await session.run(
                query,
                document_id=str(document_id),
                project_id=str(project_id),
                doc_type=doc_type,
                filename=filename,
                status=status,
            )
            record = await result.single()
            return dict(record["d"]) if record else {}

    async def link_fact_to_document(
        self,
        fact_id: UUID,
        document_id: UUID,
        location: Optional[str] = None,
    ) -> bool:
        """Link a fact to its source document.

        Args:
            fact_id: UUID of the fact
            document_id: UUID of the document
            location: Location in document (page, section, etc.)

        Returns:
            True if link created
        """
        query = """
        MATCH (f:Fact {id: $fact_id})
        MATCH (d:Document {id: $document_id})
        MERGE (f)-[r:EXTRACTED_FROM]->(d)
        SET r.location = $location,
            r.created_at = datetime()
        RETURN r
        """
        async with self._session() as session:
            result = await session.run(
                query,
                fact_id=str(fact_id),
                document_id=str(document_id),
                location=location,
            )
            record = await result.single()
            return record is not None

    async def create_document_derivation(
        self,
        derived_id: UUID,
        source_id: UUID,
        derivation_type: str = "generated_from",
    ) -> bool:
        """Create a derivation relationship between documents.

        Args:
            derived_id: UUID of the derived document
            source_id: UUID of the source document
            derivation_type: Type of derivation

        Returns:
            True if relationship created
        """
        query = """
        MATCH (derived:Document {id: $derived_id})
        MATCH (source:Document {id: $source_id})
        MERGE (derived)-[r:DERIVED_FROM]->(source)
        SET r.derivation_type = $derivation_type,
            r.created_at = datetime()
        RETURN r
        """
        async with self._session() as session:
            result = await session.run(
                query,
                derived_id=str(derived_id),
                source_id=str(source_id),
                derivation_type=derivation_type,
            )
            record = await result.single()
            return record is not None

    # =====================================================================
    # Query Operations
    # =====================================================================

    async def find_similar_projects(
        self,
        project_id: UUID,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Find projects similar to the given project.

        Based on shared study type, methodology, population, etc.

        Args:
            project_id: UUID of the reference project
            limit: Maximum results to return

        Returns:
            List of similar projects with similarity scores
        """
        query = """
        MATCH (p:Project {id: $project_id})
        MATCH (other:Project)
        WHERE other.id <> p.id
          AND (other.study_type = p.study_type OR other.study_type IS NULL OR p.study_type IS NULL)
        WITH other, p,
             CASE WHEN other.study_type = p.study_type THEN 1 ELSE 0 END as type_match
        OPTIONAL MATCH (p)-[:IN_DEPARTMENT]->(d:Department)<-[:IN_DEPARTMENT]-(other)
        WITH other, type_match, count(d) as dept_match
        RETURN other,
               (type_match * 0.4 + CASE WHEN dept_match > 0 THEN 0.3 ELSE 0 END) as similarity
        ORDER BY similarity DESC
        LIMIT $limit
        """
        async with self._session() as session:
            result = await session.run(
                query,
                project_id=str(project_id),
                limit=limit,
            )
            projects = []
            async for record in result:
                projects.append({
                    "project": dict(record["other"]),
                    "similarity": record["similarity"],
                })
            return projects

    async def find_researchers_by_topic(
        self,
        topic: str,
        institution_id: Optional[UUID] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Find researchers who work on projects matching a topic.

        Args:
            topic: Topic to search for (in project titles/facts)
            institution_id: Optional institution filter
            limit: Maximum results

        Returns:
            List of researchers with project counts
        """
        query = """
        MATCH (p:Project)-[:LED_BY]->(person:Person)
        WHERE toLower(p.title) CONTAINS toLower($topic)
           OR EXISTS {
             MATCH (p)-[:HAS_FACT]->(f:Fact)
             WHERE toLower(f.value) CONTAINS toLower($topic)
           }
        WITH person, count(DISTINCT p) as project_count
        RETURN person, project_count
        ORDER BY project_count DESC
        LIMIT $limit
        """
        async with self._session() as session:
            result = await session.run(
                query,
                topic=topic,
                limit=limit,
            )
            researchers = []
            async for record in result:
                researchers.append({
                    "person": dict(record["person"]),
                    "project_count": record["project_count"],
                })
            return researchers

    async def get_project_coherence_status(
        self,
        project_id: UUID,
    ) -> Dict[str, Any]:
        """Get coherence status for a project.

        Args:
            project_id: UUID of the project

        Returns:
            Dict with coherence metrics and unresolved conflicts
        """
        query = """
        MATCH (p:Project {id: $project_id})
        OPTIONAL MATCH (p)-[:HAS_FACT]->(f:Fact)
        WITH p, count(f) as total_facts
        OPTIONAL MATCH (p)-[:HAS_FACT]->(f1:Fact)-[c:CONFLICTS_WITH {resolved: false}]->(f2:Fact)
        WITH p, total_facts, count(c) as unresolved_conflicts
        OPTIONAL MATCH (p)-[:HAS_DOCUMENT]->(d:Document)
        WITH p, total_facts, unresolved_conflicts, count(d) as total_documents
        RETURN p.id as project_id,
               total_facts,
               unresolved_conflicts,
               total_documents,
               CASE WHEN total_facts > 0
                    THEN 1.0 - (toFloat(unresolved_conflicts) / total_facts)
                    ELSE 1.0
               END as coherence_score
        """
        async with self._session() as session:
            result = await session.run(query, project_id=str(project_id))
            record = await result.single()
            if record:
                return {
                    "project_id": record["project_id"],
                    "total_facts": record["total_facts"],
                    "unresolved_conflicts": record["unresolved_conflicts"],
                    "total_documents": record["total_documents"],
                    "coherence_score": record["coherence_score"],
                }
            return {
                "project_id": str(project_id),
                "total_facts": 0,
                "unresolved_conflicts": 0,
                "total_documents": 0,
                "coherence_score": 1.0,
            }

    async def get_unresolved_conflicts(
        self,
        project_id: UUID,
    ) -> List[Dict[str, Any]]:
        """Get all unresolved conflicts for a project.

        Args:
            project_id: UUID of the project

        Returns:
            List of unresolved conflict details
        """
        query = """
        MATCH (p:Project {id: $project_id})-[:HAS_FACT]->(f1:Fact)-[c:CONFLICTS_WITH {resolved: false}]->(f2:Fact)
        RETURN f1, f2, c.detected_at as detected_at
        ORDER BY c.detected_at DESC
        """
        async with self._session() as session:
            result = await session.run(query, project_id=str(project_id))
            conflicts = []
            async for record in result:
                conflicts.append({
                    "fact1": dict(record["f1"]),
                    "fact2": dict(record["f2"]),
                    "detected_at": record["detected_at"],
                })
            return conflicts

    # =====================================================================
    # Batch Operations
    # =====================================================================

    async def sync_project_from_postgres(
        self,
        project_data: Dict[str, Any],
        facts: List[Dict[str, Any]],
        documents: List[Dict[str, Any]],
        pi_data: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Sync a complete project from PostgreSQL to Neo4j.

        Args:
            project_data: Project record from PostgreSQL
            facts: List of facts from knowledge base
            documents: List of documents
            pi_data: Optional PI information

        Returns:
            True if sync successful
        """
        try:
            # Create project node
            await self.create_project(
                project_id=UUID(project_data["id"]),
                title=project_data.get("title", "Untitled"),
                status=project_data.get("status", "draft"),
                study_type=project_data.get("study_type"),
                department_id=UUID(project_data["department_id"]) if project_data.get("department_id") else None,
                institution_id=UUID(project_data["institution_id"]) if project_data.get("institution_id") else None,
                created_at=project_data.get("created_at"),
            )

            # Create PI if provided
            if pi_data:
                await self.create_person(
                    person_id=UUID(pi_data["id"]),
                    name=pi_data.get("name", "Unknown"),
                    email=pi_data.get("email"),
                    role="researcher",
                )
                await self.link_person_to_project(
                    person_id=UUID(pi_data["id"]),
                    project_id=UUID(project_data["id"]),
                    relationship="LED_BY",
                    role_in_project="Principal Investigator",
                )

            # Create documents
            for doc in documents:
                await self.create_document(
                    document_id=UUID(doc["doc_id"]) if "doc_id" in doc else UUID(doc.get("id", str(uuid4()))),
                    project_id=UUID(project_data["id"]),
                    doc_type=doc.get("doc_type", doc.get("type", "unknown")),
                    filename=doc.get("filename"),
                    status=doc.get("status", "uploaded"),
                )

            # Create facts
            from uuid import uuid4
            for fact in facts:
                fact_id = UUID(fact["id"]) if "id" in fact else uuid4()
                await self.create_fact(
                    fact_id=fact_id,
                    project_id=UUID(project_data["id"]),
                    key=fact.get("key", ""),
                    value=fact.get("value"),
                    source=fact.get("source", "unknown"),
                    confidence=fact.get("confidence", 1.0),
                    source_reference=fact.get("source_reference"),
                )

            logger.info("Synced project %s to Neo4j", project_data["id"])
            return True

        except Exception as e:
            logger.error("Failed to sync project to Neo4j: %s", e)
            return False


# Module-level singleton
_graph_service: Optional[GraphService] = None


def get_graph_service() -> GraphService:
    """Get the graph service singleton.

    Returns:
        GraphService instance
    """
    global _graph_service
    if _graph_service is None:
        _graph_service = GraphService()
    return _graph_service


async def init_graph_service() -> GraphService:
    """Initialize and return the graph service.

    Returns:
        Initialized GraphService instance
    """
    service = get_graph_service()
    await service.connect()
    await service.initialize_schema()
    return service
