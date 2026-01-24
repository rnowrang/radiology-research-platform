"""Explainability service for Protocol Assistant.

This module provides human-readable explanations of AI decisions and actions,
enabling users to understand:
- How data was extracted from their documents
- What inputs influenced generated content
- Why certain recommendations were made
- The complete data flow through the system

This supports regulatory compliance requirements for explainability and
transparency in AI-assisted decision making.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.provenance import ProvenanceChain
from app.models.audit import ProvenanceNode

logger = logging.getLogger(__name__)


class FieldExplanation(BaseModel):
    """Explanation for a single extracted or generated field."""

    field: str = Field(..., description="Field name")
    value: str = Field(..., description="Field value (may be truncated)")
    confidence: float = Field(
        ..., description="Confidence score (0.0 to 1.0)", ge=0.0, le=1.0
    )
    evidence: str = Field(..., description="Source text or reasoning for this value")
    source_location: Optional[str] = Field(
        None, description="Location in source document"
    )
    ai_generated: bool = Field(
        default=True, description="Whether this was AI-generated"
    )
    user_modified: bool = Field(
        default=False, description="Whether user has modified this"
    )


class ExtractionExplanation(BaseModel):
    """Explanation of how protocol data was extracted from a document."""

    summary: str = Field(..., description="High-level summary of the extraction")
    source_document: str = Field(..., description="Source document identifier")
    source_document_type: Optional[str] = Field(
        None, description="Type of source document"
    )
    model_used: str = Field(..., description="AI model used for extraction")
    prompt_version: Optional[str] = Field(None, description="Extraction prompt version")
    extraction_timestamp: str = Field(..., description="When extraction occurred")
    extracted_fields: list[FieldExplanation] = Field(
        ..., description="Explanations for each extracted field"
    )
    total_fields: int = Field(..., description="Total number of fields extracted")
    high_confidence_count: int = Field(
        ..., description="Fields with confidence >= 0.8"
    )
    low_confidence_count: int = Field(
        ..., description="Fields with confidence < 0.6"
    )
    low_confidence_warnings: list[str] = Field(
        default_factory=list, description="Warnings about low confidence extractions"
    )


class GenerationExplanation(BaseModel):
    """Explanation of how a document or response was generated."""

    summary: str = Field(..., description="High-level summary of the generation")
    inputs_used: list[str] = Field(
        ..., description="List of inputs that influenced generation"
    )
    input_types: dict[str, int] = Field(
        ..., description="Count of inputs by type"
    )
    template_version: str = Field(..., description="Generation template/prompt version")
    model_used: str = Field(..., description="AI model used for generation")
    generation_timestamp: str = Field(..., description="When generation occurred")
    generation_parameters: dict[str, Any] = Field(
        ..., description="Parameters used for generation"
    )
    confidence_level: str = Field(
        ..., description="Overall confidence: high, medium, low"
    )
    recommendations: list[str] = Field(
        default_factory=list, description="Recommendations for the user"
    )
    caveats: list[str] = Field(
        default_factory=list, description="Important caveats about the generated content"
    )


class DataFlowNode(BaseModel):
    """A node in the data flow visualization."""

    id: str
    type: str
    actor: str
    actor_type: str
    timestamp: Optional[str]
    description: str
    children: list[str] = Field(default_factory=list)
    metadata: Optional[dict[str, Any]] = None


class DataFlowExplanation(BaseModel):
    """Complete data flow explanation for a session."""

    session_id: str
    total_steps: int
    ai_contribution_percentage: float
    human_contribution_percentage: float
    data_flow: list[DataFlowNode]
    summary: str


class ExplainabilityService:
    """
    Generates human-readable explanations of AI decisions and data flow.

    This service provides transparency into:
    - How AI extracted information from documents
    - What influenced AI-generated content
    - The complete provenance chain
    - AI vs human contributions
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize the explainability service.

        Args:
            db: Async database session
        """
        self.db = db
        self.provenance = ProvenanceChain(db)

    async def explain_extraction(
        self,
        extraction_id: UUID,
        include_evidence: bool = True,
    ) -> ExtractionExplanation:
        """
        Explain why certain fields were extracted a certain way.

        Provides a detailed breakdown of the extraction process including:
        - Source document information
        - AI model and prompt used
        - Per-field confidence and evidence
        - Warnings about low-confidence extractions

        Args:
            extraction_id: UUID of the extraction provenance node
            include_evidence: Whether to include source evidence

        Returns:
            ExtractionExplanation with full details

        Raises:
            ValueError: If extraction node not found
        """
        node = await self.db.get(ProvenanceNode, extraction_id)
        if not node:
            raise ValueError(f"Extraction node {extraction_id} not found")

        if node.type != "extraction":
            raise ValueError(f"Node {extraction_id} is not an extraction (type: {node.type})")

        # Get lineage to find source document
        lineage = await self.provenance.get_lineage(extraction_id)
        source_doc = next(
            (n for n in lineage if n["type"] == "input"),
            None
        )

        # Get confidence scores from metadata
        confidence_scores = node.node_metadata.get("confidence_scores", {}) if node.node_metadata else {}
        extracted_fields_list = node.node_metadata.get("extracted_fields", []) if node.node_metadata else []

        # Build field explanations
        field_explanations = []
        for field_name in extracted_fields_list:
            confidence = confidence_scores.get(field_name, 0.7)  # Default confidence
            field_explanations.append(
                FieldExplanation(
                    field=field_name,
                    value="[See extracted data]",  # Actual values would come from session
                    confidence=confidence,
                    evidence=f"Extracted from source document using AI analysis" if include_evidence else "",
                    ai_generated=True,
                    user_modified=False,
                )
            )

        # Count confidence levels
        high_confidence = sum(1 for fe in field_explanations if fe.confidence >= 0.8)
        low_confidence = sum(1 for fe in field_explanations if fe.confidence < 0.6)

        # Generate warnings
        warnings = []
        for fe in field_explanations:
            if fe.confidence < 0.6:
                warnings.append(
                    f"Field '{fe.field}' has low confidence ({fe.confidence:.0%}). "
                    f"Please review and verify this value."
                )

        return ExtractionExplanation(
            summary=(
                f"The AI analyzed your uploaded protocol document and extracted "
                f"{len(field_explanations)} key fields. "
                f"{high_confidence} fields have high confidence, "
                f"{low_confidence} fields need your review."
            ),
            source_document=str(source_doc["id"]) if source_doc else "Unknown",
            source_document_type=source_doc.get("metadata", {}).get("source_type") if source_doc else None,
            model_used=node.llm_model or node.node_metadata.get("model", "Unknown") if node.node_metadata else "Unknown",
            prompt_version=node.node_metadata.get("prompt_version") if node.node_metadata else None,
            extraction_timestamp=node.node_metadata.get("timestamp", "") if node.node_metadata else "",
            extracted_fields=field_explanations,
            total_fields=len(field_explanations),
            high_confidence_count=high_confidence,
            low_confidence_count=low_confidence,
            low_confidence_warnings=warnings,
        )

    async def explain_generation(
        self,
        generation_id: UUID,
    ) -> GenerationExplanation:
        """
        Explain how a document or response was generated.

        Provides transparency into:
        - What inputs influenced the generation
        - The AI model and parameters used
        - Confidence level and recommendations

        Args:
            generation_id: UUID of the generation provenance node

        Returns:
            GenerationExplanation with full details

        Raises:
            ValueError: If generation node not found
        """
        node = await self.db.get(ProvenanceNode, generation_id)
        if not node:
            raise ValueError(f"Generation node {generation_id} not found")

        if node.type != "generation":
            raise ValueError(f"Node {generation_id} is not a generation (type: {node.type})")

        # Get full lineage to understand inputs
        lineage = await self.provenance.get_lineage(generation_id)

        # Categorize inputs
        input_types = {}
        inputs_used = []
        for ancestor in lineage:
            if ancestor["id"] != str(generation_id):
                ancestor_type = ancestor["type"]
                input_types[ancestor_type] = input_types.get(ancestor_type, 0) + 1

                # Create readable descriptions
                if ancestor_type == "input":
                    inputs_used.append(
                        f"Original {ancestor.get('metadata', {}).get('source_type', 'document')}"
                    )
                elif ancestor_type == "extraction":
                    inputs_used.append("AI-extracted protocol data")
                elif ancestor_type == "edit":
                    inputs_used.append(
                        f"User edits to {len(ancestor.get('metadata', {}).get('fields_modified', []))} fields"
                    )

        # Determine confidence level
        gen_params = node.node_metadata.get("generation_params", {}) if node.node_metadata else {}
        temperature = gen_params.get("temperature", 0.3)
        confidence_level = "high" if temperature <= 0.3 else "medium" if temperature <= 0.7 else "low"

        # Build recommendations
        recommendations = []
        if confidence_level != "high":
            recommendations.append(
                "Review generated content carefully as it was produced with higher creativity settings."
            )

        has_user_edits = any(a["type"] == "edit" for a in lineage)
        if has_user_edits:
            recommendations.append(
                "Content incorporates your edits and corrections."
            )
        else:
            recommendations.append(
                "Consider reviewing and editing the generated content to ensure accuracy."
            )

        # Build caveats
        caveats = [
            "AI-generated content should be reviewed by a qualified professional.",
            "The generated content is based on the information provided and may not cover all requirements.",
        ]

        return GenerationExplanation(
            summary=(
                f"This content was generated based on your protocol document "
                f"and {'your responses to clarifying questions' if has_user_edits else 'extracted protocol data'}."
            ),
            inputs_used=inputs_used or ["No inputs recorded"],
            input_types=input_types,
            template_version=node.node_metadata.get("prompt_version", "Unknown") if node.node_metadata else "Unknown",
            model_used=node.llm_model or "Unknown",
            generation_timestamp=node.node_metadata.get("timestamp", "") if node.node_metadata else "",
            generation_parameters=gen_params,
            confidence_level=confidence_level,
            recommendations=recommendations,
            caveats=caveats,
        )

    async def get_data_flow(
        self, session_id: UUID
    ) -> DataFlowExplanation:
        """
        Get complete data flow explanation for a session.

        Creates a visualization-ready representation of how data
        flowed through the system during the session.

        Args:
            session_id: UUID of the session

        Returns:
            DataFlowExplanation with complete flow
        """
        # Get all nodes for this session
        nodes = await self.provenance.get_session_provenance(session_id)

        # Get contribution percentages
        contributions = await self.provenance.get_ai_contribution_percentage(session_id)

        # Build parent-child relationships
        node_children: dict[str, list[str]] = {}
        for node in nodes:
            for parent_id in node.get("parent_ids", []):
                if parent_id not in node_children:
                    node_children[parent_id] = []
                node_children[parent_id].append(node["id"])

        # Build data flow nodes
        flow_nodes = []
        for n in nodes:
            flow_nodes.append(
                DataFlowNode(
                    id=n["id"],
                    type=n["type"],
                    actor=n["actor"],
                    actor_type=n.get("actor_type", "system"),
                    timestamp=n.get("timestamp"),
                    description=self._describe_node_for_user(n),
                    children=node_children.get(n["id"], []),
                    metadata=n.get("metadata"),
                )
            )

        # Generate summary
        type_counts = contributions.get("by_type", {})
        summary_parts = []
        if type_counts.get("input", 0) > 0:
            summary_parts.append(f"{type_counts['input']} document(s) uploaded")
        if type_counts.get("extraction", 0) > 0:
            summary_parts.append(f"{type_counts['extraction']} AI extraction(s)")
        if type_counts.get("generation", 0) > 0:
            summary_parts.append(f"{type_counts['generation']} content generation(s)")
        if type_counts.get("edit", 0) > 0:
            summary_parts.append(f"{type_counts['edit']} user edit(s)")

        summary = "Session flow: " + ", ".join(summary_parts) if summary_parts else "No data flow recorded"

        return DataFlowExplanation(
            session_id=str(session_id),
            total_steps=len(nodes),
            ai_contribution_percentage=contributions.get("ai_percentage", 0),
            human_contribution_percentage=contributions.get("human_percentage", 0),
            data_flow=flow_nodes,
            summary=summary,
        )

    async def explain_field(
        self,
        session_id: UUID,
        field_name: str,
    ) -> dict[str, Any]:
        """
        Explain the provenance of a specific field value.

        Traces back through the provenance chain to show where
        a field value came from and any modifications.

        Args:
            session_id: UUID of the session
            field_name: Name of the field to explain

        Returns:
            Dictionary with field provenance details
        """
        nodes = await self.provenance.get_session_provenance(session_id)

        # Find nodes that mention this field
        relevant_nodes = []
        for node in nodes:
            metadata = node.get("metadata", {})
            if field_name in metadata.get("extracted_fields", []):
                relevant_nodes.append(node)
            if field_name in metadata.get("fields_modified", []):
                relevant_nodes.append(node)

        if not relevant_nodes:
            return {
                "field": field_name,
                "found": False,
                "message": f"No provenance found for field '{field_name}'",
            }

        # Build provenance chain for the field
        provenance_chain = []
        for node in relevant_nodes:
            entry = {
                "step": len(provenance_chain) + 1,
                "type": node["type"],
                "actor": node["actor"],
                "timestamp": node.get("timestamp"),
                "action": self._describe_field_action(node, field_name),
            }
            provenance_chain.append(entry)

        # Determine current state
        last_node = relevant_nodes[-1]
        is_ai_value = last_node["type"] in ["extraction", "generation"]
        is_user_modified = any(n["type"] == "edit" for n in relevant_nodes)

        return {
            "field": field_name,
            "found": True,
            "is_ai_generated": is_ai_value,
            "is_user_modified": is_user_modified,
            "provenance_chain": provenance_chain,
            "summary": (
                f"Field '{field_name}' was "
                f"{'AI-extracted' if is_ai_value else 'generated'}"
                f"{' and modified by user' if is_user_modified else ''}"
            ),
        }

    def _describe_node_for_user(self, node: dict[str, Any]) -> str:
        """
        Create a user-friendly description of a provenance node.

        Args:
            node: Provenance node dictionary

        Returns:
            Human-readable description
        """
        node_type = node.get("type", "unknown")
        metadata = node.get("metadata", {})
        custom_desc = node.get("description")

        if custom_desc:
            return custom_desc

        descriptions = {
            "input": f"Document uploaded ({metadata.get('source_type', 'document')})",
            "extraction": f"Protocol data extracted using {metadata.get('model', 'AI')}",
            "generation": f"Content generated using {metadata.get('model', 'AI')}",
            "edit": f"User modified {len(metadata.get('fields_modified', []))} field(s)",
            "approval": f"Content {metadata.get('approval_type', 'reviewed')}",
            "review": "Content reviewed",
        }

        return descriptions.get(node_type, f"Unknown action ({node_type})")

    def _describe_field_action(
        self, node: dict[str, Any], field_name: str
    ) -> str:
        """
        Describe what happened to a specific field at a provenance node.

        Args:
            node: Provenance node dictionary
            field_name: Name of the field

        Returns:
            Description of the field action
        """
        node_type = node.get("type", "unknown")

        if node_type == "extraction":
            return f"Field '{field_name}' extracted from source document"
        elif node_type == "generation":
            return f"Field '{field_name}' generated by AI"
        elif node_type == "edit":
            return f"Field '{field_name}' modified by user"
        elif node_type == "approval":
            return f"Field '{field_name}' approved"
        else:
            return f"Field '{field_name}' processed"
