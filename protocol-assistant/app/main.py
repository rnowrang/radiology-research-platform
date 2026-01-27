"""Protocol Assistant FastAPI application."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import chat, documents, generation, admin, integrations, progress, wizard
from app.routers import audit
from app.routers import questionnaire, knowledge, form_fill, learning
from app.middleware.audit import AuditMiddleware

# Configure logging
settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global service references
_graph_service: Optional[object] = None
_event_bus: Optional[object] = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Handle application startup and shutdown events."""
    global _graph_service, _event_bus

    # Startup
    logger.info("Starting Protocol Assistant service...")
    logger.info(f"Default LLM provider: {settings.DEFAULT_LLM_PROVIDER}")
    logger.info(f"Claude API key configured: {settings.has_claude_api_key()}")
    logger.info(f"OpenAI API key configured: {settings.has_openai_api_key()}")
    logger.info("HIPAA compliance: enabled (always on)")
    logger.info("Audit logging: enabled")

    # Initialize Neo4j Graph Service
    try:
        from app.services.graph_service import init_graph_service
        _graph_service = await init_graph_service()
        logger.info("Neo4j graph service initialized")
    except Exception as e:
        logger.warning(f"Neo4j not available, graph features disabled: {e}")
        _graph_service = None

    # Initialize Redis Event Bus
    try:
        from app.services.event_bus import init_event_bus
        _event_bus = await init_event_bus()
        logger.info("Redis event bus initialized")
    except Exception as e:
        logger.warning(f"Redis not available, event streaming disabled: {e}")
        _event_bus = None

    yield

    # Shutdown
    logger.info("Shutting down Protocol Assistant service...")

    # Close Neo4j connection
    if _graph_service is not None:
        try:
            await _graph_service.close()
            logger.info("Neo4j connection closed")
        except Exception as e:
            logger.error(f"Error closing Neo4j: {e}")

    # Close Redis connection
    if _event_bus is not None:
        try:
            await _event_bus.close()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Error closing Redis: {e}")


app = FastAPI(
    title="Protocol Assistant",
    description="AI-powered assistance for IRB protocol preparation",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add audit middleware for HIPAA compliance logging
# Note: Middleware is executed in reverse order of addition
app.add_middleware(AuditMiddleware)


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "protocol-assistant",
        "version": "1.0.0",
        "components": {
            "neo4j": "connected" if _graph_service is not None else "unavailable",
            "redis": "connected" if _event_bus is not None else "unavailable",
        },
    }


@app.get("/")
async def root() -> dict:
    """Root endpoint."""
    return {
        "service": "Protocol Assistant",
        "version": "1.0.0",
        "docs": "/docs",
    }


# Include routers
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(generation.router)
app.include_router(admin.router)
app.include_router(integrations.router)
app.include_router(progress.router)
app.include_router(wizard.router)
app.include_router(audit.router)

# Intelligent form filling routers
app.include_router(questionnaire.router)
app.include_router(knowledge.router)
app.include_router(form_fill.router)
app.include_router(learning.router)
