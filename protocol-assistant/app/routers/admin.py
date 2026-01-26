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
from app.middleware.auth import (
    UserContext,
    get_current_user,
    require_admin,
    get_current_admin_id,
    get_current_institution_id,
    get_optional_institution_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


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
    user: UserContext = Depends(require_admin()),
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
    user: UserContext = Depends(require_admin()),
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
    user: UserContext = Depends(require_admin()),
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
    user: UserContext = Depends(require_admin()),
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
    user: UserContext = Depends(require_admin()),
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
    user: UserContext = Depends(get_current_user),
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
        user_id=user.id,
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
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
    user: UserContext = Depends(require_admin()),
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """List all knowledge base categories."""
    kb = CuratedKnowledgeBase(db)
    categories = await kb.get_categories(institution_id=institution_id)
    return {"categories": categories}


@router.get("/knowledge/stats")
async def get_knowledge_stats(
    db: AsyncSession = Depends(get_async_session),
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """Get knowledge base statistics."""
    kb = CuratedKnowledgeBase(db)
    stats = await kb.get_stats(institution_id=institution_id)
    return stats


@router.post("/knowledge", status_code=status.HTTP_201_CREATED)
async def add_knowledge_document(
    request: KnowledgeDocRequest,
    db: AsyncSession = Depends(get_async_session),
    admin_id: UUID = Depends(get_current_admin_id),
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
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
    user: UserContext = Depends(require_admin()),
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
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
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
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


# ============================================================
# Feature Flag Endpoints
# ============================================================

from app.services.feature_flags import get_feature_flag_service


class FeatureFlagUpdateRequest(BaseModel):
    """Request to update a feature flag."""

    is_enabled: bool = Field(..., description="Enable or disable the flag")
    rollout_percentage: Optional[float] = Field(
        None, ge=0, le=100, description="Rollout percentage (0-100)"
    )
    reason: Optional[str] = Field(None, description="Reason for the change")


class InstitutionOverrideRequest(BaseModel):
    """Request to set an institution override."""

    is_enabled: bool = Field(..., description="Override value")
    reason: Optional[str] = Field(None, description="Reason for the override")
    expires_at: Optional[datetime] = Field(None, description="Optional expiration")


@router.get("/feature-flags")
async def list_feature_flags(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: AsyncSession = Depends(get_async_session),
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """
    List all feature flags with their effective values.

    Returns flags with institution-specific overrides applied if available.
    """
    service = get_feature_flag_service(db)
    flags = await service.get_all_flags(
        institution_id=institution_id,
        user_id=user.id,
        category=category,
    )

    return {"flags": flags}


@router.get("/feature-flags/{flag_name}")
async def get_feature_flag(
    flag_name: str,
    db: AsyncSession = Depends(get_async_session),
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """Get details for a specific feature flag."""
    service = get_feature_flag_service(db)
    details = await service.get_flag_details(flag_name, institution_id)

    if not details:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feature flag '{flag_name}' not found",
        )

    # Add effective value for this context
    details["effective_value"] = await service.is_enabled(
        flag_name,
        institution_id=institution_id,
        user_id=user.id,
    )

    return details


@router.put("/feature-flags/{flag_name}")
async def update_feature_flag(
    flag_name: str,
    request: FeatureFlagUpdateRequest,
    db: AsyncSession = Depends(get_async_session),
    admin_id: UUID = Depends(get_current_admin_id),
):
    """
    Update a feature flag's global default.

    This changes the default value for all users/institutions
    that don't have an override.
    """
    service = get_feature_flag_service(db)

    try:
        flag = await service.set_flag(
            flag_name=flag_name,
            is_enabled=request.is_enabled,
            admin_id=admin_id,
            rollout_percentage=request.rollout_percentage,
            reason=request.reason,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    return {
        "status": "success",
        "message": f"Flag '{flag_name}' updated to {request.is_enabled}",
        "flag": {
            "name": flag.name,
            "is_enabled": flag.is_enabled,
            "rollout_percentage": flag.rollout_percentage,
        },
    }


@router.get("/feature-flags/institution/{institution_id}/overrides")
async def get_institution_overrides(
    institution_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(require_admin()),
):
    """Get all feature flag overrides for an institution."""
    service = get_feature_flag_service(db)
    overrides = await service.get_institution_overrides(institution_id)
    return {"institution_id": str(institution_id), "overrides": overrides}


@router.put("/feature-flags/{flag_name}/institution/{institution_id}")
async def set_institution_override(
    flag_name: str,
    institution_id: UUID,
    request: InstitutionOverrideRequest,
    db: AsyncSession = Depends(get_async_session),
    admin_id: UUID = Depends(get_current_admin_id),
):
    """
    Set an institution-level override for a feature flag.

    Institution overrides take precedence over global defaults.
    """
    service = get_feature_flag_service(db)

    try:
        override = await service.set_institution_override(
            flag_name=flag_name,
            institution_id=institution_id,
            is_enabled=request.is_enabled,
            admin_id=admin_id,
            reason=request.reason,
            expires_at=request.expires_at,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    return {
        "status": "success",
        "message": f"Override for '{flag_name}' set to {request.is_enabled} for institution {institution_id}",
        "override": {
            "flag_name": flag_name,
            "institution_id": str(institution_id),
            "is_enabled": override.is_enabled,
            "expires_at": override.expires_at,
        },
    }


@router.delete("/feature-flags/{flag_name}/institution/{institution_id}")
async def remove_institution_override(
    flag_name: str,
    institution_id: UUID,
    reason: Optional[str] = Query(None, description="Reason for removal"),
    db: AsyncSession = Depends(get_async_session),
    admin_id: UUID = Depends(get_current_admin_id),
):
    """Remove an institution-level override."""
    service = get_feature_flag_service(db)

    removed = await service.remove_institution_override(
        flag_name=flag_name,
        institution_id=institution_id,
        admin_id=admin_id,
        reason=reason,
    )

    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No override found for '{flag_name}' in institution {institution_id}",
        )

    return {
        "status": "success",
        "message": f"Override for '{flag_name}' removed from institution {institution_id}",
    }


@router.get("/feature-flags/audit")
async def get_feature_flag_audit(
    flag_name: Optional[str] = Query(None, description="Filter by flag name"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_async_session),
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """Get audit log for feature flag changes."""
    service = get_feature_flag_service(db)
    audit_entries = await service.get_audit_log(
        flag_name=flag_name,
        institution_id=institution_id,
        limit=limit,
    )

    return {
        "entries": [
            {
                "id": str(entry.id),
                "flag_name": entry.flag_name,
                "action": entry.action,
                "actor_id": str(entry.actor_id) if entry.actor_id else None,
                "previous_value": entry.previous_value,
                "new_value": entry.new_value,
                "reason": entry.reason,
                "created_at": entry.created_at,
            }
            for entry in audit_entries
        ]
    }


@router.post("/feature-flags/seed")
async def seed_default_flags(
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(require_admin()),
):
    """
    Seed the database with default feature flags.

    This is typically called once during initial setup.
    Only creates flags that don't already exist.
    """
    service = get_feature_flag_service(db)
    created = await service.seed_default_flags()

    return {
        "status": "success",
        "message": f"Created {created} new feature flags",
    }


# ============================================================
# Quality Monitoring Endpoints
# ============================================================

from app.services.quality_monitor import get_quality_monitor, QualityStatus


class QualityCheckRequest(BaseModel):
    """Request for quality check."""

    prompt_key: Optional[str] = Field(None, description="Specific prompt to check")
    hours: int = Field(24, ge=1, le=168, description="Hours of data to analyze")


class RollbackRequest(BaseModel):
    """Request for manual rollback."""

    prompt_key: str = Field(..., description="Prompt key to rollback")
    reason: Optional[str] = Field(None, description="Reason for rollback")


@router.get("/quality/status")
async def get_quality_status(
    prompt_key: Optional[str] = Query(None, description="Specific prompt to check"),
    hours: int = Query(24, ge=1, le=168, description="Hours of data to analyze"),
    db: AsyncSession = Depends(get_async_session),
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """
    Get current quality status.

    Returns overall or prompt-specific quality metrics including:
    - Average rating
    - Success rate
    - Quality status (healthy/warning/degraded/critical)
    - Trend direction
    - Deviation from baseline
    """
    monitor = get_quality_monitor(db)
    metrics = await monitor.check_quality(
        prompt_key=prompt_key,
        hours=hours,
        institution_id=institution_id,
    )

    return {
        "prompt_key": prompt_key,
        "hours_analyzed": hours,
        "metrics": {
            "avg_rating": metrics.avg_rating,
            "rating_count": metrics.rating_count,
            "success_rate": metrics.success_rate,
            "low_rating_count": metrics.low_rating_count,
            "status": metrics.status.value,
            "trend": metrics.trend,
            "baseline_rating": metrics.baseline_rating,
            "deviation_percentage": metrics.deviation_percentage,
        },
    }


@router.get("/quality/trends")
async def get_quality_trends(
    prompt_key: Optional[str] = Query(None, description="Specific prompt to analyze"),
    days: int = Query(7, ge=1, le=30, description="Days of history"),
    db: AsyncSession = Depends(get_async_session),
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """
    Get daily quality trends.

    Returns daily metrics for charting quality over time.
    """
    monitor = get_quality_monitor(db)
    trends = await monitor.get_quality_trends(
        prompt_key=prompt_key,
        days=days,
        institution_id=institution_id,
    )

    return {
        "prompt_key": prompt_key,
        "days": days,
        "trends": trends,
    }


@router.post("/quality/check-rollback")
async def check_and_rollback(
    prompt_key: str = Query(..., description="Prompt key to check"),
    db: AsyncSession = Depends(get_async_session),
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """
    Check quality and trigger auto-rollback if needed.

    This manually triggers the auto-rollback check for a specific prompt.
    Useful for testing or immediate response to issues.
    """
    monitor = get_quality_monitor(db)
    alert = await monitor.check_and_auto_rollback(
        prompt_key=prompt_key,
        institution_id=institution_id,
    )

    if alert:
        return {
            "status": "rollback_triggered",
            "alert": {
                "type": alert.type.value,
                "severity": alert.severity,
                "message": alert.message,
                "details": alert.details,
            },
        }
    else:
        return {
            "status": "no_action_needed",
            "message": "Quality is within acceptable thresholds or insufficient data for analysis",
        }


@router.post("/quality/manual-rollback")
async def manual_rollback(
    request: RollbackRequest,
    db: AsyncSession = Depends(get_async_session),
    admin_id: UUID = Depends(get_current_admin_id),
):
    """
    Manually rollback a prompt to its previous version.

    Use this for immediate response to quality issues without waiting
    for automatic threshold triggers.
    """
    from app.learning.prompt_management import PromptManager

    manager = PromptManager(db)

    # Get current and previous versions
    versions = await manager.get_versions(request.prompt_key)

    if len(versions) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot rollback: only one version exists",
        )

    # Find current active version
    current = next((v for v in versions if v.is_active and v.traffic_percentage == 100), None)
    if not current:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot rollback: no fully active version found",
        )

    # Find previous version
    sorted_versions = sorted(versions, key=lambda v: v.version, reverse=True)
    previous = next((v for v in sorted_versions if v.version < current.version), None)

    if not previous:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot rollback: no previous version available",
        )

    # Execute rollback
    await manager.deactivate_version(current.id)
    await manager.activate_version(previous.id, admin_id, traffic_percentage=100)

    logger.info(
        f"Manual rollback of '{request.prompt_key}' from v{current.version} to v{previous.version} "
        f"by admin {admin_id}. Reason: {request.reason}"
    )

    return {
        "status": "success",
        "message": f"Rolled back '{request.prompt_key}' from v{current.version} to v{previous.version}",
        "from_version": current.version,
        "to_version": previous.version,
        "reason": request.reason,
    }


@router.get("/quality/alerts")
async def get_quality_alerts(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_async_session),
    institution_id: Optional[UUID] = Depends(get_optional_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """
    Get recent quality and cost alerts.

    Returns alerts triggered by automatic monitoring including:
    - Quality degradation alerts
    - Cost threshold warnings
    - Auto-rollback notifications
    """
    monitor = get_quality_monitor(db)
    alerts = await monitor.get_recent_alerts(
        institution_id=institution_id,
        limit=limit,
    )

    return {
        "alerts": [
            {
                "type": alert.type.value,
                "severity": alert.severity,
                "message": alert.message,
                "details": alert.details,
                "prompt_key": alert.prompt_key,
                "created_at": alert.created_at.isoformat(),
            }
            for alert in alerts
        ]
    }


@router.post("/quality/check-costs")
async def check_cost_alerts(
    monthly_threshold: float = Query(..., ge=0, description="Monthly cost threshold in dollars"),
    db: AsyncSession = Depends(get_async_session),
    institution_id: UUID = Depends(get_current_institution_id),
    user: UserContext = Depends(require_admin()),
):
    """
    Check if costs are approaching or exceeding thresholds.

    Returns any cost-related alerts for the institution.
    """
    monitor = get_quality_monitor(db)
    alerts = await monitor.check_cost_alerts(
        institution_id=institution_id,
        monthly_threshold=monthly_threshold,
    )

    return {
        "alerts_count": len(alerts),
        "alerts": [
            {
                "type": alert.type.value,
                "severity": alert.severity,
                "message": alert.message,
                "details": alert.details,
            }
            for alert in alerts
        ],
    }
