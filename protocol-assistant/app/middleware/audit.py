"""Audit middleware for Protocol Assistant.

This middleware automatically logs all HTTP requests and responses for
compliance with HIPAA audit requirements. It captures:

- Request method and path
- Actor (user) information from authentication
- Response status codes
- Processing time
- IP address and user agent

This provides a comprehensive audit trail of all API interactions
without requiring explicit logging in each endpoint.
"""

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Callable, Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.types import ASGIApp

from app.database import async_session_maker
from app.audit.audit_logger import AuditLogger, AuditEventType

logger = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    """
    Middleware for automatic audit logging of HTTP requests.

    This middleware intercepts all requests and logs them for compliance
    purposes. It runs before and after request processing to capture
    both the request details and the outcome.
    """

    # Paths to exclude from audit logging (health checks, etc.)
    EXCLUDED_PATHS = {
        "/health",
        "/",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/favicon.ico",
    }

    # Paths that typically access PHI
    PHI_PATHS = {
        "/api/protocol-assistant/sessions",
        "/api/audit",
        "/api/documents",
    }

    def __init__(
        self,
        app: ASGIApp,
        exclude_paths: Optional[set[str]] = None,
        log_request_body: bool = False,
        log_response_body: bool = False,
    ):
        """
        Initialize the audit middleware.

        Args:
            app: The ASGI application
            exclude_paths: Additional paths to exclude from logging
            log_request_body: Whether to log request bodies (careful with PHI)
            log_response_body: Whether to log response bodies (careful with PHI)
        """
        super().__init__(app)
        self.exclude_paths = self.EXCLUDED_PATHS.copy()
        if exclude_paths:
            self.exclude_paths.update(exclude_paths)
        self.log_request_body = log_request_body
        self.log_response_body = log_response_body

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """
        Process the request and log audit information.

        Args:
            request: The incoming request
            call_next: The next middleware/endpoint to call

        Returns:
            The response from the application
        """
        # Check if this path should be excluded
        if self._should_exclude(request.url.path):
            return await call_next(request)

        # Generate request ID for tracing
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())

        # Add request ID to request state
        request.state.request_id = request_id

        # Record start time
        start_time = time.time()

        # Extract actor information from request
        actor_info = self._extract_actor_info(request)

        # Log request start (debug level for detailed tracing)
        logger.debug(
            f"Request start: {request.method} {request.url.path} "
            f"request_id={request_id} actor={actor_info.get('user_id', 'anonymous')}"
        )

        # Process the request
        response = None
        error_message = None
        success = True

        try:
            response = await call_next(request)
            success = 200 <= response.status_code < 400
            if not success:
                error_message = f"HTTP {response.status_code}"
        except Exception as e:
            error_message = str(e)
            success = False
            logger.exception(f"Request error: {request_id}")
            raise

        finally:
            # Calculate processing time
            process_time = time.time() - start_time

            # Log to audit trail (async)
            await self._log_audit(
                request=request,
                request_id=request_id,
                actor_info=actor_info,
                status_code=response.status_code if response else 500,
                process_time=process_time,
                success=success,
                error_message=error_message,
            )

            # Log completion (info level)
            logger.info(
                f"Request complete: {request.method} {request.url.path} "
                f"status={response.status_code if response else 500} "
                f"time={process_time:.3f}s request_id={request_id}"
            )

        return response

    def _should_exclude(self, path: str) -> bool:
        """
        Check if a path should be excluded from audit logging.

        Args:
            path: The request path

        Returns:
            True if the path should be excluded
        """
        # Exact match
        if path in self.exclude_paths:
            return True

        # Check for static file paths
        if path.startswith("/static/") or path.endswith((".css", ".js", ".png", ".jpg")):
            return True

        return False

    def _extract_actor_info(self, request: Request) -> dict:
        """
        Extract actor (user) information from the request.

        This attempts to get user information from:
        1. Request state (set by auth middleware)
        2. Authorization header (JWT)
        3. Session cookie

        Args:
            request: The incoming request

        Returns:
            Dictionary with actor information
        """
        actor_info = {
            "user_id": None,
            "user_name": None,
            "user_email": None,
            "user_role": None,
        }

        # Try to get from request state (set by auth middleware)
        if hasattr(request.state, "user"):
            user = request.state.user
            if isinstance(user, dict):
                actor_info["user_id"] = user.get("id") or user.get("user_id")
                actor_info["user_name"] = user.get("name") or user.get("username")
                actor_info["user_email"] = user.get("email")
                actor_info["user_role"] = user.get("role")
            elif hasattr(user, "id"):
                actor_info["user_id"] = str(user.id)
                actor_info["user_name"] = getattr(user, "name", None)
                actor_info["user_email"] = getattr(user, "email", None)
                actor_info["user_role"] = getattr(user, "role", None)

        # Try to get user_id from path if it's a user-specific endpoint
        if not actor_info["user_id"]:
            # Could parse from path or headers if needed
            pass

        return actor_info

    def _determine_event_type(self, request: Request, status_code: int) -> str:
        """
        Determine the appropriate event type for the request.

        Args:
            request: The incoming request
            status_code: The response status code

        Returns:
            Audit event type string
        """
        method = request.method
        path = request.url.path

        # Check for authentication endpoints
        if "/auth" in path or "/login" in path:
            if status_code >= 400:
                return AuditEventType.LOGIN_FAILED
            return AuditEventType.LOGIN

        # Check for AI operation endpoints
        if "/chat" in path or "/generate" in path:
            return AuditEventType.AI_OPERATION

        # Check for document endpoints
        if "/documents" in path:
            if method == "POST":
                return AuditEventType.DOCUMENT_UPLOAD
            elif method == "DELETE":
                return AuditEventType.DOCUMENT_DELETE
            return AuditEventType.ACCESS

        # Check for export endpoints
        if "/export" in path or "/download" in path:
            return AuditEventType.EXPORT

        # General CRUD operations
        if method == "POST":
            return AuditEventType.CREATE
        elif method in ("PUT", "PATCH"):
            return AuditEventType.UPDATE
        elif method == "DELETE":
            return AuditEventType.DELETE
        else:
            return AuditEventType.ACCESS

    def _determine_resource_type(self, path: str) -> str:
        """
        Determine the resource type from the request path.

        Args:
            path: The request path

        Returns:
            Resource type string
        """
        # Parse path to determine resource type
        parts = path.strip("/").split("/")

        # Skip 'api' prefix if present
        if parts and parts[0] == "api":
            parts = parts[1:]

        # Skip service prefix if present
        if parts and parts[0] in ("protocol-assistant", "forms", "auth"):
            parts = parts[1:]

        if parts:
            # Use the first meaningful part as resource type
            resource_type = parts[0]
            # Singularize common plural forms
            if resource_type.endswith("s") and len(resource_type) > 1:
                return resource_type[:-1]
            return resource_type

        return "unknown"

    async def _log_audit(
        self,
        request: Request,
        request_id: str,
        actor_info: dict,
        status_code: int,
        process_time: float,
        success: bool,
        error_message: Optional[str],
    ) -> None:
        """
        Log the request to the audit database.

        Args:
            request: The incoming request
            request_id: Request ID for tracing
            actor_info: Actor information dictionary
            status_code: HTTP status code
            process_time: Request processing time in seconds
            success: Whether the request was successful
            error_message: Error message if any
        """
        try:
            async with async_session_maker() as db:
                audit_logger = AuditLogger(db)

                # Determine event type and resource type
                event_type = self._determine_event_type(request, status_code)
                resource_type = self._determine_resource_type(request.url.path)

                # Check if this might access PHI
                contains_phi = any(
                    phi_path in request.url.path
                    for phi_path in self.PHI_PATHS
                )

                # Extract resource ID from path if present
                resource_id = self._extract_resource_id(request.url.path)

                # Build details
                details = {
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": status_code,
                    "process_time_ms": round(process_time * 1000, 2),
                    "contains_phi": contains_phi,
                }

                if request.query_params:
                    # Exclude sensitive query params
                    safe_params = {
                        k: v for k, v in request.query_params.items()
                        if k.lower() not in ("password", "token", "key", "secret")
                    }
                    if safe_params:
                        details["query_params"] = safe_params

                # Get institution ID if available
                institution_id = None
                if hasattr(request.state, "institution_id"):
                    institution_id = str(request.state.institution_id)

                await audit_logger.log(
                    institution_id=institution_id,
                    event_type=event_type,
                    action=f"{request.method} {request.url.path}",
                    resource_type=resource_type,
                    actor_id=actor_info.get("user_id"),
                    actor_name=actor_info.get("user_name"),
                    actor_email=actor_info.get("user_email"),
                    actor_role=actor_info.get("user_role"),
                    resource_id=resource_id,
                    details=details,
                    success=success,
                    error_message=error_message,
                    request=request,
                    request_id=request_id,
                )

        except Exception as e:
            # Don't let audit logging failures break the application
            logger.error(f"Failed to write audit log: {e}")

    def _extract_resource_id(self, path: str) -> Optional[str]:
        """
        Extract resource ID from the request path.

        Looks for UUID-like strings in the path.

        Args:
            path: The request path

        Returns:
            Resource ID if found, None otherwise
        """
        import re

        # UUID pattern
        uuid_pattern = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

        matches = re.findall(uuid_pattern, path, re.IGNORECASE)
        return matches[-1] if matches else None
