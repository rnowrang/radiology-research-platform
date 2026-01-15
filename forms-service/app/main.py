"""Main FastAPI application for Forms Service."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    templates_router,
    forms_router,
    versions_router,
    export_router,
    health_router,
)

settings = get_settings()

app = FastAPI(
    title="Radiology Research Platform - Forms Service",
    description="API for form templates, instances, and document generation",
    version="1.0.0",
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router)
app.include_router(templates_router)
app.include_router(forms_router)
app.include_router(versions_router)
app.include_router(export_router)


@app.on_event("startup")
async def startup():
    """Application startup tasks."""
    import os

    # Ensure storage directories exist
    os.makedirs(settings.template_dir, exist_ok=True)
    os.makedirs(settings.generated_dir, exist_ok=True)
    os.makedirs(settings.upload_dir, exist_ok=True)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "forms-service",
        "version": "1.0.0",
        "status": "running",
    }
