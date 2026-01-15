"""API routers for Forms Service."""

from app.routers.templates import router as templates_router
from app.routers.forms import router as forms_router
from app.routers.versions import router as versions_router
from app.routers.export import router as export_router
from app.routers.health import router as health_router
from app.routers.review import router as review_router
from app.routers.review_stages import router as review_stages_router
from app.routers.projects import router as projects_router
from app.routers.tasks import router as tasks_router
from app.routers.locks import router as locks_router
from app.routers.amendments import router as amendments_router

__all__ = [
    "templates_router",
    "forms_router",
    "versions_router",
    "export_router",
    "health_router",
    "review_router",
    "review_stages_router",
    "projects_router",
    "tasks_router",
    "locks_router",
    "amendments_router",
]
