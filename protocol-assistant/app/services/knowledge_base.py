"""Knowledge Base Service for project-level intelligent form filling.

This service manages the project knowledge base which stores:
- Structured protocol data (UniversalProtocol schema)
- Flexible facts extracted from documents and wizard answers
- Document metadata and references
- Wizard answer history

The knowledge base serves as the single source of truth for form filling.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import select, update, delete, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.knowledge import (
    Fact,
    FactSource,
    DocumentInfo,
    EmbeddingMatch,
    ProjectKnowledgeBaseResponse,
    UniversalProtocol,
    ContentType,
)

logger = logging.getLogger(__name__)


class KnowledgeBaseService:
    """Service for managing project knowledge bases.

    Provides CRUD operations for:
    - Project knowledge base records
    - Protocol data (structured)
    - Facts (flexible key-value with source tracking)
    - Document references
    - Wizard answers

    Also provides semantic search via integration with EmbeddingsService.
    """

    def __init__(self, db: AsyncSession):
        """Initialize the knowledge base service.

        Args:
            db: Async database session
        """
        self.db = db

    async def get_or_create(self, project_id: UUID) -> Dict[str, Any]:
        """Get or create a knowledge base for a project.

        Args:
            project_id: UUID of the project

        Returns:
            Knowledge base record dict with id, project_id, etc.
        """
        # Try to find existing
        result = await self.db.execute(
            text("""
                SELECT id, project_id, protocol_data, facts, documents,
                       wizard_answers, questionnaire_complete, completion_percentage,
                       created_at, updated_at
                FROM project_knowledge_base
                WHERE project_id = :project_id
            """),
            {"project_id": str(project_id)}
        )
        row = result.fetchone()

        if row:
            return {
                "id": row.id,
                "project_id": row.project_id,
                "protocol_data": row.protocol_data or {},
                "facts": row.facts or [],
                "documents": row.documents or [],
                "wizard_answers": row.wizard_answers or {},
                "questionnaire_complete": row.questionnaire_complete,
                "completion_percentage": float(row.completion_percentage or 0),
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }

        # Create new
        kb_id = uuid4()
        await self.db.execute(
            text("""
                INSERT INTO project_knowledge_base
                    (id, project_id, protocol_data, facts, documents,
                     wizard_answers, questionnaire_complete, completion_percentage)
                VALUES
                    (:id, :project_id, :protocol_data, :facts, :documents,
                     :wizard_answers, :questionnaire_complete, :completion_percentage)
            """),
            {
                "id": str(kb_id),
                "project_id": str(project_id),
                "protocol_data": "{}",
                "facts": "[]",
                "documents": "[]",
                "wizard_answers": "{}",
                "questionnaire_complete": False,
                "completion_percentage": 0.0,
            }
        )
        await self.db.commit()

        return {
            "id": kb_id,
            "project_id": project_id,
            "protocol_data": {},
            "facts": [],
            "documents": [],
            "wizard_answers": {},
            "questionnaire_complete": False,
            "completion_percentage": 0.0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

    async def get_by_id(self, kb_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a knowledge base by its ID.

        Args:
            kb_id: UUID of the knowledge base

        Returns:
            Knowledge base record dict or None if not found
        """
        result = await self.db.execute(
            text("""
                SELECT id, project_id, protocol_data, facts, documents,
                       wizard_answers, questionnaire_complete, completion_percentage,
                       created_at, updated_at
                FROM project_knowledge_base
                WHERE id = :id
            """),
            {"id": str(kb_id)}
        )
        row = result.fetchone()

        if not row:
            return None

        return {
            "id": row.id,
            "project_id": row.project_id,
            "protocol_data": row.protocol_data or {},
            "facts": row.facts or [],
            "documents": row.documents or [],
            "wizard_answers": row.wizard_answers or {},
            "questionnaire_complete": row.questionnaire_complete,
            "completion_percentage": float(row.completion_percentage or 0),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    async def get_by_project(self, project_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a knowledge base by project ID.

        Args:
            project_id: UUID of the project

        Returns:
            Knowledge base record dict or None if not found
        """
        result = await self.db.execute(
            text("""
                SELECT id, project_id, protocol_data, facts, documents,
                       wizard_answers, questionnaire_complete, completion_percentage,
                       created_at, updated_at
                FROM project_knowledge_base
                WHERE project_id = :project_id
            """),
            {"project_id": str(project_id)}
        )
        row = result.fetchone()

        if not row:
            return None

        return {
            "id": row.id,
            "project_id": row.project_id,
            "protocol_data": row.protocol_data or {},
            "facts": row.facts or [],
            "documents": row.documents or [],
            "wizard_answers": row.wizard_answers or {},
            "questionnaire_complete": row.questionnaire_complete,
            "completion_percentage": float(row.completion_percentage or 0),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    async def update_protocol_data(
        self,
        kb_id: UUID,
        data: Dict[str, Any],
        merge: bool = True
    ) -> Dict[str, Any]:
        """Update structured protocol data.

        Args:
            kb_id: Knowledge base UUID
            data: Protocol data to set/merge
            merge: If True, merge with existing; if False, replace

        Returns:
            Updated protocol data
        """
        if merge:
            # Get current and merge
            kb = await self.get_by_id(kb_id)
            if kb:
                current = kb.get("protocol_data", {})
                current.update(data)
                data = current

        await self.db.execute(
            text("""
                UPDATE project_knowledge_base
                SET protocol_data = :data,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"id": str(kb_id), "data": _to_json(data)}
        )
        await self.db.commit()

        return data

    async def add_fact(
        self,
        kb_id: UUID,
        key: str,
        value: Any,
        source: FactSource,
        confidence: float = 1.0,
        source_reference: Optional[str] = None
    ) -> Fact:
        """Add or update a fact in the knowledge base.

        If a fact with the same key exists, it will be replaced if the new
        confidence is higher or equal.

        Args:
            kb_id: Knowledge base UUID
            key: Fact key (e.g., 'study_title', 'pi.email')
            value: Fact value
            source: Source of the fact
            confidence: Confidence score (0-1)
            source_reference: Optional reference string

        Returns:
            The added/updated Fact
        """
        fact = Fact(
            key=key,
            value=value,
            source=source,
            confidence=confidence,
            extracted_at=datetime.utcnow(),
            source_reference=source_reference,
        )

        # Get current facts
        kb = await self.get_by_id(kb_id)
        if not kb:
            raise ValueError(f"Knowledge base {kb_id} not found")

        facts = kb.get("facts", [])

        # Check if fact with same key exists
        existing_idx = None
        for i, f in enumerate(facts):
            if f.get("key") == key:
                existing_idx = i
                break

        if existing_idx is not None:
            # Replace if new confidence >= old
            old_conf = facts[existing_idx].get("confidence", 0)
            if confidence >= old_conf:
                facts[existing_idx] = fact.model_dump()
        else:
            facts.append(fact.model_dump())

        # Update database
        await self.db.execute(
            text("""
                UPDATE project_knowledge_base
                SET facts = :facts,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"id": str(kb_id), "facts": _to_json(facts)}
        )
        await self.db.commit()

        return fact

    async def add_facts_batch(
        self,
        kb_id: UUID,
        facts: List[Fact]
    ) -> int:
        """Add multiple facts in batch.

        Args:
            kb_id: Knowledge base UUID
            facts: List of facts to add

        Returns:
            Number of facts added/updated
        """
        for fact in facts:
            await self.add_fact(
                kb_id=kb_id,
                key=fact.key,
                value=fact.value,
                source=fact.source,
                confidence=fact.confidence,
                source_reference=fact.source_reference,
            )
        return len(facts)

    async def get_facts(
        self,
        kb_id: UUID,
        keys: Optional[List[str]] = None
    ) -> List[Fact]:
        """Get facts from the knowledge base.

        Args:
            kb_id: Knowledge base UUID
            keys: Optional list of keys to filter by

        Returns:
            List of Fact objects
        """
        kb = await self.get_by_id(kb_id)
        if not kb:
            return []

        facts_data = kb.get("facts", [])

        # Convert to Fact objects
        facts = []
        for f in facts_data:
            try:
                # Handle source as string or enum
                source = f.get("source", "extracted")
                if isinstance(source, str):
                    try:
                        source = FactSource(source)
                    except ValueError:
                        source = FactSource.EXTRACTED

                facts.append(Fact(
                    key=f.get("key", ""),
                    value=f.get("value"),
                    source=source,
                    confidence=f.get("confidence", 1.0),
                    extracted_at=f.get("extracted_at", datetime.utcnow()),
                    source_reference=f.get("source_reference"),
                ))
            except Exception as e:
                logger.warning(f"Failed to parse fact: {e}")
                continue

        # Filter by keys if specified
        if keys:
            facts = [f for f in facts if f.key in keys]

        return facts

    async def get_fact_value(
        self,
        kb_id: UUID,
        key: str,
        default: Any = None
    ) -> Any:
        """Get a single fact value by key.

        Args:
            kb_id: Knowledge base UUID
            key: Fact key
            default: Default value if not found

        Returns:
            Fact value or default
        """
        facts = await self.get_facts(kb_id, keys=[key])
        if facts:
            return facts[0].value
        return default

    async def delete_fact(self, kb_id: UUID, key: str) -> bool:
        """Delete a fact from the knowledge base.

        Args:
            kb_id: Knowledge base UUID
            key: Fact key to delete

        Returns:
            True if fact was deleted, False if not found
        """
        kb = await self.get_by_id(kb_id)
        if not kb:
            return False

        facts = kb.get("facts", [])
        original_len = len(facts)
        facts = [f for f in facts if f.get("key") != key]

        if len(facts) == original_len:
            return False

        await self.db.execute(
            text("""
                UPDATE project_knowledge_base
                SET facts = :facts,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"id": str(kb_id), "facts": _to_json(facts)}
        )
        await self.db.commit()

        return True

    async def add_document(
        self,
        kb_id: UUID,
        doc_info: DocumentInfo
    ) -> DocumentInfo:
        """Add a document reference to the knowledge base.

        Args:
            kb_id: Knowledge base UUID
            doc_info: Document information

        Returns:
            The added DocumentInfo
        """
        kb = await self.get_by_id(kb_id)
        if not kb:
            raise ValueError(f"Knowledge base {kb_id} not found")

        documents = kb.get("documents", [])

        # Check if document already exists (by doc_id)
        existing_idx = None
        for i, d in enumerate(documents):
            if d.get("doc_id") == str(doc_info.doc_id):
                existing_idx = i
                break

        doc_dict = doc_info.model_dump()
        doc_dict["doc_id"] = str(doc_info.doc_id)
        doc_dict["extracted_at"] = doc_info.extracted_at.isoformat()

        if existing_idx is not None:
            documents[existing_idx] = doc_dict
        else:
            documents.append(doc_dict)

        await self.db.execute(
            text("""
                UPDATE project_knowledge_base
                SET documents = :documents,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"id": str(kb_id), "documents": _to_json(documents)}
        )
        await self.db.commit()

        return doc_info

    async def get_documents(self, kb_id: UUID) -> List[DocumentInfo]:
        """Get all documents in the knowledge base.

        Args:
            kb_id: Knowledge base UUID

        Returns:
            List of DocumentInfo objects
        """
        kb = await self.get_by_id(kb_id)
        if not kb:
            return []

        documents = []
        for d in kb.get("documents", []):
            try:
                documents.append(DocumentInfo(
                    doc_id=UUID(d.get("doc_id")),
                    filename=d.get("filename", ""),
                    doc_type=d.get("doc_type", "unknown"),
                    extracted_at=datetime.fromisoformat(d.get("extracted_at", datetime.utcnow().isoformat())),
                    page_count=d.get("page_count"),
                    extracted_facts_count=d.get("extracted_facts_count"),
                ))
            except Exception as e:
                logger.warning(f"Failed to parse document: {e}")
                continue

        return documents

    async def add_wizard_answer(
        self,
        kb_id: UUID,
        question_id: str,
        answer: Any,
        source: str = "wizard"
    ) -> Dict[str, Any]:
        """Add or update a wizard answer.

        Args:
            kb_id: Knowledge base UUID
            question_id: Question identifier
            answer: The answer value
            source: Source of answer (wizard, ai_suggestion, etc.)

        Returns:
            Updated wizard answers dict
        """
        kb = await self.get_by_id(kb_id)
        if not kb:
            raise ValueError(f"Knowledge base {kb_id} not found")

        wizard_answers = kb.get("wizard_answers", {})
        wizard_answers[question_id] = {
            "answer": answer,
            "source": source,
            "answered_at": datetime.utcnow().isoformat(),
        }

        await self.db.execute(
            text("""
                UPDATE project_knowledge_base
                SET wizard_answers = :answers,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {"id": str(kb_id), "answers": _to_json(wizard_answers)}
        )
        await self.db.commit()

        return wizard_answers

    async def get_wizard_answers(self, kb_id: UUID) -> Dict[str, Any]:
        """Get all wizard answers.

        Args:
            kb_id: Knowledge base UUID

        Returns:
            Dict of question_id -> answer record
        """
        kb = await self.get_by_id(kb_id)
        if not kb:
            return {}
        return kb.get("wizard_answers", {})

    async def update_completion_status(
        self,
        kb_id: UUID,
        questionnaire_complete: bool,
        completion_percentage: float
    ) -> None:
        """Update questionnaire completion status.

        Args:
            kb_id: Knowledge base UUID
            questionnaire_complete: Whether questionnaire is complete
            completion_percentage: Completion percentage (0-100)
        """
        await self.db.execute(
            text("""
                UPDATE project_knowledge_base
                SET questionnaire_complete = :complete,
                    completion_percentage = :percentage,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {
                "id": str(kb_id),
                "complete": questionnaire_complete,
                "percentage": completion_percentage,
            }
        )
        await self.db.commit()

    async def get_completion_status(self, kb_id: UUID) -> Dict[str, Any]:
        """Get questionnaire completion status.

        Args:
            kb_id: Knowledge base UUID

        Returns:
            Dict with questionnaire_complete and completion_percentage
        """
        kb = await self.get_by_id(kb_id)
        if not kb:
            return {"questionnaire_complete": False, "completion_percentage": 0.0}

        return {
            "questionnaire_complete": kb.get("questionnaire_complete", False),
            "completion_percentage": kb.get("completion_percentage", 0.0),
        }

    async def build_universal_protocol(self, kb_id: UUID) -> UniversalProtocol:
        """Build a UniversalProtocol from the knowledge base.

        Combines structured protocol_data with flexible facts.

        Args:
            kb_id: Knowledge base UUID

        Returns:
            UniversalProtocol populated from knowledge base
        """
        kb = await self.get_by_id(kb_id)
        if not kb:
            return UniversalProtocol()

        # Start with protocol_data
        data = kb.get("protocol_data", {})

        # Add facts
        for fact in await self.get_facts(kb_id):
            # Map fact keys to protocol fields using dot notation
            _set_nested_value(data, fact.key, fact.value)

        # Add wizard answers mapped to protocol fields
        for question_id, answer_record in kb.get("wizard_answers", {}).items():
            answer_value = answer_record.get("answer")
            if answer_value is not None:
                # Question IDs should map to protocol field paths
                _set_nested_value(data, question_id, answer_value)

        # Create and validate protocol
        try:
            return UniversalProtocol(**data)
        except Exception as e:
            logger.warning(f"Failed to validate protocol data: {e}")
            return UniversalProtocol(**{k: v for k, v in data.items() if k in UniversalProtocol.model_fields})

    async def delete(self, kb_id: UUID) -> bool:
        """Delete a knowledge base.

        Args:
            kb_id: Knowledge base UUID

        Returns:
            True if deleted, False if not found
        """
        result = await self.db.execute(
            text("DELETE FROM project_knowledge_base WHERE id = :id"),
            {"id": str(kb_id)}
        )
        await self.db.commit()
        return result.rowcount > 0


def _to_json(data: Any) -> str:
    """Convert data to JSON string for database storage."""
    import json
    from datetime import datetime, date
    from decimal import Decimal
    from uuid import UUID

    def serializer(obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, UUID):
            return str(obj)
        if hasattr(obj, "value"):  # Enum
            return obj.value
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    return json.dumps(data, default=serializer)


def _set_nested_value(data: dict, path: str, value: Any) -> None:
    """Set a nested value in a dictionary using dot notation.

    Args:
        data: Dictionary to set value in
        path: Dot-separated path (e.g., 'principal_investigator.email')
        value: Value to set
    """
    parts = path.split(".")
    current = data

    for part in parts[:-1]:
        if part not in current:
            current[part] = {}
        elif not isinstance(current[part], dict):
            # Can't nest into non-dict
            return
        current = current[part]

    current[parts[-1]] = value


# Singleton instance
_kb_service: Optional[KnowledgeBaseService] = None


def get_knowledge_base_service(db: AsyncSession) -> KnowledgeBaseService:
    """Get a KnowledgeBaseService instance.

    Args:
        db: Async database session

    Returns:
        KnowledgeBaseService instance
    """
    return KnowledgeBaseService(db)
