"""API routers for Protocol Assistant."""

from app.routers.chat import router as chat_router
from app.routers.documents import router as documents_router
from app.routers.generation import router as generation_router
from app.routers.admin import router as admin_router
from app.routers.integrations import router as integrations_router

__all__ = [
    "chat_router",
    "documents_router",
    "generation_router",
    "admin_router",
    "integrations_router",
]
