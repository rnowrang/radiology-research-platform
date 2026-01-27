"""Coherence Service FastAPI application.

The Coherence Service is responsible for:
- Detecting inconsistencies across project documents
- Maintaining coherence rules registry
- Real-time and batch conflict detection
- Conflict resolution workflows
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.coherence import router as coherence_router
from app.database import check_database_connection

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
    logger.info("Starting Coherence Service...")

    # Check database connection
    if await check_database_connection():
        logger.info("Database connection established")
    else:
        logger.warning("Database connection failed - some features may not work")

    # Initialize rule engine
    from app.services.rule_engine import get_rule_engine
    engine = get_rule_engine()
    logger.info("Rule engine initialized with %d rules", len(engine.rules))

    yield

    # Shutdown
    logger.info("Shutting down Coherence Service...")


app = FastAPI(
    title="Coherence Service",
    description="Real-time coherence detection and conflict resolution for research projects",
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


@app.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    db_connected = await check_database_connection()

    from app.services.rule_engine import get_rule_engine
    engine = get_rule_engine()

    return {
        "status": "healthy" if db_connected else "degraded",
        "service": "coherence-service",
        "version": "1.0.0",
        "components": {
            "database": "connected" if db_connected else "disconnected",
            "rules_loaded": len(engine.rules),
        },
    }


@app.get("/")
async def root() -> dict:
    """Root endpoint."""
    return {
        "service": "Coherence Service",
        "version": "1.0.0",
        "docs": "/docs",
    }


# Include routers
app.include_router(coherence_router)
