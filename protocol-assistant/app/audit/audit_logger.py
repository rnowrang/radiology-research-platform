"""Audit logging service for Protocol Assistant.

This module provides comprehensive audit logging for compliance with
HIPAA, 21 CFR Part 11, and other regulatory requirements.

Logged events include:
- User authentication events
- Data access and modifications
- AI operations (extraction, generation)
- Document operations (upload, download, export)
- Administrative actions
- Security events

All logs are append-only and include timestamps, actor information,
and relevant context for forensic analysis.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from fastapi import Request
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import ComplianceAuditLog

logger = logging.getLogger(__name__)


class AuditEventType:
    """Standard audit event types."""

    # Authentication events
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PASSWORD_CHANGE = "password_change"
    MFA_ENABLED = "mfa_enabled"
    MFA_DISABLED = "mfa_disabled"

    # Session events
    SESSION_CREATE = "session_create"
    SESSION_CLOSE = "session_close"

    # Data access events
    ACCESS = "access"
    VIEW = "view"
    DOWNLOAD = "download"
    EXPORT = "export"
    SEARCH = "search"

    # Data modification events
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"

    # AI operation events
    AI_OPERATION = "ai_operation"
    AI_EXTRACTION = "ai_extraction"
    AI_GENERATION = "ai_generation"
    AI_CHAT = "ai_chat"

    # Document events
    DOCUMENT_UPLOAD = "document_upload"
    DOCUMENT_DELETE = "document_delete"
    DOCUMENT_SIGN = "document_sign"

    # Administrative events
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DELETE = "user_delete"
    ROLE_ASSIGN = "role_assign"
    ROLE_REVOKE = "role_revoke"
    PERMISSION_CHANGE = "permission_change"

    # Security events
    SECURITY_ALERT = "security_alert"
    ACCESS_DENIED = "access_denied"
    PHI_ACCESS = "phi_access"
    PHI_REDACTION = "phi_redaction"


class AuditLogger:
    """
    Comprehensive audit logging service.

    Provides methods for logging all types of auditable events
    in a compliant, append-only format.
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize the audit logger.

        Args:
            db: Async database session
        """
        self.db = db

    async def log(
        self,
        institution_id: Optional[str],
        event_type: str,
        action: str,
        resource_type: str,
        actor_id: Optional[str] = None,
        actor_name: Optional[str] = None,
        actor_email: Optional[str] = None,
        actor_role: Optional[str] = None,
        resource_id: Optional[str] = None,
        action_detail: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        success: bool = True,
        error_message: Optional[str] = None,
        request: Optional[Request] = None,
        request_id: Optional[str] = None,
    ) -> ComplianceAuditLog:
        """
        Create an audit log entry.

        Args:
            institution_id: UUID of the institution (optional)
            event_type: Type of event (use AuditEventType constants)
            action: Specific action taken
            resource_type: Type of resource affected
            actor_id: UUID of the user performing the action
            actor_name: Name of the actor (captured at time of action)
            actor_email: Email of the actor
            actor_role: Role of the actor
            resource_id: ID of the resource affected
            action_detail: Detailed description of the action
            details: Additional structured details
            success: Whether the action succeeded
            error_message: Error message if action failed
            request: FastAPI Request object for context
            request_id: Request ID for tracing

        Returns:
            Created ComplianceAuditLog entry
        """
        # Extract request context
        ip_address = None
        user_agent = None

        if request:
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent")
            if not request_id:
                request_id = request.headers.get("x-request-id")

        # Convert institution_id to UUID if provided as string
        inst_uuid = None
        if institution_id:
            try:
                inst_uuid = UUID(institution_id) if isinstance(institution_id, str) else institution_id
            except (ValueError, TypeError):
                inst_uuid = None

        # Convert actor_id to UUID if provided
        actor_uuid = None
        if actor_id:
            try:
                actor_uuid = UUID(actor_id) if isinstance(actor_id, str) else actor_id
            except (ValueError, TypeError):
                actor_uuid = None

        log_entry = ComplianceAuditLog(
            institution_id=inst_uuid,
            event_type=event_type,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            actor_id=actor_uuid,
            actor_name=actor_name,
            actor_email=actor_email,
            actor_role=actor_role,
            action=action,
            action_detail=action_detail,
            details=details or {},
            ip_address=ip_address,
            user_agent=user_agent,
            request_id=request_id,
            success=success,
            error_message=error_message,
        )

        self.db.add(log_entry)
        await self.db.commit()
        await self.db.refresh(log_entry)

        # Also log to application logger
        log_msg = (
            f"AUDIT: {event_type}/{action} "
            f"actor={actor_name or actor_id or 'unknown'} "
            f"resource={resource_type}/{resource_id} "
            f"success={success}"
        )
        if success:
            logger.info(log_msg)
        else:
            logger.warning(f"{log_msg} error={error_message}")

        return log_entry

    async def log_ai_operation(
        self,
        institution_id: Optional[str],
        operation: str,
        session_id: str,
        user_id: str,
        user_name: Optional[str] = None,
        model_used: Optional[str] = None,
        prompt_version: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        request: Optional[Request] = None,
    ) -> ComplianceAuditLog:
        """
        Log an AI operation.

        Specialized method for logging AI-related operations with
        relevant context.

        Args:
            institution_id: Institution UUID
            operation: Type of AI operation (extract, generate, chat)
            session_id: Chat session UUID
            user_id: User UUID
            user_name: User's name
            model_used: AI model identifier
            prompt_version: Prompt version used
            details: Additional operation details
            request: FastAPI Request object

        Returns:
            Created audit log entry
        """
        operation_details = details or {}
        operation_details.update({
            "model": model_used,
            "prompt_version": prompt_version,
        })

        return await self.log(
            institution_id=institution_id,
            event_type=AuditEventType.AI_OPERATION,
            action=operation,
            resource_type="chat_session",
            actor_id=user_id,
            actor_name=user_name,
            resource_id=session_id,
            details=operation_details,
            request=request,
        )

    async def log_data_access(
        self,
        institution_id: Optional[str],
        resource_type: str,
        resource_id: str,
        user_id: str,
        user_name: Optional[str] = None,
        access_type: str = "view",
        fields_accessed: Optional[list[str]] = None,
        contains_phi: bool = False,
        request: Optional[Request] = None,
    ) -> ComplianceAuditLog:
        """
        Log data access events.

        Specialized method for logging access to data, with special
        handling for PHI access.

        Args:
            institution_id: Institution UUID
            resource_type: Type of resource accessed
            resource_id: ID of resource accessed
            user_id: User UUID
            user_name: User's name
            access_type: Type of access (view, download, export)
            fields_accessed: List of fields accessed (for partial access)
            contains_phi: Whether the accessed data contains PHI
            request: FastAPI Request object

        Returns:
            Created audit log entry
        """
        event_type = AuditEventType.PHI_ACCESS if contains_phi else AuditEventType.ACCESS

        details = {}
        if fields_accessed:
            details["fields_accessed"] = fields_accessed
        if contains_phi:
            details["phi_access"] = True

        return await self.log(
            institution_id=institution_id,
            event_type=event_type,
            action=access_type,
            resource_type=resource_type,
            actor_id=user_id,
            actor_name=user_name,
            resource_id=resource_id,
            details=details,
            request=request,
        )

    async def log_authentication(
        self,
        event_type: str,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        success: bool = True,
        failure_reason: Optional[str] = None,
        auth_method: Optional[str] = None,
        request: Optional[Request] = None,
    ) -> ComplianceAuditLog:
        """
        Log authentication events.

        Args:
            event_type: Type of auth event (login, logout, login_failed)
            user_id: User UUID (if known)
            user_email: User email
            success: Whether authentication succeeded
            failure_reason: Reason for failure if applicable
            auth_method: Method of authentication used
            request: FastAPI Request object

        Returns:
            Created audit log entry
        """
        details = {"auth_method": auth_method} if auth_method else {}

        return await self.log(
            institution_id=None,
            event_type=event_type,
            action="authenticate",
            resource_type="user",
            actor_id=user_id,
            actor_email=user_email,
            resource_id=user_id,
            details=details,
            success=success,
            error_message=failure_reason,
            request=request,
        )

    async def log_document_operation(
        self,
        institution_id: Optional[str],
        operation: str,
        document_id: str,
        document_type: Optional[str],
        user_id: str,
        user_name: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        request: Optional[Request] = None,
    ) -> ComplianceAuditLog:
        """
        Log document operations.

        Args:
            institution_id: Institution UUID
            operation: Operation type (upload, delete, sign, export)
            document_id: Document UUID
            document_type: Type of document
            user_id: User UUID
            user_name: User's name
            details: Additional operation details
            request: FastAPI Request object

        Returns:
            Created audit log entry
        """
        event_type_map = {
            "upload": AuditEventType.DOCUMENT_UPLOAD,
            "delete": AuditEventType.DOCUMENT_DELETE,
            "sign": AuditEventType.DOCUMENT_SIGN,
            "export": AuditEventType.EXPORT,
            "download": AuditEventType.DOWNLOAD,
        }

        operation_details = details or {}
        if document_type:
            operation_details["document_type"] = document_type

        return await self.log(
            institution_id=institution_id,
            event_type=event_type_map.get(operation, AuditEventType.ACCESS),
            action=operation,
            resource_type="document",
            actor_id=user_id,
            actor_name=user_name,
            resource_id=document_id,
            details=operation_details,
            request=request,
        )

    async def log_security_event(
        self,
        institution_id: Optional[str],
        event_description: str,
        severity: str = "warning",
        user_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        details: Optional[dict[str, Any]] = None,
        request: Optional[Request] = None,
    ) -> ComplianceAuditLog:
        """
        Log security-related events.

        Args:
            institution_id: Institution UUID
            event_description: Description of the security event
            severity: Event severity (info, warning, critical)
            user_id: User UUID if applicable
            resource_type: Type of resource involved
            resource_id: ID of resource involved
            details: Additional event details
            request: FastAPI Request object

        Returns:
            Created audit log entry
        """
        event_details = details or {}
        event_details["severity"] = severity

        return await self.log(
            institution_id=institution_id,
            event_type=AuditEventType.SECURITY_ALERT,
            action=event_description,
            resource_type=resource_type or "security",
            actor_id=user_id,
            resource_id=resource_id,
            details=event_details,
            request=request,
        )

    async def query_logs(
        self,
        institution_id: Optional[str] = None,
        event_type: Optional[str] = None,
        actor_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[list[ComplianceAuditLog], int]:
        """
        Query audit logs with filters.

        Args:
            institution_id: Filter by institution
            event_type: Filter by event type
            actor_id: Filter by actor
            resource_type: Filter by resource type
            resource_id: Filter by resource ID
            start_time: Filter logs after this time
            end_time: Filter logs before this time
            limit: Maximum number of results
            offset: Number of results to skip

        Returns:
            Tuple of (logs list, total count)
        """
        # Build filters
        filters = []

        if institution_id:
            try:
                inst_uuid = UUID(institution_id) if isinstance(institution_id, str) else institution_id
                filters.append(ComplianceAuditLog.institution_id == inst_uuid)
            except (ValueError, TypeError):
                pass

        if event_type:
            filters.append(ComplianceAuditLog.event_type == event_type)

        if actor_id:
            try:
                actor_uuid = UUID(actor_id) if isinstance(actor_id, str) else actor_id
                filters.append(ComplianceAuditLog.actor_id == actor_uuid)
            except (ValueError, TypeError):
                pass

        if resource_type:
            filters.append(ComplianceAuditLog.resource_type == resource_type)

        if resource_id:
            filters.append(ComplianceAuditLog.resource_id == str(resource_id))

        if start_time:
            filters.append(ComplianceAuditLog.timestamp >= start_time)

        if end_time:
            filters.append(ComplianceAuditLog.timestamp <= end_time)

        # Build query
        query = select(ComplianceAuditLog)
        if filters:
            query = query.where(and_(*filters))

        # Get total count
        from sqlalchemy import func
        count_query = select(func.count()).select_from(
            query.subquery()
        )
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Get paginated results
        query = query.order_by(ComplianceAuditLog.timestamp.desc())
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        logs = list(result.scalars().all())

        return logs, total

    async def get_user_activity(
        self,
        user_id: str,
        days: int = 30,
        limit: int = 100,
    ) -> list[ComplianceAuditLog]:
        """
        Get recent activity for a specific user.

        Args:
            user_id: User UUID
            days: Number of days to look back
            limit: Maximum number of results

        Returns:
            List of audit logs for the user
        """
        from datetime import timedelta

        start_time = datetime.now(timezone.utc) - timedelta(days=days)

        logs, _ = await self.query_logs(
            actor_id=user_id,
            start_time=start_time,
            limit=limit,
        )

        return logs

    async def get_resource_history(
        self,
        resource_type: str,
        resource_id: str,
        limit: int = 100,
    ) -> list[ComplianceAuditLog]:
        """
        Get audit history for a specific resource.

        Args:
            resource_type: Type of resource
            resource_id: Resource ID
            limit: Maximum number of results

        Returns:
            List of audit logs for the resource
        """
        logs, _ = await self.query_logs(
            resource_type=resource_type,
            resource_id=resource_id,
            limit=limit,
        )

        return logs
