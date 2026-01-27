"""Coherence API Router.

Provides endpoints for:
- Project coherence status
- Conflict listing and resolution
- Rule management
- Real-time and batch validation
"""

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.rules import CoherenceRule, RuleEvaluation
from app.models.conflicts import (
    Conflict,
    ConflictResolution,
    ConflictStatus,
    CoherenceStatus,
)
from app.services.rule_engine import get_rule_engine
from app.services.conflict_detector import get_conflict_detector

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/coherence", tags=["coherence"])

# Settings
settings = get_settings()


# ============================================================================
# Dependencies
# ============================================================================

async def get_db():
    """Get database session - placeholder for dependency injection."""
    # This will be properly configured in main.py
    from app.database import get_async_session
    async for session in get_async_session():
        yield session


async def verify_internal_key(
    x_internal_api_key: Optional[str] = Header(None),
) -> bool:
    """Verify internal API key for service-to-service calls."""
    if not settings.INTERNAL_API_KEY:
        return True
    if x_internal_api_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal API key")
    return True


# ============================================================================
# Request/Response Models
# ============================================================================

class RealtimeCheckRequest(BaseModel):
    """Request for real-time coherence check."""
    fact_key: str = Field(..., description="The fact key being changed")
    new_value: Any = Field(..., description="The new value")
    source: str = Field(..., description="Source of the change")


class RealtimeCheckResponse(BaseModel):
    """Response from real-time check."""
    conflicts: List[Conflict]
    checked_in_ms: float


class ValidationRequest(BaseModel):
    """Request for full validation."""
    persist_conflicts: bool = Field(default=True, description="Whether to save detected conflicts")


class RulesResponse(BaseModel):
    """List of coherence rules."""
    rules: List[CoherenceRule]
    total: int


# ============================================================================
# Status Endpoints
# ============================================================================

@router.get("/projects/{project_id}/status", response_model=CoherenceStatus)
async def get_project_coherence_status(
    project_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_internal_key),
):
    """Get overall coherence status for a project.

    Returns:
        CoherenceStatus with score, conflict counts, and top issues
    """
    detector = get_conflict_detector(db)
    return await detector.get_coherence_status(project_id)


@router.post("/projects/{project_id}/validate", response_model=CoherenceStatus)
async def validate_project(
    project_id: UUID,
    request: ValidationRequest = ValidationRequest(),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_internal_key),
):
    """Trigger full validation of a project.

    Runs all coherence rules and returns updated status.
    """
    detector = get_conflict_detector(db)
    return await detector.check_full(project_id, persist=request.persist_conflicts)


@router.post("/projects/{project_id}/check-realtime", response_model=RealtimeCheckResponse)
async def check_realtime(
    project_id: UUID,
    request: RealtimeCheckRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_internal_key),
):
    """Perform real-time coherence check for a fact change.

    This is the hot-path endpoint that must complete quickly (<100ms).
    Used when a user changes a value to immediately detect conflicts.
    """
    import time
    start = time.time()

    detector = get_conflict_detector(db)
    conflicts = await detector.check_realtime(
        project_id=project_id,
        fact_key=request.fact_key,
        new_value=request.new_value,
        source=request.source,
    )

    elapsed = (time.time() - start) * 1000
    return RealtimeCheckResponse(conflicts=conflicts, checked_in_ms=elapsed)


# ============================================================================
# Conflict Endpoints
# ============================================================================

@router.get("/projects/{project_id}/conflicts", response_model=List[Conflict])
async def get_project_conflicts(
    project_id: UUID,
    status: Optional[ConflictStatus] = Query(None, description="Filter by status"),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_internal_key),
):
    """Get all conflicts for a project.

    Args:
        status: Optional filter by conflict status (active, resolved, etc.)
    """
    detector = get_conflict_detector(db)
    return await detector.get_conflicts(project_id, status=status)


@router.get("/projects/{project_id}/conflicts/{conflict_id}", response_model=Conflict)
async def get_conflict(
    project_id: UUID,
    conflict_id: str,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_internal_key),
):
    """Get details of a specific conflict."""
    detector = get_conflict_detector(db)
    conflicts = await detector.get_conflicts(project_id)

    for conflict in conflicts:
        if conflict.conflict_id == conflict_id:
            return conflict

    raise HTTPException(status_code=404, detail="Conflict not found")


@router.post("/projects/{project_id}/conflicts/{conflict_id}/resolve", response_model=Conflict)
async def resolve_conflict(
    project_id: UUID,
    conflict_id: str,
    resolution: ConflictResolution,
    x_user_id: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_internal_key),
):
    """Resolve a conflict.

    Accepts a resolution choice and optionally propagates changes.
    """
    user_id = x_user_id or "system"

    detector = get_conflict_detector(db)
    result = await detector.resolve_conflict(
        conflict_id=conflict_id,
        resolution=resolution,
        user_id=user_id,
    )

    if not result:
        raise HTTPException(status_code=404, detail="Conflict not found")

    return result


# ============================================================================
# Rule Endpoints
# ============================================================================

@router.get("/rules", response_model=RulesResponse)
async def list_rules(
    enabled_only: bool = Query(True, description="Only return enabled rules"),
    category: Optional[str] = Query(None, description="Filter by category"),
    _: bool = Depends(verify_internal_key),
):
    """List all coherence rules.

    Returns the rules that the coherence engine checks against.
    """
    engine = get_rule_engine()

    if category:
        rules = engine.get_rules_by_category(category)
    else:
        rules = engine.get_all_rules(enabled_only=enabled_only)

    return RulesResponse(rules=rules, total=len(rules))


@router.get("/rules/{rule_id}", response_model=CoherenceRule)
async def get_rule(
    rule_id: str,
    _: bool = Depends(verify_internal_key),
):
    """Get a specific rule by ID."""
    engine = get_rule_engine()
    rule = engine.get_rule(rule_id)

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    return rule


@router.post("/rules/{rule_id}/evaluate", response_model=RuleEvaluation)
async def evaluate_rule(
    rule_id: str,
    project_id: UUID = Query(..., description="Project to evaluate against"),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_internal_key),
):
    """Evaluate a single rule against a project.

    Useful for testing rules or checking specific conditions.
    """
    engine = get_rule_engine()
    rule = engine.get_rule(rule_id)

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    detector = get_conflict_detector(db)
    kb = await detector._get_knowledge_base(project_id)

    if not kb:
        raise HTTPException(status_code=404, detail="Project knowledge base not found")

    result = engine.evaluate_rule(rule, kb)
    return result
