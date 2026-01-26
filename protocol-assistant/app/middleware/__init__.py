"""Middleware modules for Protocol Assistant."""

from app.middleware.audit import AuditMiddleware
from app.middleware.auth import (
    AuthMiddleware,
    UserContext,
    get_current_user,
    get_optional_user,
    require_role,
    require_admin,
    get_current_admin_id,
    get_current_institution_id,
    get_optional_institution_id,
)

__all__ = [
    "AuditMiddleware",
    "AuthMiddleware",
    "UserContext",
    "get_current_user",
    "get_optional_user",
    "require_role",
    "require_admin",
    "get_current_admin_id",
    "get_current_institution_id",
    "get_optional_institution_id",
]
