"""Semantic Form Filler - fills any form using semantic matching.

This service fills forms by:
1. Generating embeddings for form field labels/descriptions
2. Matching against knowledge base embeddings
3. Applying learned patterns from corrections
4. Scoring confidence based on match quality
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas.knowledge import (
    FieldFillResult,
    FormFillResult,
    FormFillPreview,
    ConfidenceLevel,
    FactSource,
    ContentType,
    EmbeddingMatch,
)
from app.services.knowledge_base import get_knowledge_base_service
from app.services.embeddings import get_knowledge_embeddings_service
from app.services.confidence_scorer import ConfidenceScorer

logger = logging.getLogger(__name__)


class SemanticFormFiller:
    """Service for filling forms using semantic matching to knowledge base."""

    def __init__(self, db: AsyncSession):
        """Initialize the semantic form filler.

        Args:
            db: Async database session
        """
        self.db = db
        self.settings = get_settings()
        self.confidence_scorer = ConfidenceScorer()

    async def fill_form(
        self,
        project_id: UUID,
        template_schema: Dict[str, Any],
        template_id: int,
        template_name: Optional[str] = None,
        overwrite_existing: bool = False,
        existing_data: Optional[Dict[str, Any]] = None
    ) -> FormFillResult:
        """Fill a form using semantic matching to knowledge base.

        Args:
            project_id: UUID of the project
            template_schema: Form template schema with fields
            template_id: Template ID
            template_name: Optional template name
            overwrite_existing: Whether to overwrite existing values
            existing_data: Optional existing form data

        Returns:
            FormFillResult with filled fields and statistics
        """
        # Get knowledge base
        kb_service = get_knowledge_base_service(self.db)
        kb = await kb_service.get_or_create(project_id)
        kb_id = kb["id"]

        # Get embeddings service
        embeddings_service = get_knowledge_embeddings_service(self.db)

        # Extract fields from template
        fields = self._extract_template_fields(template_schema)

        filled_fields = []
        unfilled_fields = []
        suggested_questions = []

        high_count = 0
        medium_count = 0
        low_count = 0
        needs_review_count = 0

        for field in fields:
            field_id = field.get("id", "")
            field_label = field.get("label", field_id)
            field_type = field.get("type", "text")

            # Check existing data
            existing_value = self._get_existing_value(existing_data, field_id)
            if existing_value and not overwrite_existing:
                # Keep existing value with high confidence
                filled_fields.append(FieldFillResult(
                    field_id=field_id,
                    field_label=field_label,
                    field_type=field_type,
                    value=existing_value,
                    confidence=1.0,
                    confidence_level=ConfidenceLevel.HIGH,
                    source=FactSource.USER_INPUT,
                    evidence="Existing user-provided value",
                ))
                high_count += 1
                continue

            # Build semantic query from field
            query = self._build_field_query(field)

            # Search knowledge base
            try:
                matches = await embeddings_service.search_similar(
                    kb_id=kb_id,
                    query=query,
                    top_k=3,
                    min_score=0.5,
                )
            except Exception as e:
                logger.warning(f"Embedding search failed for {field_id}: {e}")
                matches = []

            # Also check direct facts by field key patterns
            facts = await kb_service.get_facts(kb_id)
            fact_match = self._find_fact_match(field_id, field_label, facts)

            # Also check wizard answers
            wizard_answers = await kb_service.get_wizard_answers(kb_id)
            wizard_match = self._find_wizard_match(field_id, field_label, wizard_answers)

            # Determine best value
            fill_result = await self._determine_best_value(
                field=field,
                embedding_matches=matches,
                fact_match=fact_match,
                wizard_match=wizard_match,
            )

            if fill_result.value is not None:
                filled_fields.append(fill_result)

                # Count by confidence level
                if fill_result.confidence_level == ConfidenceLevel.HIGH:
                    high_count += 1
                elif fill_result.confidence_level == ConfidenceLevel.MEDIUM:
                    medium_count += 1
                else:
                    low_count += 1

                if fill_result.needs_review:
                    needs_review_count += 1
            else:
                unfilled_fields.append(field_id)
                # Suggest question for unfilled field
                suggested_questions.append(f"q_{field_id.replace('.', '_')}")

        # Calculate fill rate
        total_fields = len(fields)
        filled_count = len(filled_fields)
        fill_rate = (filled_count / total_fields * 100) if total_fields > 0 else 0

        return FormFillResult(
            template_id=template_id,
            template_name=template_name,
            filled_fields=filled_fields,
            unfilled_fields=unfilled_fields,
            fill_rate=round(fill_rate, 1),
            high_confidence_count=high_count,
            medium_confidence_count=medium_count,
            low_confidence_count=low_count,
            needs_review_count=needs_review_count,
            suggested_wizard_questions=suggested_questions[:10],  # Limit suggestions
        )

    async def preview_fill(
        self,
        project_id: UUID,
        template_schema: Dict[str, Any],
        template_id: int,
        template_name: Optional[str] = None
    ) -> FormFillPreview:
        """Preview what form filling would produce without applying.

        Args:
            project_id: UUID of the project
            template_schema: Form template schema
            template_id: Template ID
            template_name: Optional template name

        Returns:
            FormFillPreview with all fields and statistics
        """
        result = await self.fill_form(
            project_id=project_id,
            template_schema=template_schema,
            template_id=template_id,
            template_name=template_name,
        )

        # Determine recommendation
        if result.fill_rate >= 80:
            recommendation = "Ready to fill. High coverage from knowledge base."
        elif result.fill_rate >= 50:
            recommendation = "Partial coverage. Consider completing questionnaire first."
        else:
            recommendation = "Low coverage. Complete the questionnaire to improve fill rate."

        return FormFillPreview(
            template_id=result.template_id,
            template_name=result.template_name,
            fields=result.filled_fields,
            fill_rate=result.fill_rate,
            high_confidence_count=result.high_confidence_count,
            medium_confidence_count=result.medium_confidence_count,
            low_confidence_count=result.low_confidence_count,
            recommendation=recommendation,
        )

    async def fill_single_field(
        self,
        project_id: UUID,
        field: Dict[str, Any]
    ) -> FieldFillResult:
        """Fill a single form field.

        Args:
            project_id: UUID of the project
            field: Field definition dict

        Returns:
            FieldFillResult for the field
        """
        kb_service = get_knowledge_base_service(self.db)
        kb = await kb_service.get_or_create(project_id)
        kb_id = kb["id"]

        embeddings_service = get_knowledge_embeddings_service(self.db)

        field_id = field.get("id", "")
        field_label = field.get("label", field_id)

        # Search for matches
        query = self._build_field_query(field)

        try:
            matches = await embeddings_service.search_similar(
                kb_id=kb_id,
                query=query,
                top_k=3,
                min_score=0.5,
            )
        except Exception:
            matches = []

        facts = await kb_service.get_facts(kb_id)
        fact_match = self._find_fact_match(field_id, field_label, facts)

        wizard_answers = await kb_service.get_wizard_answers(kb_id)
        wizard_match = self._find_wizard_match(field_id, field_label, wizard_answers)

        return await self._determine_best_value(
            field=field,
            embedding_matches=matches,
            fact_match=fact_match,
            wizard_match=wizard_match,
        )

    def _extract_template_fields(self, schema: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract all fields from a template schema.

        Args:
            schema: Template schema dict

        Returns:
            List of field definitions
        """
        fields = []

        # Check for sections structure
        for section in schema.get("sections", []):
            for field in section.get("fields", []):
                field["_section"] = section.get("title", "")
                fields.append(field)

        # Also check flat fields
        for field in schema.get("fields", []):
            fields.append(field)

        return fields

    def _build_field_query(self, field: Dict[str, Any]) -> str:
        """Build semantic query from field metadata.

        Args:
            field: Field definition dict

        Returns:
            Query string for semantic search
        """
        parts = []

        field_id = field.get("id", "")
        label = field.get("label", "")
        description = field.get("description", "")
        help_text = field.get("help_text", "")
        section = field.get("_section", "")

        if label:
            parts.append(label)
        if description:
            parts.append(description)
        if help_text:
            parts.append(help_text)
        if section:
            parts.append(f"Section: {section}")

        # Add field type context for better matching
        field_type = field.get("type", "text")
        if field_type == "radio" or field_type == "select":
            options = field.get("options", [])
            if options:
                option_labels = [o.get("label", o) if isinstance(o, dict) else str(o) for o in options[:5]]
                parts.append(f"Options: {', '.join(option_labels)}")

        # Add field ID context (often contains meaningful info)
        if field_id:
            readable_id = field_id.replace(".", " ").replace("_", " ")
            parts.append(readable_id)

        return " | ".join(parts)

    def _get_existing_value(
        self,
        existing_data: Optional[Dict[str, Any]],
        field_id: str
    ) -> Optional[Any]:
        """Get existing value from form data.

        Args:
            existing_data: Existing form data dict
            field_id: Field ID to look up

        Returns:
            Existing value or None
        """
        if not existing_data:
            return None

        # Try direct lookup
        if field_id in existing_data:
            return existing_data[field_id]

        # Try nested lookup
        parts = field_id.split(".")
        current = existing_data
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None
        return current

    def _find_fact_match(
        self,
        field_id: str,
        field_label: str,
        facts: List[Any]
    ) -> Optional[Tuple[Any, float]]:
        """Find matching fact for a field.

        Args:
            field_id: Field ID
            field_label: Field label
            facts: List of Fact objects

        Returns:
            Tuple of (value, confidence) or None
        """
        # Normalize field identifiers for matching
        field_id_normalized = field_id.lower().replace(".", "_").replace("-", "_")
        field_label_normalized = field_label.lower().replace(" ", "_")

        for fact in facts:
            fact_key = fact.key.lower().replace(".", "_").replace("-", "_")

            # Direct key match
            if fact_key == field_id_normalized:
                return (fact.value, fact.confidence)

            # Label-based match
            if fact_key == field_label_normalized:
                return (fact.value, fact.confidence)

            # Partial match (fact key contains field key or vice versa)
            if field_id_normalized in fact_key or fact_key in field_id_normalized:
                return (fact.value, fact.confidence * 0.8)  # Lower confidence for partial

        return None

    def _find_wizard_match(
        self,
        field_id: str,
        field_label: str,
        wizard_answers: Dict[str, Any]
    ) -> Optional[Tuple[Any, float]]:
        """Find matching wizard answer for a field.

        Args:
            field_id: Field ID
            field_label: Field label
            wizard_answers: Wizard answers dict

        Returns:
            Tuple of (value, confidence) or None
        """
        field_id_normalized = field_id.lower().replace(".", "_")

        for question_id, answer_record in wizard_answers.items():
            if question_id.startswith("_"):
                continue  # Skip metadata keys

            question_id_normalized = question_id.lower().replace(".", "_")

            # Direct match
            if question_id_normalized == field_id_normalized:
                return (answer_record.get("answer"), 0.95)

            # Check if question ID contains field ID
            if field_id_normalized in question_id_normalized:
                return (answer_record.get("answer"), 0.9)

            # Check protocol field mapping
            if f"q_{field_id_normalized}" == question_id_normalized:
                return (answer_record.get("answer"), 0.95)

        return None

    async def _determine_best_value(
        self,
        field: Dict[str, Any],
        embedding_matches: List[EmbeddingMatch],
        fact_match: Optional[Tuple[Any, float]],
        wizard_match: Optional[Tuple[Any, float]],
    ) -> FieldFillResult:
        """Determine best value from all sources.

        Args:
            field: Field definition
            embedding_matches: Semantic search matches
            fact_match: Direct fact match
            wizard_match: Wizard answer match

        Returns:
            FieldFillResult with best value
        """
        field_id = field.get("id", "")
        field_label = field.get("label", field_id)
        field_type = field.get("type", "text")

        # Priority: Wizard answer > Direct fact > Semantic match

        # Check wizard answer first (user-provided, highest trust)
        if wizard_match and wizard_match[0] is not None:
            value, base_confidence = wizard_match
            confidence = self.confidence_scorer.score(
                semantic_score=base_confidence,
                source="wizard",
                field_type=field_type,
                correction_history=[],
            )
            return FieldFillResult(
                field_id=field_id,
                field_label=field_label,
                field_type=field_type,
                value=value,
                confidence=confidence,
                confidence_level=self._confidence_to_level(confidence),
                source=FactSource.WIZARD,
                evidence="From questionnaire answer",
                needs_review=confidence < 0.7,
            )

        # Check direct fact match
        if fact_match and fact_match[0] is not None:
            value, base_confidence = fact_match
            confidence = self.confidence_scorer.score(
                semantic_score=base_confidence,
                source="fact",
                field_type=field_type,
                correction_history=[],
            )
            return FieldFillResult(
                field_id=field_id,
                field_label=field_label,
                field_type=field_type,
                value=value,
                confidence=confidence,
                confidence_level=self._confidence_to_level(confidence),
                source=FactSource.EXTRACTED,
                evidence="From knowledge base fact",
                needs_review=confidence < 0.7,
            )

        # Check semantic matches
        if embedding_matches:
            best_match = embedding_matches[0]

            # Try to extract value from match content
            value = self._extract_value_from_match(best_match, field)

            if value is not None:
                confidence = self.confidence_scorer.score(
                    semantic_score=best_match.score,
                    source="embedding",
                    field_type=field_type,
                    correction_history=[],
                )
                return FieldFillResult(
                    field_id=field_id,
                    field_label=field_label,
                    field_type=field_type,
                    value=value,
                    confidence=confidence,
                    confidence_level=self._confidence_to_level(confidence),
                    source=FactSource.DOCUMENT,
                    evidence=f"Matched: {best_match.content[:100]}...",
                    needs_review=True,  # Always review semantic matches
                )

        # No match found
        return FieldFillResult(
            field_id=field_id,
            field_label=field_label,
            field_type=field_type,
            value=None,
            confidence=0.0,
            confidence_level=ConfidenceLevel.LOW,
            source=None,
            evidence=None,
            needs_review=False,
        )

    def _extract_value_from_match(
        self,
        match: EmbeddingMatch,
        field: Dict[str, Any]
    ) -> Optional[Any]:
        """Extract usable value from embedding match.

        Args:
            match: Embedding match result
            field: Field definition

        Returns:
            Extracted value or None
        """
        content = match.content

        # If content is in "key: value" format, extract value
        if ":" in content:
            parts = content.split(":", 1)
            if len(parts) == 2:
                return parts[1].strip()

        # For text fields, use the whole content if short enough
        field_type = field.get("type", "text")
        if field_type in ["text", "textarea"]:
            if len(content) <= 500:
                return content

        # For select fields, try to match to options
        if field_type in ["select", "radio"]:
            options = field.get("options", [])
            content_lower = content.lower()
            for opt in options:
                opt_label = opt.get("label", opt) if isinstance(opt, dict) else str(opt)
                if opt_label.lower() in content_lower:
                    return opt.get("value", opt) if isinstance(opt, dict) else opt

        return content[:500] if len(content) <= 500 else None

    def _confidence_to_level(self, confidence: float) -> ConfidenceLevel:
        """Convert confidence score to level.

        Args:
            confidence: Confidence score (0-1)

        Returns:
            ConfidenceLevel enum
        """
        if confidence >= 0.85:
            return ConfidenceLevel.HIGH
        elif confidence >= 0.60:
            return ConfidenceLevel.MEDIUM
        return ConfidenceLevel.LOW


def get_semantic_form_filler(db: AsyncSession) -> SemanticFormFiller:
    """Get a SemanticFormFiller instance.

    Args:
        db: Async database session

    Returns:
        SemanticFormFiller instance
    """
    return SemanticFormFiller(db)
