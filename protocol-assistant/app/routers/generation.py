"""Document generation endpoints for Protocol Assistant."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.schemas.generation import (
    BulkGenerationRequest,
    BulkGenerationResponse,
    DocumentType,
    GeneratedDocument,
    GeneratedFormInstance,
    PrefillRequest,
    PrefillResponse,
)
from app.schemas.protocol import ExtractedProtocol
from app.services.form_mapper import get_form_mapper
from app.services.generator import get_document_generator
from app.middleware.auth import UserContext, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/protocol-assistant", tags=["generation"])


async def get_current_user_id(user: UserContext = Depends(get_current_user)) -> UUID:
    """
    Get the current user ID from authentication.

    This dependency wraps the auth middleware to return just the user ID.
    """
    return user.id


async def _get_session_protocol(
    session_id: UUID,
    db: AsyncSession,
) -> tuple[ExtractedProtocol, dict]:
    """
    Retrieve and validate protocol data from a session or Knowledge Base.

    First checks the session for extracted_protocol.
    If not found, builds protocol from the project's Knowledge Base facts.

    Returns tuple of (ExtractedProtocol, collected_answers).
    Raises HTTPException if session not found or no protocol data available.
    """
    from app.models.chat import ChatSession
    from app.services.knowledge_base import get_knowledge_base_service
    from sqlalchemy import select

    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )

    collected_answers = session.collected_answers or {}

    # First try: use session's extracted_protocol
    if session.extracted_protocol:
        try:
            protocol = ExtractedProtocol.model_validate(session.extracted_protocol)
            return protocol, collected_answers
        except Exception as e:
            logger.warning(f"Failed to validate session protocol data: {e}")
            # Fall through to try Knowledge Base

    # Second try: build protocol from Knowledge Base
    if session.project_id:
        try:
            kb_service = get_knowledge_base_service(db)
            kb = await kb_service.get_by_project(session.project_id)

            if kb:
                facts = await kb_service.get_facts(kb["id"])
                wizard_answers = await kb_service.get_wizard_answers(kb["id"])

                # Build protocol from KB facts
                protocol_data = _build_protocol_from_kb(facts, wizard_answers)

                if protocol_data:
                    try:
                        protocol = ExtractedProtocol.model_validate(protocol_data)
                        logger.info(f"Built protocol from Knowledge Base for session {session_id}")
                        return protocol, collected_answers
                    except Exception as e:
                        logger.warning(f"Failed to validate KB-built protocol: {e}")
        except Exception as e:
            logger.warning(f"Failed to build protocol from KB: {e}")

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No protocol data available. Please complete the questionnaire "
        "or upload a protocol document first.",
    )


def _build_protocol_from_kb(facts: list, wizard_answers: dict) -> dict:
    """Build an ExtractedProtocol-compatible dict from Knowledge Base facts.

    This function maps KB facts and wizard answers to the ExtractedProtocol schema,
    providing sensible defaults for required fields when data is missing.
    """
    # Create a lookup dict from facts
    fact_dict = {}
    for fact in facts:
        if hasattr(fact, 'key') and hasattr(fact, 'value'):
            fact_dict[fact.key] = fact.value
        elif isinstance(fact, dict):
            fact_dict[fact.get('key', '')] = fact.get('value', '')

    # Also include wizard answers (they store the question_id as key)
    for key, value in (wizard_answers or {}).items():
        if key.startswith('_'):  # Skip internal keys like _skipped
            continue
        if isinstance(value, dict):
            fact_dict[key] = value.get('answer', value)
        else:
            fact_dict[key] = value

    # Helper to get value from multiple possible keys
    def get_value(*keys, default=None):
        for key in keys:
            val = fact_dict.get(key)
            if val:
                return val
        return default

    # Extract values with multiple key fallbacks
    study_title = get_value(
        "study_title", "q_study_title", "title",
        default="Research Study"
    )

    # Study type - try to map to valid enum value
    study_type_raw = get_value("study_type", "q_study_type", default="other")
    # Normalize study type to valid enum value
    study_type_map = {
        "retrospective": "retrospective",
        "prospective": "prospective",
        "clinical_trial": "clinical_trial",
        "clinical trial": "clinical_trial",
        "quality_improvement": "quality_improvement",
        "quality improvement": "quality_improvement",
        "qi": "quality_improvement",
        "educational": "educational",
    }
    study_type = study_type_map.get(study_type_raw.lower() if study_type_raw else "", "other")

    principal_investigator = get_value(
        "principal_investigator.name", "principal_investigator", "q_pi_name"
    )

    # Objectives - primary is required with min_length=10
    primary_objective = get_value(
        "primary_objective", "q_primary_objective",
        default="To investigate the research question as defined in the study protocol."
    )
    # Ensure min length of 10
    if len(primary_objective) < 10:
        primary_objective = f"Objective: {primary_objective}" if primary_objective else "To be determined based on study protocol."

    secondary_objectives = _parse_list(
        get_value("secondary_objectives", "q_secondary_objectives")
    )

    # Methodology - design and population are required
    study_design = get_value(
        "study_design", "methodology_description", "q_study_design",
        default="Study design to be specified."
    )
    target_population = get_value(
        "target_population", "q_target_population",
        default="Target population to be defined."
    )
    sample_size = get_value(
        "sample_size.total", "sample_size", "q_sample_size"
    )
    inclusion_criteria = _parse_list(
        get_value("inclusion_criteria", "q_inclusion_criteria")
    )
    exclusion_criteria = _parse_list(
        get_value("exclusion_criteria", "q_exclusion_criteria")
    )

    # Data collection (optional)
    data_sources = _parse_list(get_value("data_sources", "q_data_sources"))
    data_variables = _parse_list(get_value("data_variables", "q_data_variables"))
    timeline = get_value("duration_per_subject", "q_study_duration")

    # Risks and benefits (required object but lists have defaults)
    risks = _parse_list(get_value("risks", "q_risks"))
    benefits = _parse_list(
        get_value("benefits_to_subjects", "benefits_to_society", "q_benefits")
    )
    mitigation = _parse_list(get_value("risk_mitigation", "q_risk_mitigation"))

    confidentiality_measures = get_value(
        "confidentiality_measures", "q_confidentiality"
    )

    # Calculate quality score based on data completeness
    filled_fields = 0
    total_fields = 10  # Key fields to check

    if study_title and study_title != "Research Study":
        filled_fields += 1
    if study_type != "other":
        filled_fields += 1
    if principal_investigator:
        filled_fields += 1
    if primary_objective and "to be determined" not in primary_objective.lower():
        filled_fields += 1
    if study_design and "to be specified" not in study_design.lower():
        filled_fields += 1
    if target_population and "to be defined" not in target_population.lower():
        filled_fields += 1
    if sample_size:
        filled_fields += 1
    if inclusion_criteria:
        filled_fields += 1
    if risks:
        filled_fields += 1
    if benefits:
        filled_fields += 1

    quality_score = int((filled_fields / total_fields) * 100)

    # Identify missing sections
    missing_sections = []
    if not principal_investigator:
        missing_sections.append("Principal Investigator")
    if study_design and "to be specified" in study_design.lower():
        missing_sections.append("Study Design")
    if not inclusion_criteria and not exclusion_criteria:
        missing_sections.append("Eligibility Criteria")
    if not risks and not benefits:
        missing_sections.append("Risks and Benefits")
    if not data_sources and not data_variables:
        missing_sections.append("Data Collection")

    # Generate recommendations
    recommendations = []
    if missing_sections:
        recommendations.append(f"Complete the following sections: {', '.join(missing_sections)}")
    if quality_score < 50:
        recommendations.append("Consider uploading the full protocol document for better extraction.")
    if not sample_size:
        recommendations.append("Specify the target sample size for the study.")

    # Build the protocol data structure
    protocol_data = {
        "study_title": study_title,
        "study_type": study_type,
        "principal_investigator": principal_investigator,
        "objectives": {
            "primary": primary_objective,
            "secondary": secondary_objectives,
        },
        "methodology": {
            "design": study_design,
            "population": target_population,
            "sample_size": sample_size,
            "inclusion_criteria": inclusion_criteria,
            "exclusion_criteria": exclusion_criteria,
        },
        "data_collection": {
            "sources": data_sources,
            "variables": data_variables,
            "timeline": timeline,
        },
        "risks_benefits": {
            "risks": risks,
            "benefits": benefits,
            "mitigation": mitigation,
        },
        "confidentiality_measures": confidentiality_measures,
        "missing_sections": missing_sections,
        "quality_score": quality_score,
        "recommendations": recommendations,
    }

    # Only return if we have at least some meaningful data
    # (even with defaults, we need at least title or objective from actual data)
    has_real_data = (
        (study_title and study_title != "Research Study") or
        (get_value("primary_objective", "q_primary_objective") is not None) or
        principal_investigator or
        study_type != "other" or
        len(facts) > 0
    )

    if has_real_data:
        return protocol_data

    return None


def _parse_list(value) -> list:
    """Parse a value that might be a list, newline-separated string, or None."""
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        # Split by newlines or commas
        items = [item.strip() for item in value.replace('\n', ',').split(',')]
        return [item for item in items if item]
    return []


@router.post(
    "/sessions/{session_id}/generate/abstract",
    response_model=GeneratedDocument,
    summary="Generate a research abstract",
    description="Generate a structured research abstract from session protocol data.",
)
async def generate_abstract(
    session_id: UUID,
    word_limit: int = Query(
        default=350,
        ge=100,
        le=500,
        description="Maximum word count for the abstract",
    ),
    db: AsyncSession = Depends(get_async_session),
) -> GeneratedDocument:
    """
    Generate a research abstract from session data.

    Uses the extracted protocol information and collected answers to generate
    a well-structured abstract suitable for IRB submission.

    The abstract includes:
    - Background
    - Objectives
    - Methods
    - Expected Outcomes
    - Significance
    """
    protocol, collected_answers = await _get_session_protocol(session_id, db)
    generator = get_document_generator()

    try:
        return await generator.generate_abstract(
            protocol=protocol,
            collected_answers=collected_answers,
            word_limit=word_limit,
        )
    except Exception as e:
        logger.error(f"Abstract generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Abstract generation failed: {str(e)}",
        )


@router.post(
    "/sessions/{session_id}/generate/consent",
    response_model=GeneratedDocument,
    summary="Generate informed consent form",
    description="Generate an informed consent form from session protocol data.",
)
async def generate_consent_form(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> GeneratedDocument:
    """
    Generate an informed consent form.

    Creates a comprehensive consent form including:
    - Study purpose
    - Procedures
    - Risks and benefits
    - Confidentiality
    - Voluntary participation statement
    - Contact information
    - Consent statement
    """
    protocol, collected_answers = await _get_session_protocol(session_id, db)
    generator = get_document_generator()

    try:
        return await generator.generate_consent_form(
            protocol=protocol,
            collected_answers=collected_answers,
        )
    except Exception as e:
        logger.error(f"Consent form generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Consent form generation failed: {str(e)}",
        )


@router.post(
    "/sessions/{session_id}/generate/protocol",
    response_model=GeneratedDocument,
    summary="Generate full protocol document",
    description="Generate a complete protocol document from session data.",
)
async def generate_protocol(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> GeneratedDocument:
    """
    Generate a full protocol document.

    Creates a comprehensive research protocol including:
    - Title and background
    - Objectives
    - Study design
    - Participants and eligibility
    - Procedures
    - Data analysis plan
    - Ethical considerations
    - Timeline
    - References
    """
    protocol, collected_answers = await _get_session_protocol(session_id, db)
    generator = get_document_generator()

    try:
        return await generator.generate_protocol_document(
            protocol=protocol,
            collected_answers=collected_answers,
        )
    except Exception as e:
        logger.error(f"Protocol generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Protocol generation failed: {str(e)}",
        )


@router.post(
    "/sessions/{session_id}/generate/recruitment",
    response_model=GeneratedDocument,
    summary="Generate recruitment materials",
    description="Generate participant recruitment materials from session data.",
)
async def generate_recruitment_materials(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> GeneratedDocument:
    """
    Generate recruitment materials.

    Creates participant-friendly recruitment content including:
    - Attention-grabbing headline
    - Eligibility summary
    - What to expect
    - Benefits/compensation
    - Contact information
    """
    protocol, collected_answers = await _get_session_protocol(session_id, db)
    generator = get_document_generator()

    try:
        return await generator.generate_recruitment_materials(
            protocol=protocol,
            collected_answers=collected_answers,
        )
    except Exception as e:
        logger.error(f"Recruitment materials generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Recruitment materials generation failed: {str(e)}",
        )


@router.post(
    "/sessions/{session_id}/generate/data-management",
    response_model=GeneratedDocument,
    summary="Generate data management plan",
    description="Generate a data management plan from session data.",
)
async def generate_data_management_plan(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> GeneratedDocument:
    """
    Generate a data management plan.

    Creates a comprehensive data management plan including:
    - Data types
    - Collection methods
    - Storage and security
    - Access controls
    - Retention and disposal
    - Backup procedures
    """
    protocol, collected_answers = await _get_session_protocol(session_id, db)
    generator = get_document_generator()

    try:
        return await generator.generate_data_management_plan(
            protocol=protocol,
            collected_answers=collected_answers,
        )
    except Exception as e:
        logger.error(f"Data management plan generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Data management plan generation failed: {str(e)}",
        )


@router.post(
    "/sessions/{session_id}/generate",
    response_model=GeneratedDocument,
    summary="Generate any document type",
    description="Generate a document of the specified type from session data.",
)
async def generate_document(
    session_id: UUID,
    doc_type: DocumentType = Query(
        ...,
        description="Type of document to generate",
    ),
    word_limit: Optional[int] = Query(
        default=None,
        ge=100,
        le=2000,
        description="Maximum word count (for applicable document types)",
    ),
    db: AsyncSession = Depends(get_async_session),
) -> GeneratedDocument:
    """
    Generate any supported document type.

    Supports:
    - abstract
    - consent_form
    - protocol
    - recruitment_materials
    - data_management_plan
    """
    protocol, collected_answers = await _get_session_protocol(session_id, db)
    generator = get_document_generator()

    options = {}
    if word_limit and doc_type == DocumentType.ABSTRACT:
        options["word_limit"] = word_limit

    try:
        return await generator.generate(
            doc_type=doc_type,
            protocol=protocol,
            collected_answers=collected_answers,
            options=options,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Document generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Document generation failed: {str(e)}",
        )


@router.post(
    "/sessions/{session_id}/generate-all",
    response_model=BulkGenerationResponse,
    summary="Generate all document types at once",
    description="Generate multiple document types from session data.",
)
async def generate_all_documents(
    session_id: UUID,
    doc_types: Optional[list[DocumentType]] = Query(
        default=None,
        description="Document types to generate (defaults to abstract, consent, protocol)",
    ),
    db: AsyncSession = Depends(get_async_session),
) -> BulkGenerationResponse:
    """
    Generate multiple documents at once.

    If no document types are specified, generates:
    - Abstract
    - Consent form
    - Protocol document

    Returns results for all requested documents, including any that failed.
    """
    protocol, collected_answers = await _get_session_protocol(session_id, db)
    generator = get_document_generator()

    if doc_types is None:
        doc_types = [
            DocumentType.ABSTRACT,
            DocumentType.CONSENT_FORM,
            DocumentType.PROTOCOL,
        ]

    try:
        documents = await generator.generate_all(
            protocol=protocol,
            collected_answers=collected_answers,
            doc_types=doc_types,
        )

        successful = sum(1 for d in documents if d.quality_score > 0)
        failed = len(documents) - successful

        return BulkGenerationResponse(
            session_id=session_id,
            total_requested=len(doc_types),
            successful=successful,
            failed=failed,
            documents=documents,
        )
    except Exception as e:
        logger.error(f"Bulk generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk generation failed: {str(e)}",
        )


@router.post(
    "/sessions/{session_id}/prefill-form/{form_id}",
    response_model=PrefillResponse,
    summary="Pre-fill an IRB form with protocol data",
    description="Pre-fill an existing IRB form with extracted protocol data.",
)
async def prefill_form(
    session_id: UUID,
    form_id: int,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> PrefillResponse:
    """
    Pre-fill an IRB form with extracted protocol data.

    Maps the extracted protocol fields to the corresponding form fields
    and updates the form with the mapped values.

    The form must be in 'draft' or 'needs_changes' status to be edited.
    """
    protocol, _ = await _get_session_protocol(session_id, db)
    mapper = get_form_mapper()

    try:
        result = await mapper.prefill_form(
            form_id=form_id,
            protocol=protocol,
            user_id=str(user_id),
        )

        return PrefillResponse(
            form_id=form_id,
            updated_fields=result["updated_fields"],
            skipped_fields=result.get("skipped_fields", []),
            message=result["message"],
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Form pre-fill failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Form pre-fill failed: {str(e)}",
        )


@router.post(
    "/sessions/{session_id}/create-prefilled-form",
    response_model=GeneratedFormInstance,
    summary="Create a new pre-filled IRB form",
    description="Create a new IRB form and pre-fill it with protocol data.",
)
async def create_prefilled_form(
    session_id: UUID,
    template_id: int = Query(
        ...,
        description="Template ID to use for the form",
    ),
    title: Optional[str] = Query(
        default=None,
        description="Title for the form (defaults to protocol study title)",
    ),
    project_id: Optional[UUID] = Query(
        default=None,
        description="Project ID to associate with the form",
    ),
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> GeneratedFormInstance:
    """
    Create a new IRB form and pre-fill it with protocol data.

    Creates a new form from the specified template and automatically
    populates it with data extracted from the protocol.
    """
    from app.models.chat import ChatSession
    from sqlalchemy import select

    # Get session for project_id if not provided
    if project_id is None:
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session:
            project_id = session.project_id

    protocol, _ = await _get_session_protocol(session_id, db)
    mapper = get_form_mapper()

    try:
        result = await mapper.create_prefilled_form(
            template_id=template_id,
            protocol=protocol,
            user_id=str(user_id),
            project_id=str(project_id) if project_id else str(user_id),
            title=title,
        )

        return GeneratedFormInstance(
            form_id=result["form_id"],
            doc_type="irb_form",
            status=result.get("status", "draft"),
            completion_percentage=len(result["updated_fields"]) * 5.0,  # Rough estimate
            editable_url=f"/forms/{result['form_id']}",
        )
    except Exception as e:
        logger.error(f"Pre-filled form creation failed: {e}")
        return GeneratedFormInstance(
            doc_type="irb_form",
            status="error",
            error=str(e),
        )


@router.get(
    "/document-types",
    summary="List available document types",
    description="Get a list of all document types that can be generated.",
)
async def list_document_types() -> dict:
    """
    List all available document types for generation.

    Returns information about each document type including
    its identifier and description.
    """
    return {
        "document_types": [
            {
                "id": DocumentType.ABSTRACT.value,
                "name": "Research Abstract",
                "description": "A structured abstract for IRB submission",
            },
            {
                "id": DocumentType.CONSENT_FORM.value,
                "name": "Informed Consent Form",
                "description": "A comprehensive informed consent document",
            },
            {
                "id": DocumentType.PROTOCOL.value,
                "name": "Protocol Document",
                "description": "A complete research protocol document",
            },
            {
                "id": DocumentType.RECRUITMENT.value,
                "name": "Recruitment Materials",
                "description": "Participant recruitment flyers and materials",
            },
            {
                "id": DocumentType.DATA_MANAGEMENT.value,
                "name": "Data Management Plan",
                "description": "A data governance and management plan",
            },
            {
                "id": DocumentType.BUDGET.value,
                "name": "Budget Justification",
                "description": "Budget justification document (coming soon)",
            },
        ]
    }
