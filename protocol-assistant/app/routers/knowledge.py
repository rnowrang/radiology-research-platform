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

            # Add embedding for semantic search
            try:
                await embeddings_service.store_embedding(
                    kb_id=kb_id,
                    content=f"{fact_req.key}: {fact_req.value}",
                    content_type=ContentType.FACT,
                    source_key=f"fact:{fact_req.key}",
                )
            except Exception as e:
                logger.warning(f"Failed to store embedding for fact {fact_req.key}: {e}")

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
                facts_to_add = []

                if extracted.study_title:
                    facts_to_add.append(("study_title", extracted.study_title))
                if extracted.principal_investigator:
                    facts_to_add.append(("principal_investigator", extracted.principal_investigator))
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
                        facts_to_add.append(("sample_size", extracted.methodology.sample_size))
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
                        facts_to_add.append(("data_collection_timeline", extracted.data_collection.timeline))

                # Risks and benefits
                if extracted.risks_benefits:
                    if extracted.risks_benefits.risks:
                        facts_to_add.append(("risks", "\n".join(extracted.risks_benefits.risks)))
                    if extracted.risks_benefits.benefits:
                        facts_to_add.append(("benefits", "\n".join(extracted.risks_benefits.benefits)))
                    if extracted.risks_benefits.mitigation:
                        facts_to_add.append(("risk_mitigation", "\n".join(extracted.risks_benefits.mitigation)))

                if extracted.confidentiality_measures:
                    facts_to_add.append(("confidentiality_measures", extracted.confidentiality_measures))

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
