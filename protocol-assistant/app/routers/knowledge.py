"""API endpoints for project knowledge base management."""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.middleware.auth import get_current_user, UserContext
from app.services.knowledge_base import get_knowledge_base_service
from app.services.embeddings import get_knowledge_embeddings_service
from app.services.document_parser import DocumentParser
from app.services.protocol_analyzer import ProtocolAnalyzer
from app.schemas.knowledge import (
    ProjectKnowledgeBaseResponse,
    Fact,
    FactSource,
    DocumentInfo,
    SemanticSearchRequest,
    SemanticSearchResponse,
    EmbeddingMatch,
    KnowledgeBaseStatsResponse,
    ContentType,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["knowledge"])


class AddFactRequest(BaseModel):
    """Request to add a fact."""
    key: str
    value: str
    source: str = "user_input"
    confidence: float = 1.0
    source_reference: Optional[str] = None


class AddFactsRequest(BaseModel):
    """Request to add multiple facts."""
    facts: List[AddFactRequest]


@router.get(
    "/projects/{project_id}/knowledge",
    response_model=ProjectKnowledgeBaseResponse,
    summary="Get project knowledge base",
)
async def get_project_knowledge(
    project_id: str,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Get the knowledge base for a project.

    Returns protocol data, facts, documents, and wizard answers.
    """
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    kb_service = get_knowledge_base_service(db)

    try:
        kb = await kb_service.get_or_create(project_uuid)

        # Convert facts to Fact objects
        facts = await kb_service.get_facts(kb["id"])

        return ProjectKnowledgeBaseResponse(
            id=UUID(str(kb["id"])),
            project_id=project_uuid,
            protocol_data=kb.get("protocol_data", {}),
            facts=[f.model_dump() for f in facts],
            documents=[],  # TODO: Convert document list
            wizard_answers=kb.get("wizard_answers", {}),
            questionnaire_complete=kb.get("questionnaire_complete", False),
            completion_percentage=kb.get("completion_percentage", 0.0),
            created_at=kb.get("created_at"),
            updated_at=kb.get("updated_at"),
        )

    except Exception as e:
        logger.error(f"Failed to get knowledge base: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post(
    "/projects/{project_id}/knowledge/facts",
    summary="Add facts to knowledge base",
)
async def add_facts(
    project_id: str,
    request: AddFactsRequest,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Add facts to the project knowledge base."""
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    kb_service = get_knowledge_base_service(db)
    embeddings_service = get_knowledge_embeddings_service(db)

    try:
        kb = await kb_service.get_or_create(project_uuid)
        kb_id = kb["id"]

        added_count = 0
        for fact_req in request.facts:
            try:
                source = FactSource(fact_req.source)
            except ValueError:
                source = FactSource.USER_INPUT

            # Add fact
            await kb_service.add_fact(
                kb_id=kb_id,
                key=fact_req.key,
                value=fact_req.value,
                source=source,
                confidence=fact_req.confidence,
                source_reference=fact_req.source_reference,
            )

            # Add embedding for semantic search (optional - gracefully skip if pgvector not available)
            try:
                await embeddings_service.store_embedding(
                    kb_id=kb_id,
                    content=f"{fact_req.key}: {fact_req.value}",
                    content_type=ContentType.FACT,
                    source_key=f"fact:{fact_req.key}",
                )
            except Exception as e:
                # Rollback to clear the failed transaction before continuing
                await db.rollback()
                logger.debug(f"Embeddings not available for fact {fact_req.key}: {e}")

            added_count += 1

        return {
            "success": True,
            "facts_added": added_count,
        }

    except Exception as e:
        logger.error(f"Failed to add facts: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post(
    "/projects/{project_id}/knowledge/search",
    response_model=SemanticSearchResponse,
    summary="Semantic search in knowledge base",
)
async def search_knowledge(
    project_id: str,
    request: SemanticSearchRequest,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Search the knowledge base using semantic similarity."""
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    kb_service = get_knowledge_base_service(db)
    embeddings_service = get_knowledge_embeddings_service(db)

    try:
        kb = await kb_service.get_by_project(project_uuid)
        if not kb:
            return SemanticSearchResponse(
                matches=[],
                query=request.query,
                total_results=0,
            )

        matches = await embeddings_service.search_similar(
            kb_id=kb["id"],
            query=request.query,
            top_k=request.top_k,
            content_types=request.content_types,
        )

        return SemanticSearchResponse(
            matches=matches,
            query=request.query,
            total_results=len(matches),
        )

    except Exception as e:
        logger.error(f"Semantic search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post(
    "/projects/{project_id}/documents",
    summary="Upload document to knowledge base",
)
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    doc_type: str = "protocol",
    extract_facts: bool = True,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Upload and process a document for the knowledge base.

    The document will be parsed and facts extracted for form filling.
    """
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    kb_service = get_knowledge_base_service(db)

    try:
        kb = await kb_service.get_or_create(project_uuid)
        kb_id = kb["id"]

        # Read file content
        content = await file.read()
        filename = file.filename or "document"

        # Create document record
        doc_id = await kb_service.add_document(
            kb_id=kb_id,
            doc_info=DocumentInfo(
                doc_id=UUID("00000000-0000-0000-0000-000000000000"),
                filename=filename,
                doc_type=doc_type,
            ),
        )

        facts_extracted = 0
        extraction_result = None

        if extract_facts:
            try:
                # Parse the document
                parser = DocumentParser()
                parsed_doc = await parser.parse(content, filename)

                # Extract protocol information using LLM
                analyzer = ProtocolAnalyzer()
                extracted = await analyzer.extract_protocol_info(parsed_doc)
                extraction_result = extracted

                # Convert extracted protocol to facts
                # IMPORTANT: Use field names that match questionnaire protocol_field values
                # See questionnaire_engine.py for expected field names
                facts_to_add = []

                if extracted.study_title:
                    facts_to_add.append(("study_title", extracted.study_title))
                if extracted.principal_investigator:
                    # Store as principal_investigator.name to match questionnaire field
                    facts_to_add.append(("principal_investigator.name", extracted.principal_investigator))
                if extracted.study_type:
                    facts_to_add.append(("study_type", extracted.study_type.value if hasattr(extracted.study_type, 'value') else str(extracted.study_type)))

                # Objectives
                if extracted.objectives:
                    if extracted.objectives.primary:
                        facts_to_add.append(("primary_objective", extracted.objectives.primary))
                    if extracted.objectives.secondary:
                        facts_to_add.append(("secondary_objectives", "\n".join(extracted.objectives.secondary)))

                # Methodology
                if extracted.methodology:
                    if extracted.methodology.design:
                        facts_to_add.append(("study_design", extracted.methodology.design))
                    if extracted.methodology.population:
                        facts_to_add.append(("target_population", extracted.methodology.population))
                    if extracted.methodology.sample_size:
                        # Store as sample_size.total to match questionnaire field
                        facts_to_add.append(("sample_size.total", extracted.methodology.sample_size))
                    if extracted.methodology.inclusion_criteria:
                        facts_to_add.append(("inclusion_criteria", "\n".join(extracted.methodology.inclusion_criteria)))
                    if extracted.methodology.exclusion_criteria:
                        facts_to_add.append(("exclusion_criteria", "\n".join(extracted.methodology.exclusion_criteria)))

                # Data collection
                if extracted.data_collection:
                    if extracted.data_collection.sources:
                        facts_to_add.append(("data_sources", "\n".join(extracted.data_collection.sources)))
                    if extracted.data_collection.variables:
                        facts_to_add.append(("data_variables", "\n".join(extracted.data_collection.variables)))
                    if extracted.data_collection.timeline:
                        facts_to_add.append(("duration_per_subject", extracted.data_collection.timeline))

                # Risks and benefits - use questionnaire field names
                if extracted.risks_benefits:
                    if extracted.risks_benefits.risks:
                        facts_to_add.append(("risks", "\n".join(extracted.risks_benefits.risks)))
                    if extracted.risks_benefits.benefits:
                        benefits_text = "\n".join(extracted.risks_benefits.benefits)
                        # Store as both benefit types
                        facts_to_add.append(("benefits_to_subjects", benefits_text))
                        facts_to_add.append(("benefits_to_society", benefits_text))
                    if extracted.risks_benefits.mitigation:
                        facts_to_add.append(("risk_mitigation", "\n".join(extracted.risks_benefits.mitigation)))

                if extracted.confidentiality_measures:
                    facts_to_add.append(("confidentiality_measures", extracted.confidentiality_measures))

                # Recruitment information
                if extracted.recruitment:
                    if extracted.recruitment.sources:
                        facts_to_add.append(("recruitment.sources", ", ".join(extracted.recruitment.sources)))
                    if extracted.recruitment.uses_flyers is not None:
                        facts_to_add.append(("recruitment.flyers_used", str(extracted.recruitment.uses_flyers).lower()))
                    if extracted.recruitment.uses_verbal is not None:
                        facts_to_add.append(("recruitment.verbal_used", str(extracted.recruitment.uses_verbal).lower()))
                    if extracted.recruitment.uses_electronic is not None:
                        facts_to_add.append(("recruitment.electronic_used", str(extracted.recruitment.uses_electronic).lower()))
                    if extracted.recruitment.electronic_description:
                        facts_to_add.append(("recruitment.electronic_description", extracted.recruitment.electronic_description))
                    if extracted.recruitment.description:
                        facts_to_add.append(("recruitment.description", extracted.recruitment.description))

                # Consent process
                if extracted.consent:
                    if extracted.consent.plan_description:
                        facts_to_add.append(("consent.plan", extracted.consent.plan_description))
                    if extracted.consent.location:
                        facts_to_add.append(("consent.location", extracted.consent.location))
                    if extracted.consent.timing:
                        facts_to_add.append(("consent.timing", extracted.consent.timing))
                    if extracted.consent.documents_required:
                        facts_to_add.append(("consent.documents_required", ", ".join(extracted.consent.documents_required)))
                    if extracted.consent.waiver_requested is not None:
                        facts_to_add.append(("consent.waiver_requested", str(extracted.consent.waiver_requested).lower()))
                    if extracted.consent.waiver_type:
                        facts_to_add.append(("consent.waiver_type", extracted.consent.waiver_type))
                    if extracted.consent.inducement:
                        facts_to_add.append(("consent.inducement", extracted.consent.inducement))

                # Population details
                if extracted.population_details:
                    if extracted.population_details.healthy_count is not None:
                        facts_to_add.append(("population.healthy_llu", str(extracted.population_details.healthy_count)))
                    if extracted.population_details.patient_count is not None:
                        facts_to_add.append(("population.patients_llu", str(extracted.population_details.patient_count)))
                    if extracted.population_details.total_count is not None:
                        facts_to_add.append(("population.total_llu", str(extracted.population_details.total_count)))
                    if extracted.population_details.healthy_age_range:
                        facts_to_add.append(("population.healthy_age_range", extracted.population_details.healthy_age_range))
                    if extracted.population_details.patient_age_range:
                        facts_to_add.append(("population.patients_age_range", extracted.population_details.patient_age_range))
                    if extracted.population_details.overall_age_range:
                        facts_to_add.append(("population.age_range", extracted.population_details.overall_age_range))
                    if extracted.population_details.vulnerable_populations:
                        facts_to_add.append(("population.vulnerable", ", ".join(extracted.population_details.vulnerable_populations)))
                    if extracted.population_details.special_populations:
                        facts_to_add.append(("population.special", ", ".join(extracted.population_details.special_populations)))

                # Procedures
                if extracted.procedures:
                    if extracted.procedures.location:
                        facts_to_add.append(("methods.location", extracted.procedures.location))
                    if extracted.procedures.minimal_risk:
                        facts_to_add.append(("methods.procedures_minimal", ", ".join(extracted.procedures.minimal_risk)))
                    if extracted.procedures.greater_risk:
                        facts_to_add.append(("methods.procedures_greater", ", ".join(extracted.procedures.greater_risk)))
                    if extracted.procedures.safety_monitoring:
                        facts_to_add.append(("methods.safety_monitoring", extracted.procedures.safety_monitoring))

                # Data security
                if extracted.data_security:
                    if extracted.data_security.electronic_collection is not None:
                        facts_to_add.append(("confidentiality.electronic_collection", str(extracted.data_security.electronic_collection).lower()))
                    if extracted.data_security.electronic_protections:
                        facts_to_add.append(("confidentiality.electronic_protections", ", ".join(extracted.data_security.electronic_protections)))
                    if extracted.data_security.hardcopy_stored is not None:
                        facts_to_add.append(("confidentiality.hardcopy_stored", str(extracted.data_security.hardcopy_stored).lower()))
                    if extracted.data_security.hardcopy_storage:
                        facts_to_add.append(("confidentiality.hardcopy_storage", ", ".join(extracted.data_security.hardcopy_storage)))
                    if extracted.data_security.collecting_health_info is not None:
                        facts_to_add.append(("confidentiality.collecting_health_info", str(extracted.data_security.collecting_health_info).lower()))
                    if extracted.data_security.phi_shared_externally is not None:
                        facts_to_add.append(("confidentiality.phi_shared", str(extracted.data_security.phi_shared_externally).lower()))
                    if extracted.data_security.phi_shared_with:
                        facts_to_add.append(("confidentiality.phi_shared_with", ", ".join(extracted.data_security.phi_shared_with)))

                # Regulatory status
                if extracted.regulatory:
                    if extracted.regulatory.fda_regulated is not None:
                        facts_to_add.append(("study.fda_regulations_apply", str(extracted.regulatory.fda_regulated).lower()))
                    if extracted.regulatory.ind_number:
                        facts_to_add.append(("study.ind_number", extracted.regulatory.ind_number))
                    if extracted.regulatory.ide_number:
                        facts_to_add.append(("study.ide_number", extracted.regulatory.ide_number))
                    if extracted.regulatory.uses_ionizing_radiation is not None:
                        facts_to_add.append(("study.ionizing_radiation", str(extracted.regulatory.uses_ionizing_radiation).lower()))
                    if extracted.regulatory.involves_infectious_agents is not None:
                        facts_to_add.append(("study.ibc_infectious", str(extracted.regulatory.involves_infectious_agents).lower()))
                    if extracted.regulatory.involves_recombinant_dna is not None:
                        facts_to_add.append(("study.ibc_recombinant", str(extracted.regulatory.involves_recombinant_dna).lower()))
                    if extracted.regulatory.involves_hazardous_materials is not None:
                        facts_to_add.append(("study.ibc_hazardous", str(extracted.regulatory.involves_hazardous_materials).lower()))
                    if extracted.regulatory.is_student_project is not None:
                        facts_to_add.append(("study.is_student_project", str(extracted.regulatory.is_student_project).lower()))

                # Add all facts to knowledge base
                for key, value in facts_to_add:
                    if value:  # Only add non-empty values
                        await kb_service.add_fact(
                            kb_id=kb_id,
                            key=key,
                            value=value,
                            source=FactSource.DOCUMENT,
                            confidence=0.85,
                            source_reference=f"Extracted from {filename}",
                        )
                        facts_extracted += 1

                logger.info(f"Extracted {facts_extracted} facts from {filename}")

            except Exception as e:
                logger.warning(f"Failed to extract facts from document: {e}")
                # Continue even if extraction fails - document is still uploaded

        return {
            "success": True,
            "document_id": str(doc_id) if doc_id else None,
            "filename": filename,
            "doc_type": doc_type,
            "facts_extracted": facts_extracted,
            "quality_score": extraction_result.quality_score if extraction_result else None,
            "message": f"Document uploaded successfully. Extracted {facts_extracted} facts.",
        }

    except Exception as e:
        logger.error(f"Failed to upload document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get(
    "/projects/{project_id}/knowledge/stats",
    response_model=KnowledgeBaseStatsResponse,
    summary="Get knowledge base statistics",
)
async def get_knowledge_stats(
    project_id: str,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Get statistics about the project knowledge base."""
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    kb_service = get_knowledge_base_service(db)
    embeddings_service = get_knowledge_embeddings_service(db)

    try:
        kb = await kb_service.get_by_project(project_uuid)
        if not kb:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Knowledge base not found",
            )

        kb_id = kb["id"]

        # Get counts
        facts = await kb_service.get_facts(kb_id)
        documents = await kb_service.get_documents(kb_id)
        embedding_count = await embeddings_service.get_embedding_count(kb_id)

        return KnowledgeBaseStatsResponse(
            project_id=project_uuid,
            total_facts=len(facts),
            total_documents=len(documents),
            total_embeddings=embedding_count,
            completion_percentage=kb.get("completion_percentage", 0.0),
            last_updated=kb.get("updated_at"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.delete(
    "/projects/{project_id}/knowledge",
    summary="Clear knowledge base",
)
async def clear_knowledge_base(
    project_id: str,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Clear all data from the project knowledge base."""
    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    kb_service = get_knowledge_base_service(db)
    embeddings_service = get_knowledge_embeddings_service(db)

    try:
        kb = await kb_service.get_by_project(project_uuid)
        if kb:
            kb_id = kb["id"]

            # Delete embeddings
            await embeddings_service.delete_all_for_kb(kb_id)

            # Delete knowledge base
            await kb_service.delete(kb_id)

        return {"success": True, "message": "Knowledge base cleared"}

    except Exception as e:
        logger.error(f"Failed to clear knowledge base: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
