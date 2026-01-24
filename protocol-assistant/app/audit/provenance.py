"""Provenance chain tracking for Protocol Assistant.

This module provides complete lineage tracking for AI-generated content,
creating an audit trail that shows how data flows through the system from
input documents through extraction, generation, and editing.

Provenance Node Types:
- input: Original data entering the system (documents, user input)
- extraction: AI-extracted information from documents
- generation: AI-generated content
- edit: User modifications to AI-generated content
- approval: User approval or sign-off
- review: Review actions

This enables:
- Full data lineage from source to output
- Attribution of AI vs human contributions
- Audit trail for regulatory compliance
- Explainability of AI decisions
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import ProvenanceNode

logger = logging.getLogger(__name__)


class ProvenanceChain:
    """
    Tracks complete lineage of AI-generated content.

    Creates an immutable chain of provenance nodes that record every
    transformation of data through the system.
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize provenance chain tracker.

        Args:
            db: Async database session
        """
        self.db = db

    async def record_input(
        self,
        session_id: UUID,
        source_type: str,
        data: dict[str, Any],
        actor: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        project_id: Optional[UUID] = None,
        description: Optional[str] = None,
    ) -> UUID:
        """
        Record an input to the provenance chain.

        This creates the root nodes of the provenance chain, representing
        original data entering the system.

        Args:
            session_id: UUID of the chat session
            source_type: Type of source (document, user_input, api_call)
            data: Data being recorded (will be hashed, not stored)
            actor: User ID or system identifier
            resource_type: Type of resource (document, message, etc.)
            resource_id: External ID of the resource
            project_id: Optional project UUID
            description: Human-readable description

        Returns:
            UUID of the created provenance node
        """
        node = ProvenanceNode(
            id=uuid4(),
            session_id=session_id,
            project_id=project_id,
            type="input",
            actor=actor,
            actor_type="user" if actor != "system" else "system",
            resource_type=resource_type,
            resource_id=resource_id,
            data_hash=self._hash_data(data),
            parent_ids=[],
            depth=0,
            metadata={
                "source_type": source_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data_keys": list(data.keys()) if isinstance(data, dict) else None,
            },
            action="upload" if source_type == "document" else "input",
            description=description or f"Input from {source_type}",
        )

        self.db.add(node)
        await self.db.commit()
        await self.db.refresh(node)

        logger.debug(f"Recorded input node: {node.id} type={source_type}")

        return node.id

    async def record_extraction(
        self,
        session_id: UUID,
        source_document_id: UUID,
        extracted_data: dict[str, Any],
        model_used: str,
        prompt_version: str,
        confidence_scores: Optional[dict[str, float]] = None,
        project_id: Optional[UUID] = None,
        description: Optional[str] = None,
    ) -> UUID:
        """
        Record AI extraction with full provenance.

        This records when the AI extracts information from a source document,
        linking the extraction to its parent input.

        Args:
            session_id: UUID of the chat session
            source_document_id: UUID of the source provenance node
            extracted_data: Data that was extracted (will be hashed)
            model_used: LLM model identifier (e.g., "claude-3-opus")
            prompt_version: Version/identifier of the extraction prompt
            confidence_scores: Optional confidence scores per field
            project_id: Optional project UUID
            description: Human-readable description

        Returns:
            UUID of the created provenance node
        """
        # Get parent depth
        parent = await self.db.get(ProvenanceNode, source_document_id)
        parent_depth = parent.depth if parent else 0

        node = ProvenanceNode(
            id=uuid4(),
            session_id=session_id,
            project_id=project_id,
            type="extraction",
            actor="system",
            actor_type="llm",
            data_hash=self._hash_data(extracted_data),
            parent_ids=[source_document_id],
            depth=parent_depth + 1,
            llm_provider=model_used.split("-")[0] if "-" in model_used else "unknown",
            llm_model=model_used,
            prompt_version_id=hash(prompt_version) % (10**9),
            metadata={
                "model": model_used,
                "prompt_version": prompt_version,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "extracted_fields": list(extracted_data.keys()) if isinstance(extracted_data, dict) else [],
                "confidence_scores": confidence_scores or {},
            },
            action="extract",
            description=description or f"Protocol extracted using {model_used}",
        )

        self.db.add(node)
        await self.db.commit()
        await self.db.refresh(node)

        logger.debug(f"Recorded extraction node: {node.id} model={model_used}")

        return node.id

    async def record_generation(
        self,
        session_id: UUID,
        parent_ids: list[UUID],
        generated_content: dict[str, Any],
        model_used: str,
        prompt_version: str,
        generation_params: Optional[dict[str, Any]] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        project_id: Optional[UUID] = None,
        description: Optional[str] = None,
    ) -> UUID:
        """
        Record AI generation with inputs that influenced output.

        This records when the AI generates new content, linking it to
        all parent nodes that influenced the generation.

        Args:
            session_id: UUID of the chat session
            parent_ids: List of parent provenance node UUIDs
            generated_content: Content that was generated (will be hashed)
            model_used: LLM model identifier
            prompt_version: Version/identifier of the generation prompt
            generation_params: Optional generation parameters (temperature, etc.)
            resource_type: Type of generated resource
            resource_id: ID of generated resource
            project_id: Optional project UUID
            description: Human-readable description

        Returns:
            UUID of the created provenance node
        """
        # Calculate depth as max parent depth + 1
        max_depth = 0
        for parent_id in parent_ids:
            parent = await self.db.get(ProvenanceNode, parent_id)
            if parent:
                max_depth = max(max_depth, parent.depth)

        node = ProvenanceNode(
            id=uuid4(),
            session_id=session_id,
            project_id=project_id,
            type="generation",
            actor="system",
            actor_type="llm",
            resource_type=resource_type,
            resource_id=resource_id,
            data_hash=self._hash_data(generated_content),
            parent_ids=parent_ids,
            depth=max_depth + 1,
            llm_provider=model_used.split("-")[0] if "-" in model_used else "unknown",
            llm_model=model_used,
            prompt_version_id=hash(prompt_version) % (10**9),
            metadata={
                "model": model_used,
                "prompt_version": prompt_version,
                "generation_params": generation_params or {},
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "content_type": resource_type,
            },
            action="generate",
            description=description or f"Content generated using {model_used}",
        )

        self.db.add(node)
        await self.db.commit()
        await self.db.refresh(node)

        logger.debug(
            f"Recorded generation node: {node.id} model={model_used} "
            f"parents={len(parent_ids)}"
        )

        return node.id

    async def record_user_edit(
        self,
        session_id: UUID,
        parent_id: UUID,
        user_id: UUID,
        field_changes: dict[str, Any],
        edit_reason: Optional[str] = None,
        project_id: Optional[UUID] = None,
        description: Optional[str] = None,
    ) -> UUID:
        """
        Record user modifications to AI-generated content.

        This records when a user edits AI-generated content, maintaining
        the distinction between AI and human contributions.

        Args:
            session_id: UUID of the chat session
            parent_id: UUID of the parent provenance node being edited
            user_id: UUID of the user making the edit
            field_changes: Dictionary of field changes (old/new values)
            edit_reason: Optional reason for the edit
            project_id: Optional project UUID
            description: Human-readable description

        Returns:
            UUID of the created provenance node
        """
        # Get parent depth
        parent = await self.db.get(ProvenanceNode, parent_id)
        parent_depth = parent.depth if parent else 0

        node = ProvenanceNode(
            id=uuid4(),
            session_id=session_id,
            project_id=project_id,
            type="edit",
            actor=str(user_id),
            actor_type="user",
            data_hash=self._hash_data(field_changes),
            parent_ids=[parent_id],
            depth=parent_depth + 1,
            metadata={
                "fields_modified": list(field_changes.keys()),
                "modification_type": "user_override",
                "edit_reason": edit_reason,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            action="edit",
            description=description or f"User edited {len(field_changes)} field(s)",
        )

        self.db.add(node)
        await self.db.commit()
        await self.db.refresh(node)

        logger.debug(
            f"Recorded edit node: {node.id} user={user_id} "
            f"fields={list(field_changes.keys())}"
        )

        return node.id

    async def record_approval(
        self,
        session_id: UUID,
        parent_id: UUID,
        user_id: UUID,
        approval_type: str,
        comment: Optional[str] = None,
        project_id: Optional[UUID] = None,
    ) -> UUID:
        """
        Record user approval of content.

        Args:
            session_id: UUID of the chat session
            parent_id: UUID of the content being approved
            user_id: UUID of the approving user
            approval_type: Type of approval (review, approve, reject)
            comment: Optional approval comment
            project_id: Optional project UUID

        Returns:
            UUID of the created provenance node
        """
        parent = await self.db.get(ProvenanceNode, parent_id)
        parent_depth = parent.depth if parent else 0

        node = ProvenanceNode(
            id=uuid4(),
            session_id=session_id,
            project_id=project_id,
            type="approval",
            actor=str(user_id),
            actor_type="user",
            data_hash=self._hash_data({"approval_type": approval_type, "comment": comment}),
            parent_ids=[parent_id],
            depth=parent_depth + 1,
            metadata={
                "approval_type": approval_type,
                "comment": comment,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
            action=approval_type,
            description=f"Content {approval_type}d by user",
        )

        self.db.add(node)
        await self.db.commit()
        await self.db.refresh(node)

        logger.debug(f"Recorded approval node: {node.id} type={approval_type}")

        return node.id

    async def get_lineage(self, node_id: UUID) -> list[dict[str, Any]]:
        """
        Get full lineage of a node back to original inputs.

        Traverses the provenance chain from the given node back through
        all ancestors to the root input nodes.

        Args:
            node_id: UUID of the node to trace

        Returns:
            List of node information dictionaries, ordered from root to given node
        """
        lineage = []
        visited = set()

        async def traverse(current_id: UUID) -> None:
            if current_id in visited:
                return
            visited.add(current_id)

            node = await self.db.get(ProvenanceNode, current_id)
            if node:
                # First traverse parents (to build lineage in order)
                for parent_id in node.parent_ids or []:
                    await traverse(parent_id)

                lineage.append({
                    "id": str(node.id),
                    "type": node.type,
                    "actor": node.actor,
                    "actor_type": node.actor_type,
                    "depth": node.depth,
                    "timestamp": node.node_metadata.get("timestamp") if node.node_metadata else None,
                    "metadata": node.node_metadata,
                    "action": node.action,
                    "description": node.description,
                    "llm_model": node.llm_model,
                })

        await traverse(node_id)
        return lineage

    async def get_descendants(self, node_id: UUID) -> list[dict[str, Any]]:
        """
        Get all descendants of a node.

        Finds all nodes that have this node in their ancestry.

        Args:
            node_id: UUID of the ancestor node

        Returns:
            List of descendant node information
        """
        # Query nodes that have this node_id in their parent_ids array
        result = await self.db.execute(
            select(ProvenanceNode).where(
                ProvenanceNode.parent_ids.any(node_id)
            )
        )
        nodes = result.scalars().all()

        descendants = []
        for node in nodes:
            descendants.append({
                "id": str(node.id),
                "type": node.type,
                "actor": node.actor,
                "depth": node.depth,
                "timestamp": node.node_metadata.get("timestamp") if node.node_metadata else None,
                "description": node.description,
            })
            # Recursively get descendants
            child_descendants = await self.get_descendants(node.id)
            descendants.extend(child_descendants)

        return descendants

    async def get_session_provenance(
        self, session_id: UUID
    ) -> list[dict[str, Any]]:
        """
        Get all provenance nodes for a session.

        Args:
            session_id: UUID of the session

        Returns:
            List of provenance nodes ordered by creation time
        """
        result = await self.db.execute(
            select(ProvenanceNode)
            .where(ProvenanceNode.session_id == session_id)
            .order_by(ProvenanceNode.created_at)
        )
        nodes = result.scalars().all()

        return [
            {
                "id": str(n.id),
                "type": n.type,
                "actor": n.actor,
                "actor_type": n.actor_type,
                "depth": n.depth,
                "parent_ids": [str(p) for p in (n.parent_ids or [])],
                "timestamp": n.node_metadata.get("timestamp") if n.node_metadata else None,
                "metadata": n.node_metadata,
                "action": n.action,
                "description": n.description,
            }
            for n in nodes
        ]

    async def get_ai_contribution_percentage(
        self, session_id: UUID
    ) -> dict[str, Any]:
        """
        Calculate the percentage of content from AI vs human contributors.

        Args:
            session_id: UUID of the session

        Returns:
            Dictionary with contribution statistics
        """
        result = await self.db.execute(
            select(ProvenanceNode).where(ProvenanceNode.session_id == session_id)
        )
        nodes = result.scalars().all()

        total = len(nodes)
        if total == 0:
            return {"ai_percentage": 0, "human_percentage": 0, "total_nodes": 0}

        ai_nodes = sum(1 for n in nodes if n.actor_type == "llm")
        human_nodes = sum(1 for n in nodes if n.actor_type == "user")
        system_nodes = sum(1 for n in nodes if n.actor_type == "system" and n.actor != "system")

        return {
            "ai_percentage": round(ai_nodes / total * 100, 1),
            "human_percentage": round(human_nodes / total * 100, 1),
            "system_percentage": round((total - ai_nodes - human_nodes) / total * 100, 1),
            "total_nodes": total,
            "ai_nodes": ai_nodes,
            "human_nodes": human_nodes,
            "by_type": {
                "input": sum(1 for n in nodes if n.type == "input"),
                "extraction": sum(1 for n in nodes if n.type == "extraction"),
                "generation": sum(1 for n in nodes if n.type == "generation"),
                "edit": sum(1 for n in nodes if n.type == "edit"),
                "approval": sum(1 for n in nodes if n.type == "approval"),
            },
        }

    def _hash_data(self, data: dict[str, Any]) -> str:
        """
        Compute SHA-256 hash of data.

        The actual data is not stored - only the hash for integrity verification.

        Args:
            data: Dictionary to hash

        Returns:
            Hex-encoded SHA-256 hash
        """
        serialized = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(serialized.encode()).hexdigest()
