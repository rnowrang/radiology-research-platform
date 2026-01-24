"""Protocol Assistant FastAPI application."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import chat, documents, generation, admin, integrations, progress
from app.routers import audit
from app.middleware.audit import AuditMiddleware

# Configure logging
settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Handle application startup and shutdown events."""
    # Startup
    logger.info("Starting Protocol Assistant service...")
    logger.info(f"Default LLM provider: {settings.DEFAULT_LLM_PROVIDER}")
    logger.info(f"Claude API key configured: {settings.has_claude_api_key()}")
    logger.info(f"OpenAI API key configured: {settings.has_openai_api_key()}")
    logger.info("HIPAA compliance: enabled (always on)")
    logger.info("Audit logging: enabled")

    yield

    # Shutdown
    logger.info("Shutting down Protocol Assistant service...")


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
app.include_router(audit.router)
