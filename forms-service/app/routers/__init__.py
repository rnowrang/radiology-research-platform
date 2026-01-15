"""API routers for Forms Service."""

from app.routers.templates import router as templates_router
from app.routers.forms import router as forms_router
from app.routers.versions import router as versions_router
from app.routers.export import router as export_router
from app.routers.health import router as health_router

__all__ = [
    "templates_router",
    "forms_router",
    "versions_router",
    "export_router",
    "health_router",
]
