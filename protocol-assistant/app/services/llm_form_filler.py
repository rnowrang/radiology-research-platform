"""LLM-powered form filling with holistic understanding.

This service fills forms by:
1. Sending the entire form schema and knowledge base to an LLM
2. LLM reasons holistically about all fields in a single call
3. Returns filled fields with confidence scores and reasoning
4. Caches results to reduce API costs

Key advantages over semantic matching:
- Understands context and relationships between fields
- Can infer values that aren't exact matches
- Provides reasoning for each fill decision
- Handles synonyms and paraphrasing naturally
"""

import hashlib
import json
import logging
import re
from datetime import timedelta
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas.form_fill import (
    FormContext,
    FormFieldContext,
    KnowledgeContext,
    KnowledgeFact,
    LLMFieldFill,
    LLMFormFillResponse,
)
from app.schemas.knowledge import (
    ConfidenceLevel,
    FactSource,
    FieldFillResult,
    FormFillPreview,
    FormFillResult,
)
from app.services.knowledge_base import get_knowledge_base_service
from app.services.llm.claude import ClaudeProvider
from app.services.llm.base import LLMError, LLMMessage

logger = logging.getLogger(__name__)


# System prompt for form filling
FORM_FILL_SYSTEM_PROMPT = """You are an expert IRB form filling assistant. Your task is to fill out a research study form using information from the project's knowledge base.

You will work in TWO PHASES:

## PHASE 1 - KNOWLEDGE EXTRACTION
First, analyze the knowledge base and mentally organize what information is available:
- Study details (title, type, dates)
- Personnel (PI, staff, department)
- Population (size, criteria, age range)
- Methods (design, procedures, risks)
- Recruitment and consent
- Data security and confidentiality
- Regulatory status

## PHASE 2 - FORM FILLING
Using your understanding from Phase 1, fill each form field where you have relevant information.

## KNOWLEDGE BASE FIELD MAPPING HINTS
The KB uses specific key patterns. Here are common mappings to help you find relevant information:

### Basic Study Info
- study_title, study_type, primary_objective, secondary_objectives
- principal_investigator.name, study_design, target_population

### Population & Sample Size
- population.healthy_llu, population.patients_llu, population.total_llu
- population.healthy_age_range, population.patients_age_range, population.age_range
- population.vulnerable (children, prisoners, pregnant, etc.)
- population.special (employees, students)
- inclusion_criteria, exclusion_criteria

### Recruitment
- recruitment.sources (clinic, ads, registry)
- recruitment.flyers_used, recruitment.verbal_used, recruitment.electronic_used
- recruitment.electronic_description, recruitment.description

### Consent Process
- consent.plan, consent.location, consent.timing
- consent.documents_required, consent.waiver_requested, consent.waiver_type
- consent.inducement (compensation)

### Procedures & Methods
- methods.location (where procedures performed)
- methods.procedures_minimal (surveys, blood draw)
- methods.procedures_greater (MRI, biopsy, investigational)
- methods.safety_monitoring (DSMB, PI, sponsor)

### Data Security & Confidentiality
- confidentiality.electronic_collection, confidentiality.electronic_protections
- confidentiality.hardcopy_stored, confidentiality.hardcopy_storage
- confidentiality.collecting_health_info, confidentiality.phi_shared
- confidentiality.phi_shared_with, confidentiality_measures

### Regulatory Status
- study.fda_regulations_apply, study.ind_number, study.ide_number
- study.ionizing_radiation, study.ibc_infectious
- study.ibc_recombinant, study.ibc_hazardous
- study.is_student_project

### Risks & Benefits
- risks, benefits_to_subjects, benefits_to_society, risk_mitigation

## WRITING STYLE (for text/textarea fields)
- Professional academic/clinical tone
- Meaningful and substantive content
- Concise - no unnecessary words or filler
- Appropriate for IRB submission review

## RULES
1. Only fill fields where you have clear evidence from the KB
2. For select/radio/checkbox fields, you MUST use the EXACT option value from the provided options list
3. Provide a confidence score based on evidence quality:
   - 0.9-1.0: Direct exact match from KB
   - 0.7-0.9: Clear inference from available information
   - 0.5-0.7: Reasonable inference with some uncertainty
   - <0.5: Don't fill - leave value as null
4. Cite the KB keys used as evidence in evidence_keys
5. If you cannot fill a field confidently, set value to null
6. For boolean facts stored as "true"/"false" strings, interpret appropriately for checkboxes/radios

## OUTPUT FORMAT
Return ONLY a valid JSON object with this structure:
{
  "filled_fields": [
    {
      "field_id": "investigator.pi_name",
      "value": "Dr. Jane Smith, MD",
      "confidence": 0.95,
      "reasoning": "Directly from wizard answer for PI name",
      "evidence_keys": ["wizard_answers.q_principal_investigator_name"]
    }
  ]
}

IMPORTANT: Return ONLY the JSON object, no markdown code blocks or other text."""


class LLMFormFiller:
    """LLM-powered form filling service."""

    def __init__(self, db: AsyncSession):
        """Initialize the LLM form filler.

        Args:
            db: Async database session
        """
        self.db = db
        self.settings = get_settings()
        self.llm = ClaudeProvider()
        self._redis: Optional[redis.Redis] = None

    async def _get_redis(self) -> Optional[redis.Redis]:
        """Get Redis connection for caching."""
        if self._redis is not None:
            return self._redis

        try:
            self._redis = redis.from_url(
                self.settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
            await self._redis.ping()
            return self._redis
        except Exception as e:
            logger.warning(f"Redis not available for caching: {e}")
            return None

    async def fill_form(
        self,
        project_id: UUID,
        template_schema: Dict[str, Any],
        template_id: int,
        template_name: Optional[str] = None,
        overwrite_existing: bool = False,
        existing_data: Optional[Dict[str, Any]] = None,
    ) -> FormFillResult:
        """Fill a form using LLM-powered holistic understanding.

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

        # Check cache first
        kb_hash = self._compute_kb_hash(kb)
        cached = await self._get_cached_result(project_id, template_id, kb_hash)
        if cached:
            logger.info(f"Using cached form fill result for project {project_id}")
            return cached

        # Prepare contexts
        form_context = self._prepare_form_context(template_schema)
        kb_context = self._prepare_kb_context(kb)

        # Check if KB has enough data
        if not kb_context.facts and not kb_context.wizard_answers and not kb_context.protocol_data:
            logger.warning(f"Empty knowledge base for project {project_id}")
            return self._build_empty_result(template_id, template_name, form_context)

        # Fill with LLM
        try:
            llm_fills = await self._fill_with_llm(form_context, kb_context)
        except LLMError as e:
            logger.error(f"LLM form fill failed: {e}")
            raise

        # Build result
        result = self._build_result(
            template_id=template_id,
            template_name=template_name,
            form_context=form_context,
            llm_fills=llm_fills,
            existing_data=existing_data,
            overwrite_existing=overwrite_existing,
        )

        # Cache result
        await self._cache_result(project_id, template_id, kb_hash, result)

        return result

    async def preview_fill(
        self,
        project_id: UUID,
        template_schema: Dict[str, Any],
        template_id: int,
        template_name: Optional[str] = None,
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

    def _prepare_form_context(self, schema: Dict[str, Any]) -> FormContext:
        """Convert form schema to LLM-readable format.

        Args:
            schema: Template schema dict

        Returns:
            FormContext with simplified field definitions
        """
        fields = []

        # Extract from sections
        for section in schema.get("sections", []):
            for field in section.get("fields", []):
                fields.append(self._extract_field_context(field))

        # Extract flat fields
        for field in schema.get("fields", []):
            fields.append(self._extract_field_context(field))

        return FormContext(fields=fields)

    def _extract_field_context(self, field: Dict[str, Any]) -> FormFieldContext:
        """Extract relevant field information for LLM context.

        Args:
            field: Field definition dict

        Returns:
            FormFieldContext with simplified field info
        """
        options = None
        if field.get("type") in ["select", "radio", "checkbox"]:
            raw_options = field.get("options", [])
            options = []
            for opt in raw_options:
                if isinstance(opt, dict):
                    options.append({
                        "value": opt.get("value", ""),
                        "label": opt.get("label", opt.get("value", "")),
                    })
                else:
                    options.append({"value": str(opt), "label": str(opt)})

        return FormFieldContext(
            id=field.get("id", ""),
            label=field.get("label", field.get("id", "")),
            type=field.get("type", "text"),
            required=field.get("required", False),
            description=field.get("description") or field.get("help_text"),
            options=options,
        )

    def _prepare_kb_context(self, kb: Dict[str, Any]) -> KnowledgeContext:
        """Convert KB to LLM-readable format.

        Args:
            kb: Knowledge base dict

        Returns:
            KnowledgeContext with structured KB data
        """
        # Convert facts to simplified format
        facts = []
        for fact in kb.get("facts", []):
            if isinstance(fact, dict):
                facts.append(KnowledgeFact(
                    key=fact.get("key", ""),
                    value=fact.get("value"),
                    source=fact.get("source", "extracted"),
                ))

        # Simplify wizard answers - extract just the answer values
        wizard_answers = {}
        for question_id, record in kb.get("wizard_answers", {}).items():
            if isinstance(record, dict):
                wizard_answers[question_id] = record.get("answer")
            else:
                wizard_answers[question_id] = record

        return KnowledgeContext(
            protocol_data=kb.get("protocol_data", {}),
            facts=facts,
            wizard_answers=wizard_answers,
        )

    async def _fill_with_llm(
        self,
        form_context: FormContext,
        kb_context: KnowledgeContext,
    ) -> List[LLMFieldFill]:
        """Make single LLM call to fill all fields.

        Args:
            form_context: Form field definitions
            kb_context: Knowledge base content

        Returns:
            List of LLM field fills with confidence and reasoning
        """
        # Build the prompt
        prompt = self._build_fill_prompt(form_context, kb_context)

        # Make LLM call
        messages = [LLMMessage(role="user", content=prompt)]

        response = await self.llm.complete(
            messages=messages,
            system_prompt=FORM_FILL_SYSTEM_PROMPT,
            max_tokens=8192,  # Allow for detailed responses with reasoning
            temperature=0.3,  # Lower temperature for more consistent output
        )

        # Parse response
        return self._parse_llm_response(response.content)

    def _build_fill_prompt(
        self,
        form_context: FormContext,
        kb_context: KnowledgeContext,
    ) -> str:
        """Build the user prompt for form filling.

        Args:
            form_context: Form field definitions
            kb_context: Knowledge base content

        Returns:
            Formatted prompt string
        """
        # Format form fields
        form_json = json.dumps(
            [f.model_dump(exclude_none=True) for f in form_context.fields],
            indent=2,
        )

        # Format KB content
        kb_json = json.dumps(
            {
                "protocol_data": kb_context.protocol_data,
                "facts": [f.model_dump() for f in kb_context.facts],
                "wizard_answers": kb_context.wizard_answers,
            },
            indent=2,
            default=str,
        )

        return f"""## FORM FIELDS TO FILL

{form_json}

## KNOWLEDGE BASE

{kb_json}

Fill all fields where you have relevant information from the knowledge base. Return the JSON response with filled_fields array."""

    def _parse_llm_response(self, content: str) -> List[LLMFieldFill]:
        """Parse LLM response into structured fills.

        Args:
            content: Raw LLM response content

        Returns:
            List of validated LLMFieldFill objects
        """
        # Clean up response - remove markdown code blocks if present
        content = content.strip()
        if content.startswith("```"):
            # Remove code block markers
            lines = content.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines[-1].strip() == "```":
                lines = lines[:-1]
            content = "\n".join(lines)

        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM JSON response: {e}")
            logger.debug(f"Raw response: {content[:500]}...")
            return []

        # Validate and convert
        fills = []
        for field_data in data.get("filled_fields", []):
            try:
                # Skip fields with null values or low confidence
                if field_data.get("value") is None:
                    continue
                if field_data.get("confidence", 0) < 0.5:
                    continue

                fill = LLMFieldFill(
                    field_id=field_data.get("field_id", ""),
                    value=field_data.get("value"),
                    confidence=field_data.get("confidence", 0.5),
                    reasoning=field_data.get("reasoning", ""),
                    evidence_keys=field_data.get("evidence_keys", []),
                )
                fills.append(fill)
            except Exception as e:
                logger.warning(f"Failed to parse field fill: {e}")
                continue

        return fills

    def _build_result(
        self,
        template_id: int,
        template_name: Optional[str],
        form_context: FormContext,
        llm_fills: List[LLMFieldFill],
        existing_data: Optional[Dict[str, Any]],
        overwrite_existing: bool,
    ) -> FormFillResult:
        """Build FormFillResult from LLM fills.

        Args:
            template_id: Template ID
            template_name: Optional template name
            form_context: Form field definitions
            llm_fills: LLM-generated fills
            existing_data: Existing form data
            overwrite_existing: Whether to overwrite existing values

        Returns:
            FormFillResult with statistics
        """
        # Create lookup of LLM fills by field_id
        llm_fill_map = {f.field_id: f for f in llm_fills}

        filled_fields = []
        unfilled_fields = []
        high_count = 0
        medium_count = 0
        low_count = 0
        needs_review_count = 0

        for field in form_context.fields:
            field_id = field.id

            # Check existing data
            existing_value = self._get_existing_value(existing_data, field_id)
            if existing_value is not None and not overwrite_existing:
                # Keep existing value
                filled_fields.append(FieldFillResult(
                    field_id=field_id,
                    field_label=field.label,
                    field_type=field.type,
                    value=existing_value,
                    confidence=1.0,
                    confidence_level=ConfidenceLevel.HIGH,
                    source=FactSource.USER_INPUT,
                    evidence="Existing user-provided value",
                    needs_review=False,
                ))
                high_count += 1
                continue

            # Check LLM fill
            llm_fill = llm_fill_map.get(field_id)
            if llm_fill and llm_fill.value is not None:
                # Validate value for select/radio fields
                validated_value = self._validate_option_value(
                    llm_fill.value,
                    field.type,
                    field.options,
                )

                if validated_value is not None:
                    confidence_level = self._confidence_to_level(llm_fill.confidence)

                    filled_fields.append(FieldFillResult(
                        field_id=field_id,
                        field_label=field.label,
                        field_type=field.type,
                        value=validated_value,
                        confidence=llm_fill.confidence,
                        confidence_level=confidence_level,
                        source=FactSource.EXTRACTED,
                        evidence=llm_fill.reasoning,
                        needs_review=llm_fill.confidence < 0.7,
                    ))

                    if confidence_level == ConfidenceLevel.HIGH:
                        high_count += 1
                    elif confidence_level == ConfidenceLevel.MEDIUM:
                        medium_count += 1
                    else:
                        low_count += 1

                    if llm_fill.confidence < 0.7:
                        needs_review_count += 1
                    continue

            # Field not filled
            unfilled_fields.append(field_id)

        # Calculate fill rate
        total_fields = len(form_context.fields)
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
            suggested_wizard_questions=[f"q_{fid.replace('.', '_')}" for fid in unfilled_fields[:10]],
        )

    def _build_empty_result(
        self,
        template_id: int,
        template_name: Optional[str],
        form_context: FormContext,
    ) -> FormFillResult:
        """Build empty result when KB has no data.

        Args:
            template_id: Template ID
            template_name: Optional template name
            form_context: Form field definitions

        Returns:
            FormFillResult with all fields unfilled
        """
        unfilled_fields = [f.id for f in form_context.fields]

        return FormFillResult(
            template_id=template_id,
            template_name=template_name,
            filled_fields=[],
            unfilled_fields=unfilled_fields,
            fill_rate=0.0,
            high_confidence_count=0,
            medium_confidence_count=0,
            low_confidence_count=0,
            needs_review_count=0,
            suggested_wizard_questions=[f"q_{fid.replace('.', '_')}" for fid in unfilled_fields[:10]],
        )

    def _get_existing_value(
        self,
        existing_data: Optional[Dict[str, Any]],
        field_id: str,
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
            val = existing_data[field_id]
            if val is not None and val != "":
                return val

        # Try nested lookup
        parts = field_id.split(".")
        current = existing_data
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None

        if current is not None and current != "":
            return current
        return None

    def _validate_option_value(
        self,
        value: Any,
        field_type: str,
        options: Optional[List[Dict[str, str]]],
    ) -> Optional[Any]:
        """Validate that value matches allowed options for select fields.

        Args:
            value: Value to validate
            field_type: Field type
            options: Available options

        Returns:
            Validated value or None if invalid
        """
        if field_type not in ["select", "radio", "checkbox"] or not options:
            return value

        value_str = str(value).lower().strip()

        # Check exact value match
        for opt in options:
            if str(opt.get("value", "")).lower() == value_str:
                return opt.get("value")

        # Check label match (LLM might use label instead of value)
        for opt in options:
            if str(opt.get("label", "")).lower() == value_str:
                return opt.get("value")

        # Fuzzy match for common variations
        for opt in options:
            opt_value = str(opt.get("value", "")).lower()
            opt_label = str(opt.get("label", "")).lower()

            # Check if value is contained in option
            if value_str in opt_value or value_str in opt_label:
                return opt.get("value")

            # Check if option is contained in value
            if opt_value in value_str or opt_label in value_str:
                return opt.get("value")

        logger.warning(f"Value '{value}' not in options: {[o.get('value') for o in options]}")
        return None

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

    # =========================================================================
    # Caching
    # =========================================================================

    def _compute_kb_hash(self, kb: Dict[str, Any]) -> str:
        """Compute hash of KB content for cache key.

        Args:
            kb: Knowledge base dict

        Returns:
            12-character hash string
        """
        content = json.dumps(
            {
                "facts": kb.get("facts", []),
                "wizard_answers": kb.get("wizard_answers", {}),
                "protocol_data": kb.get("protocol_data", {}),
            },
            sort_keys=True,
            default=str,
        )
        return hashlib.md5(content.encode()).hexdigest()[:12]

    async def _get_cached_result(
        self,
        project_id: UUID,
        template_id: int,
        kb_hash: str,
    ) -> Optional[FormFillResult]:
        """Get cached form fill result.

        Args:
            project_id: Project UUID
            template_id: Template ID
            kb_hash: KB content hash

        Returns:
            Cached FormFillResult or None
        """
        redis_client = await self._get_redis()
        if not redis_client:
            return None

        key = f"form_fill:{project_id}:{template_id}:{kb_hash}"
        try:
            cached = await redis_client.get(key)
            if cached:
                data = json.loads(cached)
                return FormFillResult(**data)
        except Exception as e:
            logger.warning(f"Failed to get cached result: {e}")

        return None

    async def _cache_result(
        self,
        project_id: UUID,
        template_id: int,
        kb_hash: str,
        result: FormFillResult,
    ) -> None:
        """Cache form fill result.

        Args:
            project_id: Project UUID
            template_id: Template ID
            kb_hash: KB content hash
            result: FormFillResult to cache
        """
        redis_client = await self._get_redis()
        if not redis_client:
            return

        key = f"form_fill:{project_id}:{template_id}:{kb_hash}"
        try:
            # Cache for 24 hours
            await redis_client.setex(
                key,
                timedelta(hours=24),
                result.model_dump_json(),
            )
        except Exception as e:
            logger.warning(f"Failed to cache result: {e}")


def get_llm_form_filler(db: AsyncSession) -> LLMFormFiller:
    """Get an LLMFormFiller instance.

    Args:
        db: Async database session

    Returns:
        LLMFormFiller instance
    """
    return LLMFormFiller(db)
