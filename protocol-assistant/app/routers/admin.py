"""
Admin endpoints for Protocol Assistant.

This module provides administrative endpoints for:
- Prompt version management and A/B testing
- Feedback analysis
- Knowledge base management
- Usage analytics and cost tracking
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import datetime, timedelta, date
from typing import Optional
from pydantic import BaseModel, Field
import logging

from app.database import get_async_session
from app.learning.prompt_management import PromptManager
from app.learning.feedback import FeedbackService, FeedbackRequest
from app.learning.rag import CuratedKnowledgeBase
from app.analytics.service import AnalyticsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================================
# Authentication Placeholder
# ============================================================

def require_admin():
    """
    Require admin privileges for endpoint access.

    This is a placeholder implementation. In production, this should:
    - Validate JWT token
    - Check admin role/permissions
    - Return user info
    """
    # Placeholder - always returns True
    return True


def get_current_admin_id() -> UUID:
    """
    Get the current admin user ID.

    Placeholder implementation.
    """
    return UUID("00000000-0000-0000-0000-000000000001")


def get_current_institution_id() -> UUID:
    """
    Get the current institution ID from auth context.

    Placeholder implementation.
    """
    return UUID("00000000-0000-0000-0000-000000000001")


# ============================================================
# Request/Response Models
# ============================================================

class PromptCreateRequest(BaseModel):
    """Request to create a new prompt version."""

    prompt_key: str = Field(..., description="Unique identifier for the prompt")
    content: str = Field(..., description="The prompt template content")
    name: Optional[str] = Field(None, description="Human-readable version name")
    description: Optional[str] = Field(None, description="Description of changes")
    system_prompt: Optional[str] = Field(None, description="Optional system prompt")
    parameters: Optional[dict] = Field(None, description="LLM parameters")


class PromptActivateRequest(BaseModel):
    """Request to activate a prompt version."""

    traffic_percentage: float = Field(
        100,
        ge=0,
        le=100,
        description="Percentage of traffic to route to this version"
    )


class PromptVersionResponse(BaseModel):
    """Response for prompt version."""

    id: int
    prompt_key: str
    version: int
    name: Optional[str]
    content: str
    is_active: bool
    is_default: bool
    traffic_percentage: float
    success_rate: Optional[float]
    avg_quality_score: Optional[float]
    sample_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class KnowledgeDocRequest(BaseModel):
    """Request to add a knowledge document."""

    title: str = Field(..., description="Document title")
    content: str = Field(..., description="Document content")
    category: str = Field(..., description="Category for organization")
    description: Optional[str] = Field(None)
    source_url: Optional[str] = Field(None)
    tags: Optional[list[str]] = Field(None)
    metadata: Optional[dict] = Field(None)
    is_public: bool = Field(False, description="Visible to all institutions")


class KnowledgeDocResponse(BaseModel):
    """Response for knowledge document."""

    id: str
    title: str
    category: str
    description: Optional[str]
    is_active: bool
    word_count: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class FeedbackSubmitRequest(BaseModel):
    """Request to submit feedback."""

    session_id: UUID
    output_id: str
    rating: int = Field(..., ge=1, le=5)
    feedback_type: str
    comment: Optional[str] = None
    corrections: Optional[dict] = None
    prompt_version_id: Optional[int] = None


# ============================================================
# Prompt Management Endpoints
# ============================================================

@router.get("/prompts/keys")
async def list_prompt_keys(
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
):
    """
    List all unique prompt keys.

    Returns all prompt keys that have at least one version defined.
    """
    manager = PromptManager(db)
    keys = await manager.get_all_prompt_keys()
    return {"prompt_keys": keys}


@router.get("/prompts/{prompt_key}/versions")
async def list_prompt_versions(
    prompt_key: str,
    include_inactive: bool = Query(True, description="Include inactive versions"),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
):
    """
    List all versions of a prompt.

    Returns versions sorted by version number descending (newest first).
    """
    manager = PromptManager(db)
    versions = await manager.get_versions(prompt_key, include_inactive=include_inactive)
    return {
        "prompt_key": prompt_key,
        "versions": [
            PromptVersionResponse(
                id=v.id,
                prompt_key=v.prompt_key,
                version=v.version,
                name=v.name,
                content=v.content,
                is_active=v.is_active,
                is_default=v.is_default,
                traffic_percentage=v.traffic_percentage,
                success_rate=v.success_rate,
                avg_quality_score=v.avg_quality_score,
                sample_count=v.sample_count,
                created_at=v.created_at,
            )
            for v in versions
        ],
    }


@router.post("/prompts", status_code=status.HTTP_201_CREATED)
async def create_prompt_version(
    request: PromptCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    admin_id: UUID = Depends(get_current_admin_id),
):
    """
    Create a new prompt version.

    The version is created in inactive state and must be explicitly
    activated through the activation endpoint.
    """
    manager = PromptManager(db)

    version = await manager.create_version(
        prompt_key=request.prompt_key,
        content=request.content,
        created_by=admin_id,
        name=request.name,
        description=request.description,
        system_prompt=request.system_prompt,
        parameters=request.parameters,
    )

    return PromptVersionResponse(
        id=version.id,
        prompt_key=version.prompt_key,
        version=version.version,
        name=version.name,
        content=version.content,
        is_active=version.is_active,
        is_default=version.is_default,
        traffic_percentage=version.traffic_percentage,
        success_rate=version.success_rate,
        avg_quality_score=version.avg_quality_score,
        sample_count=version.sample_count,
        created_at=version.created_at,
    )


@router.get("/prompts/versions/{version_id}")
async def get_prompt_version(
    version_id: int,
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
):
    """Get a specific prompt version by ID."""
    manager = PromptManager(db)
    version = await manager.get_version(version_id)

    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prompt version {version_id} not found",
        )

    return PromptVersionResponse(
        id=version.id,
        prompt_key=version.prompt_key,
        version=version.version,
        name=version.name,
        content=version.content,
        is_active=version.is_active,
        is_default=version.is_default,
        traffic_percentage=version.traffic_percentage,
        success_rate=version.success_rate,
        avg_quality_score=version.avg_quality_score,
        sample_count=version.sample_count,
        created_at=version.created_at,
    )


@router.post("/prompts/versions/{version_id}/activate")
async def activate_prompt(
    version_id: int,
    request: PromptActivateRequest,
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    admin_id: UUID = Depends(get_current_admin_id),
):
    """
    Activate a prompt version.

    If traffic_percentage is 100, this version becomes the sole active
    version. Otherwise, it's added to the A/B test pool.
    """
    manager = PromptManager(db)

    try:
        version = await manager.activate_version(
            version_id,
            admin_id,
            request.traffic_percentage,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    return {
        "status": "success",
        "message": f"Activated version {version.version} with {request.traffic_percentage}% traffic",
        "version": PromptVersionResponse(
            id=version.id,
            prompt_key=version.prompt_key,
            version=version.version,
            name=version.name,
            content=version.content,
            is_active=version.is_active,
            is_default=version.is_default,
            traffic_percentage=version.traffic_percentage,
            success_rate=version.success_rate,
            avg_quality_score=version.avg_quality_score,
            sample_count=version.sample_count,
            created_at=version.created_at,
        ),
    }


@router.post("/prompts/versions/{version_id}/deactivate")
async def deactivate_prompt(
    version_id: int,
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
):
    """Deactivate a prompt version."""
    manager = PromptManager(db)

    try:
        version = await manager.deactivate_version(version_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    return {
        "status": "success",
        "message": f"Deactivated version {version.version}",
    }


@router.get("/prompts/compare/{version_a}/{version_b}")
async def compare_prompt_versions(
    version_a: int,
    version_b: int,
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
):
    """
    Compare performance metrics between two prompt versions.

    Useful for A/B test analysis.
    """
    manager = PromptManager(db)

    try:
        comparison = await manager.compare_versions(version_a, version_b)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    return comparison


# ============================================================
# Feedback Endpoints
# ============================================================

@router.post("/feedback")
async def submit_feedback(
    request: FeedbackSubmitRequest,
    db: AsyncSession = Depends(get_async_session),
    admin_id: UUID = Depends(get_current_admin_id),
):
    """
    Submit feedback on AI output.

    This endpoint is typically called by users, not admins.
    """
    service = FeedbackService(db)

    feedback_data = FeedbackRequest(
        rating=request.rating,
        feedback_type=request.feedback_type,
        comment=request.comment,
        corrections=request.corrections,
    )

    fb = await service.record_feedback(
        session_id=request.session_id,
        output_id=request.output_id,
        user_id=admin_id,  # Would be actual user in production
        feedback=feedback_data,
        prompt_version_id=request.prompt_version_id,
    )

    return {
        "status": "success",
        "feedback_id": str(fb.id),
    }


@router.get("/feedback/summary")
async def get_feedback_summary(
    days: int = Query(30, ge=1, le=365, description="Number of days to include"),
    prompt_version_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """
    Get aggregated feedback summary.

    Returns rating distribution, averages, and trends.
    """
    service = FeedbackService(db)
    summary = await service.get_feedback_summary(
        prompt_version_id=prompt_version_id,
        institution_id=institution_id,
        days=days,
    )
    return summary


@router.get("/feedback/low-rated")
async def get_low_rated_outputs(
    threshold: int = Query(2, ge=1, le=5, description="Maximum rating to include"),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """
    Get low-rated outputs for review.

    Helps identify areas for prompt improvement.
    """
    service = FeedbackService(db)
    feedbacks = await service.get_low_rated_outputs(
        threshold=threshold,
        institution_id=institution_id,
        days=days,
        limit=limit,
    )

    return {
        "count": len(feedbacks),
        "feedbacks": [
            {
                "id": str(f.id),
                "rating": f.rating,
                "feedback_type": f.feedback_type,
                "comment": f.comment,
                "issue_category": f.issue_category,
                "created_at": f.created_at,
            }
            for f in feedbacks
        ],
    }


@router.get("/feedback/issues")
async def get_common_issues(
    days: int = Query(30, ge=1, le=365),
    min_occurrences: int = Query(3, ge=1),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
):
    """
    Get common issue patterns from feedback.

    Identifies recurring problems for targeted improvements.
    """
    service = FeedbackService(db)
    issues = await service.get_common_issues(
        days=days,
        min_occurrences=min_occurrences,
    )
    return {"issues": issues}


# ============================================================
# Knowledge Base Endpoints
# ============================================================

@router.get("/knowledge/categories")
async def list_knowledge_categories(
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """List all knowledge base categories."""
    kb = CuratedKnowledgeBase(db)
    categories = await kb.get_categories(institution_id=institution_id)
    return {"categories": categories}


@router.get("/knowledge/stats")
async def get_knowledge_stats(
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """Get knowledge base statistics."""
    kb = CuratedKnowledgeBase(db)
    stats = await kb.get_stats(institution_id=institution_id)
    return stats


@router.post("/knowledge", status_code=status.HTTP_201_CREATED)
async def add_knowledge_document(
    request: KnowledgeDocRequest,
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    admin_id: UUID = Depends(get_current_admin_id),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """
    Add document to knowledge base.

    Documents are used to augment AI prompts with relevant context.
    """
    kb = CuratedKnowledgeBase(db)

    doc = await kb.add_document(
        title=request.title,
        content=request.content,
        category=request.category,
        added_by=admin_id,
        institution_id=institution_id if not request.is_public else None,
        description=request.description,
        source_url=request.source_url,
        tags=request.tags,
        metadata=request.metadata,
        is_public=request.is_public,
    )

    return KnowledgeDocResponse(
        id=str(doc.id),
        title=doc.title,
        category=doc.category,
        description=doc.description,
        is_active=doc.is_active,
        word_count=doc.word_count,
        created_at=doc.created_at,
    )


@router.get("/knowledge/{document_id}")
async def get_knowledge_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
):
    """Get a specific knowledge document."""
    kb = CuratedKnowledgeBase(db)
    doc = await kb.get_document(document_id)

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found",
        )

    return {
        "id": str(doc.id),
        "title": doc.title,
        "content": doc.content,
        "category": doc.category,
        "description": doc.description,
        "source_url": doc.source_url,
        "tags": doc.tags,
        "metadata": doc.doc_metadata,
        "is_active": doc.is_active,
        "is_public": doc.is_public,
        "word_count": doc.word_count,
        "version": doc.version,
        "created_at": doc.created_at,
        "updated_at": doc.updated_at,
    }


@router.delete("/knowledge/{document_id}")
async def delete_knowledge_document(
    document_id: UUID,
    hard_delete: bool = Query(False, description="Permanently delete"),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    admin_id: UUID = Depends(get_current_admin_id),
):
    """
    Delete a knowledge document.

    By default performs soft delete. Use hard_delete=true for permanent removal.
    """
    kb = CuratedKnowledgeBase(db)
    deleted = await kb.delete_document(
        document_id=document_id,
        deleted_by=admin_id,
        hard_delete=hard_delete,
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document {document_id} not found",
        )

    return {
        "status": "success",
        "message": f"Document {'permanently deleted' if hard_delete else 'deactivated'}",
    }


@router.get("/knowledge/search")
async def search_knowledge(
    query: str = Query(..., min_length=1),
    category: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_async_session),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """
    Search knowledge base.

    Returns relevant documents ranked by relevance score.
    """
    kb = CuratedKnowledgeBase(db)
    categories = [category] if category else None
    results = await kb.search(
        query=query,
        categories=categories,
        institution_id=institution_id,
        limit=limit,
    )
    return {"query": query, "results": results}


@router.get("/knowledge/category/{category}")
async def get_documents_by_category(
    category: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """Get all documents in a category."""
    kb = CuratedKnowledgeBase(db)
    docs = await kb.get_documents_by_category(
        category=category,
        institution_id=institution_id,
        limit=limit,
    )

    return {
        "category": category,
        "count": len(docs),
        "documents": [
            KnowledgeDocResponse(
                id=str(doc.id),
                title=doc.title,
                category=doc.category,
                description=doc.description,
                is_active=doc.is_active,
                word_count=doc.word_count,
                created_at=doc.created_at,
            )
            for doc in docs
        ],
    }


# ============================================================
# Analytics Endpoints
# ============================================================

@router.get("/analytics/usage")
async def get_usage_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """
    Get usage analytics summary.

    Defaults to last 30 days if dates not specified.
    """
    if not start_date:
        start_date = (datetime.utcnow() - timedelta(days=30)).date()
    if not end_date:
        end_date = datetime.utcnow().date()

    service = AnalyticsService(db)
    summary = await service.get_usage_summary(institution_id, start_date, end_date)

    return {
        "period": {
            "start_date": str(start_date),
            "end_date": str(end_date),
        },
        "summary": summary,
    }


@router.get("/analytics/quality")
async def get_quality_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """Get quality metrics for AI outputs."""
    if not start_date:
        start_date = (datetime.utcnow() - timedelta(days=30)).date()
    if not end_date:
        end_date = datetime.utcnow().date()

    service = AnalyticsService(db)
    metrics = await service.get_quality_metrics(institution_id, start_date, end_date)

    return {
        "period": {
            "start_date": str(start_date),
            "end_date": str(end_date),
        },
        "metrics": metrics,
    }


@router.get("/analytics/costs")
async def get_cost_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """
    Get cost analytics.

    Provides cost breakdown by provider and task, plus monthly projections.
    """
    if not start_date:
        start_date = (datetime.utcnow() - timedelta(days=30)).date()
    if not end_date:
        end_date = datetime.utcnow().date()

    service = AnalyticsService(db)
    costs = await service.get_cost_analysis(institution_id, start_date, end_date)

    return {
        "period": {
            "start_date": str(start_date),
            "end_date": str(end_date),
        },
        "costs": costs,
    }


@router.get("/analytics/trends")
async def get_daily_trends(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """Get daily trends for visualization."""
    if not start_date:
        start_date = (datetime.utcnow() - timedelta(days=30)).date()
    if not end_date:
        end_date = datetime.utcnow().date()

    service = AnalyticsService(db)
    trends = await service.get_daily_trends(institution_id, start_date, end_date)

    return {
        "period": {
            "start_date": str(start_date),
            "end_date": str(end_date),
        },
        "trends": trends,
    }


@router.get("/analytics/features")
async def get_feature_usage(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_async_session),
    _: bool = Depends(require_admin),
    institution_id: UUID = Depends(get_current_institution_id),
):
    """Get top features by usage."""
    if not start_date:
        start_date = (datetime.utcnow() - timedelta(days=30)).date()
    if not end_date:
        end_date = datetime.utcnow().date()

    service = AnalyticsService(db)
    features = await service.get_top_features(
        institution_id=institution_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )

    return {
        "period": {
            "start_date": str(start_date),
            "end_date": str(end_date),
        },
        "features": features,
    }
