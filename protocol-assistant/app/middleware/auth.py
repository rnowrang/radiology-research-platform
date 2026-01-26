"""
Authentication middleware for Protocol Assistant.

This module provides authentication and authorization utilities that
integrate with the Gateway's JWT validation. The Gateway validates tokens
and passes user context via HTTP headers.

Headers passed from Gateway:
- X-User-ID: UUID of the authenticated user
- X-User-Role: User's role (admin, reviewer, researcher)
- X-Institution-ID: UUID of the user's institution
- X-User-Email: User's email address
- X-User-Name: User's display name
- X-Internal-API-Key: Internal service authentication key
"""

import os
import logging
from uuid import UUID
from typing import Optional, Callable, List
from dataclasses import dataclass

from fastapi import Request, HTTPException, Depends, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

logger = logging.getLogger(__name__)

# Internal API key for service-to-service communication
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key")


@dataclass
class UserContext:
    """User context extracted from Gateway headers."""

    id: UUID
    role: str
    institution_id: Optional[UUID] = None
    email: Optional[str] = None
    name: Optional[str] = None

    @property
    def is_admin(self) -> bool:
        """Check if user has admin role."""
        return self.role == "admin"

    @property
    def is_reviewer(self) -> bool:
        """Check if user has reviewer or admin role."""
        return self.role in ("admin", "reviewer")

    def has_role(self, roles: List[str]) -> bool:
        """Check if user has any of the specified roles."""
        return self.role in roles


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware that validates internal API key and extracts user context.

    This middleware:
    1. Validates the X-Internal-API-Key header for service-to-service auth
    2. Extracts user context from headers set by the Gateway
    3. Attaches user context to request.state for use in endpoints
    """

    # Paths that don't require authentication
    PUBLIC_PATHS = {
        "/health",
        "/",
        "/docs",
        "/openapi.json",
        "/redoc",
    }

    def __init__(self, app, skip_auth: bool = False):
        """
        Initialize auth middleware.

        Args:
            app: The ASGI application
            skip_auth: Skip authentication (for development only)
        """
        super().__init__(app)
        self.skip_auth = skip_auth

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """Process the request and validate authentication."""
        # Skip auth for public paths
        if self._is_public_path(request.url.path):
            return await call_next(request)

        # Skip auth if configured (development mode)
        if self.skip_auth:
            request.state.user = self._get_dev_user()
            return await call_next(request)

        # Validate internal API key
        api_key = request.headers.get("X-Internal-API-Key")
        if not api_key or api_key != INTERNAL_API_KEY:
            logger.warning(
                f"Invalid or missing internal API key for {request.url.path}"
            )
            # Allow request to proceed - endpoint-level auth will handle it
            # This allows for flexibility in development

        # Extract user context from headers
        user_context = self._extract_user_context(request)
        if user_context:
            request.state.user = user_context
            request.state.user_id = user_context.id
            request.state.institution_id = user_context.institution_id

        return await call_next(request)

    def _is_public_path(self, path: str) -> bool:
        """Check if path is public (no auth required)."""
        if path in self.PUBLIC_PATHS:
            return True
        # Static files and documentation
        if path.startswith("/static/") or path.endswith((".css", ".js", ".ico")):
            return True
        return False

    def _extract_user_context(self, request: Request) -> Optional[UserContext]:
        """Extract user context from request headers."""
        user_id = request.headers.get("X-User-ID")
        user_role = request.headers.get("X-User-Role")

        if not user_id:
            return None

        try:
            institution_id_str = request.headers.get("X-Institution-ID")
            institution_id = UUID(institution_id_str) if institution_id_str else None

            return UserContext(
                id=UUID(user_id),
                role=user_role or "researcher",
                institution_id=institution_id,
                email=request.headers.get("X-User-Email"),
                name=request.headers.get("X-User-Name"),
            )
        except (ValueError, TypeError) as e:
            logger.warning(f"Failed to parse user context: {e}")
            return None

    def _get_dev_user(self) -> UserContext:
        """Get development user context."""
        return UserContext(
            id=UUID("00000000-0000-0000-0000-000000000001"),
            role="admin",
            institution_id=UUID("00000000-0000-0000-0000-000000000001"),
            email="dev@example.com",
            name="Development User",
        )


async def get_current_user(request: Request) -> UserContext:
    """
    FastAPI dependency to get current authenticated user.

    This reads user context from request.state (set by AuthMiddleware)
    or from headers if middleware hasn't processed them.

    Raises:
        HTTPException: 401 if not authenticated
    """
    # First check if middleware set user context
    if hasattr(request.state, "user") and request.state.user:
        user = request.state.user
        if isinstance(user, UserContext):
            return user
        # Convert dict to UserContext if needed
        if isinstance(user, dict):
            try:
                return UserContext(
                    id=UUID(user.get("id") or user.get("user_id")),
                    role=user.get("role", "researcher"),
                    institution_id=UUID(user["institution_id"]) if user.get("institution_id") else None,
                    email=user.get("email"),
                    name=user.get("name"),
                )
            except (ValueError, TypeError, KeyError):
                pass

    # Try to extract from headers directly
    user_id = request.headers.get("X-User-ID")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        institution_id_str = request.headers.get("X-Institution-ID")
        return UserContext(
            id=UUID(user_id),
            role=request.headers.get("X-User-Role", "researcher"),
            institution_id=UUID(institution_id_str) if institution_id_str else None,
            email=request.headers.get("X-User-Email"),
            name=request.headers.get("X-User-Name"),
        )
    except (ValueError, TypeError) as e:
        logger.warning(f"Invalid user context in headers: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context",
        )


async def get_optional_user(request: Request) -> Optional[UserContext]:
    """
    FastAPI dependency to optionally get current user.

    Returns None if not authenticated instead of raising an exception.
    """
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


def require_role(roles: List[str]) -> Callable:
    """
    FastAPI dependency factory for role-based access control.

    Args:
        roles: List of allowed roles (e.g., ["admin", "reviewer"])

    Returns:
        Dependency function that validates user role

    Example:
        @router.get("/admin-only")
        async def admin_endpoint(user: UserContext = Depends(require_role(["admin"]))):
            ...
    """
    async def check_role(user: UserContext = Depends(get_current_user)) -> UserContext:
        if not user.has_role(roles):
            logger.warning(
                f"User {user.id} with role {user.role} attempted to access "
                f"endpoint requiring roles: {roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required roles: {roles}",
            )
        return user

    return check_role


def require_admin() -> Callable:
    """
    FastAPI dependency to require admin role.

    Shorthand for require_role(["admin"]).

    Example:
        @router.get("/admin-only")
        async def admin_endpoint(user: UserContext = Depends(require_admin())):
            ...
    """
    return require_role(["admin"])


async def get_current_admin_id(
    user: UserContext = Depends(require_admin())
) -> UUID:
    """
    Get the current admin user's ID.

    This is a convenience dependency that validates admin access
    and returns just the user ID.
    """
    return user.id


async def get_current_institution_id(
    user: UserContext = Depends(get_current_user)
) -> UUID:
    """
    Get the current user's institution ID.

    Raises HTTPException if user has no institution.
    """
    if not user.institution_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no associated institution",
        )
    return user.institution_id


async def get_optional_institution_id(
    user: UserContext = Depends(get_current_user)
) -> Optional[UUID]:
    """
    Get the current user's institution ID, or None if not set.
    """
    return user.institution_id


# Legacy compatibility functions
# These maintain backward compatibility with existing code

def require_admin_legacy() -> bool:
    """
    Legacy admin check - always returns True.

    DEPRECATED: Use require_admin() dependency instead.
    """
    return True


def get_current_admin_id_legacy() -> UUID:
    """
    Legacy function to get admin ID.

    DEPRECATED: Use get_current_admin_id dependency instead.
    """
    return UUID("00000000-0000-0000-0000-000000000001")


def get_current_institution_id_legacy() -> UUID:
    """
    Legacy function to get institution ID.

    DEPRECATED: Use get_current_institution_id dependency instead.
    """
    return UUID("00000000-0000-0000-0000-000000000001")
