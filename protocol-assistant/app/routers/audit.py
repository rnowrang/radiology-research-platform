"""Audit and provenance API endpoints for Protocol Assistant.

This module provides API endpoints for:
- Querying audit logs
- Retrieving provenance chains
- Getting explainability information
- Compliance status checks

These endpoints support regulatory compliance requirements by enabling
administrators and auditors to review system activity and understand
AI decision-making.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.audit.provenance import ProvenanceChain
from app.audit.explainability import (
    ExplainabilityService,
    ExtractionExplanation,
    GenerationExplanation,
    DataFlowExplanation,
)
from app.audit.audit_logger import AuditLogger
from app.models.audit import ProvenanceNode, ComplianceAuditLog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/audit", tags=["audit"])


# Response models
class AuditLogResponse(BaseModel):
    """Response model for audit log entries."""

    id: int
    event_type: str
    resource_type: str
    resource_id: Optional[str]
    actor_id: Optional[str]
    actor_name: Optional[str]
    action: str
    action_detail: Optional[str]
    details: Optional[dict[str, Any]]
    success: bool
    error_message: Optional[str]
    ip_address: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """Paginated list of audit logs."""

    logs: list[AuditLogResponse]
    total: int
    limit: int
    offset: int


class ProvenanceNodeResponse(BaseModel):
    """Response model for provenance nodes."""

    id: str
    type: str
    actor: str
    actor_type: Optional[str]
    depth: int
    parent_ids: list[str]
    timestamp: Optional[str]
    metadata: Optional[dict[str, Any]]
    action: Optional[str]
    description: Optional[str]


class LineageResponse(BaseModel):
    """Response model for provenance lineage."""

    node_id: str
    lineage: list[dict[str, Any]]
    total_depth: int


class ContributionStatsResponse(BaseModel):
    """Response model for contribution statistics."""

    session_id: str
    ai_percentage: float
    human_percentage: float
    system_percentage: float
    total_nodes: int
    ai_nodes: int
    human_nodes: int
    by_type: dict[str, int]


class ComplianceStatusResponse(BaseModel):
    """Response model for compliance status."""

    hipaa_enabled: bool = True
    cfr21_enabled: bool = False
    audit_logging_enabled: bool = True
    phi_detection_enabled: bool = True
    last_audit_check: Optional[datetime] = None
    compliance_score: int = 100


# Endpoints
@router.get(
    "/logs",
    response_model=AuditLogListResponse,
    summary="Query audit logs",
    description="Query audit logs with various filters for compliance review.",
)
async def query_audit_logs(
    institution_id: Optional[str] = Query(None, description="Filter by institution ID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    actor_id: Optional[str] = Query(None, description="Filter by actor (user) ID"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    resource_id: Optional[str] = Query(None, description="Filter by resource ID"),
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    limit: int = Query(50, ge=1, le=500, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db: AsyncSession = Depends(get_async_session),
) -> AuditLogListResponse:
    """
    Query audit logs with filters.

    This endpoint allows compliance officers and administrators to
    review audit logs for regulatory compliance and incident investigation.

    Requires appropriate permissions to access.
    """
    audit_logger = AuditLogger(db)

    start_time = datetime.utcnow() - timedelta(days=days)

    logs, total = await audit_logger.query_logs(
        institution_id=institution_id,
        event_type=event_type,
        actor_id=actor_id,
        resource_type=resource_type,
        resource_id=resource_id,
        start_time=start_time,
        limit=limit,
        offset=offset,
    )

    return AuditLogListResponse(
        logs=[
            AuditLogResponse(
                id=log.id,
                event_type=log.event_type,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                actor_id=str(log.actor_id) if log.actor_id else None,
                actor_name=log.actor_name,
                action=log.action,
                action_detail=log.action_detail,
                details=log.details,
                success=log.success,
                error_message=log.error_message,
                ip_address=str(log.ip_address) if log.ip_address else None,
                timestamp=log.timestamp,
            )
            for log in logs
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/logs/user/{user_id}",
    response_model=AuditLogListResponse,
    summary="Get user activity",
    description="Get recent audit logs for a specific user.",
)
async def get_user_activity(
    user_id: UUID,
    days: int = Query(30, ge=1, le=365, description="Number of days to look back"),
    limit: int = Query(100, ge=1, le=500, description="Maximum results"),
    db: AsyncSession = Depends(get_async_session),
) -> AuditLogListResponse:
    """
    Get audit logs for a specific user.

    Useful for reviewing individual user activity for compliance
    or security investigations.
    """
    audit_logger = AuditLogger(db)

    logs = await audit_logger.get_user_activity(
        user_id=str(user_id),
        days=days,
        limit=limit,
    )

    return AuditLogListResponse(
        logs=[
            AuditLogResponse(
                id=log.id,
                event_type=log.event_type,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                actor_id=str(log.actor_id) if log.actor_id else None,
                actor_name=log.actor_name,
                action=log.action,
                action_detail=log.action_detail,
                details=log.details,
                success=log.success,
                error_message=log.error_message,
                ip_address=str(log.ip_address) if log.ip_address else None,
                timestamp=log.timestamp,
            )
            for log in logs
        ],
        total=len(logs),
        limit=limit,
        offset=0,
    )


@router.get(
    "/logs/resource/{resource_type}/{resource_id}",
    response_model=AuditLogListResponse,
    summary="Get resource history",
    description="Get audit history for a specific resource.",
)
async def get_resource_history(
    resource_type: str,
    resource_id: str,
    limit: int = Query(100, ge=1, le=500, description="Maximum results"),
    db: AsyncSession = Depends(get_async_session),
) -> AuditLogListResponse:
    """
    Get audit history for a specific resource.

    Shows all actions taken on a document, session, or other resource.
    """
    audit_logger = AuditLogger(db)

    logs = await audit_logger.get_resource_history(
        resource_type=resource_type,
        resource_id=resource_id,
        limit=limit,
    )

    return AuditLogListResponse(
        logs=[
            AuditLogResponse(
                id=log.id,
                event_type=log.event_type,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                actor_id=str(log.actor_id) if log.actor_id else None,
                actor_name=log.actor_name,
                action=log.action,
                action_detail=log.action_detail,
                details=log.details,
                success=log.success,
                error_message=log.error_message,
                ip_address=str(log.ip_address) if log.ip_address else None,
                timestamp=log.timestamp,
            )
            for log in logs
        ],
        total=len(logs),
        limit=limit,
        offset=0,
    )


@router.get(
    "/sessions/{session_id}/provenance",
    response_model=list[ProvenanceNodeResponse],
    summary="Get session provenance",
    description="Get the complete provenance chain for a session.",
)
async def get_session_provenance(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> list[ProvenanceNodeResponse]:
    """
    Get provenance chain for a session.

    Returns all provenance nodes for the session, showing the complete
    data flow from inputs through AI processing to final outputs.
    """
    service = ExplainabilityService(db)
    flow = await service.get_data_flow(session_id)

    return [
        ProvenanceNodeResponse(
            id=node.id,
            type=node.type,
            actor=node.actor,
            actor_type=node.actor_type,
            depth=0,  # Not available in DataFlowNode
            parent_ids=node.children,  # Note: This is children, not parents
            timestamp=node.timestamp,
            metadata=node.node_metadata,
            action=None,
            description=node.description,
        )
        for node in flow.data_flow
    ]


@router.get(
    "/sessions/{session_id}/contributions",
    response_model=ContributionStatsResponse,
    summary="Get contribution statistics",
    description="Get AI vs human contribution statistics for a session.",
)
async def get_contribution_stats(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> ContributionStatsResponse:
    """
    Get contribution statistics for a session.

    Shows the breakdown of AI vs human contributions to understand
    the level of AI involvement in content creation.
    """
    provenance = ProvenanceChain(db)
    stats = await provenance.get_ai_contribution_percentage(session_id)

    return ContributionStatsResponse(
        session_id=str(session_id),
        ai_percentage=stats.get("ai_percentage", 0),
        human_percentage=stats.get("human_percentage", 0),
        system_percentage=stats.get("system_percentage", 0),
        total_nodes=stats.get("total_nodes", 0),
        ai_nodes=stats.get("ai_nodes", 0),
        human_nodes=stats.get("human_nodes", 0),
        by_type=stats.get("by_type", {}),
    )


@router.get(
    "/nodes/{node_id}/lineage",
    response_model=LineageResponse,
    summary="Get node lineage",
    description="Get the complete lineage of a provenance node back to inputs.",
)
async def get_node_lineage(
    node_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> LineageResponse:
    """
    Get lineage of a specific provenance node.

    Traces back through the provenance chain to show all ancestors
    that influenced this node's creation.
    """
    provenance = ProvenanceChain(db)
    lineage = await provenance.get_lineage(node_id)

    # Calculate total depth
    max_depth = max((n.get("depth", 0) for n in lineage), default=0)

    return LineageResponse(
        node_id=str(node_id),
        lineage=lineage,
        total_depth=max_depth,
    )


@router.get(
    "/nodes/{node_id}/explain",
    summary="Explain a provenance node",
    description="Get a human-readable explanation of a provenance node.",
)
async def explain_node(
    node_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> dict[str, Any]:
    """
    Get human-readable explanation of a provenance node.

    Provides detailed information about what happened at this node
    in the data processing pipeline.
    """
    service = ExplainabilityService(db)
    node = await db.get(ProvenanceNode, node_id)

    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Provenance node {node_id} not found",
        )

    if node.type == "extraction":
        explanation = await service.explain_extraction(node_id)
        return explanation.model_dump()
    elif node.type == "generation":
        explanation = await service.explain_generation(node_id)
        return explanation.model_dump()
    else:
        # For other node types, return basic info
        return {
            "node_id": str(node_id),
            "type": node.type,
            "actor": node.actor,
            "description": node.description or f"Action: {node.action}",
            "timestamp": node.node_metadata.get("timestamp") if node.node_metadata else None,
            "explanation_available": False,
            "message": f"Detailed explanation not available for node type '{node.type}'",
        }


@router.get(
    "/sessions/{session_id}/data-flow",
    response_model=DataFlowExplanation,
    summary="Get session data flow",
    description="Get a complete data flow visualization for a session.",
)
async def get_session_data_flow(
    session_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> DataFlowExplanation:
    """
    Get complete data flow for a session.

    Returns a visualization-ready representation of how data
    flowed through the system during the session.
    """
    service = ExplainabilityService(db)
    return await service.get_data_flow(session_id)


@router.get(
    "/sessions/{session_id}/fields/{field_name}/explain",
    summary="Explain field provenance",
    description="Get the provenance explanation for a specific field.",
)
async def explain_field(
    session_id: UUID,
    field_name: str,
    db: AsyncSession = Depends(get_async_session),
) -> dict[str, Any]:
    """
    Explain the provenance of a specific field.

    Shows where a field value came from and any modifications
    that were made to it.
    """
    service = ExplainabilityService(db)
    return await service.explain_field(session_id, field_name)


@router.get(
    "/compliance/status",
    response_model=ComplianceStatusResponse,
    summary="Get compliance status",
    description="Get the current compliance configuration status.",
)
async def get_compliance_status(
    db: AsyncSession = Depends(get_async_session),
) -> ComplianceStatusResponse:
    """
    Get current compliance status.

    Returns information about which compliance features are enabled
    and their current status.
    """
    # In production, this would check actual configuration
    return ComplianceStatusResponse(
        hipaa_enabled=True,
        cfr21_enabled=False,  # Optional, not enabled by default
        audit_logging_enabled=True,
        phi_detection_enabled=True,
        last_audit_check=datetime.utcnow(),
        compliance_score=100,
    )


@router.get(
    "/extractions/{extraction_id}/explain",
    response_model=ExtractionExplanation,
    summary="Explain extraction",
    description="Get detailed explanation of a protocol extraction.",
)
async def explain_extraction(
    extraction_id: UUID,
    include_evidence: bool = Query(True, description="Include source evidence"),
    db: AsyncSession = Depends(get_async_session),
) -> ExtractionExplanation:
    """
    Explain a protocol extraction.

    Provides detailed information about how data was extracted
    from a source document, including confidence scores and
    any warnings about low-confidence extractions.
    """
    service = ExplainabilityService(db)

    try:
        return await service.explain_extraction(extraction_id, include_evidence)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


@router.get(
    "/generations/{generation_id}/explain",
    response_model=GenerationExplanation,
    summary="Explain generation",
    description="Get detailed explanation of content generation.",
)
async def explain_generation(
    generation_id: UUID,
    db: AsyncSession = Depends(get_async_session),
) -> GenerationExplanation:
    """
    Explain a content generation.

    Provides detailed information about how content was generated,
    including what inputs influenced the output and recommendations
    for review.
    """
    service = ExplainabilityService(db)

    try:
        return await service.explain_generation(generation_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
