"""API endpoints for intelligent form filling."""

import logging
from typing import List, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_async_session
from app.middleware.auth import get_current_user, UserContext
from app.services.semantic_filler import get_semantic_form_filler
from app.services.learning_system import get_learning_system
from app.schemas.knowledge import (
    FormFillResult,
    FormFillPreview,
    FillFormRequest,
    CorrectionRecord,
    CorrectionRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["form-fill"])


class FormFillResponse(BaseModel):
    """Response from form fill operation."""
    success: bool
    form_id: Optional[int] = None
    template_id: int
    fill_result: FormFillResult
    message: str


@router.post(
    "/projects/{project_id}/fill-form",
    response_model=FormFillResponse,
    summary="Fill a form using knowledge base",
)
async def fill_form(
    project_id: str,
    request: FillFormRequest,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Fill a form using the project knowledge base.

    Uses semantic matching to find relevant values and applies them
    with confidence scoring.
    """
    settings = get_settings()

    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    filler = get_semantic_form_filler(db)

    try:
        # Fetch template schema from forms service
        async with httpx.AsyncClient(
            base_url=settings.FORMS_SERVICE_URL,
            timeout=30.0,
            headers={"X-Internal-API-Key": settings.INTERNAL_API_KEY},
        ) as client:
            response = await client.get(f"/api/templates/{request.template_id}")
            response.raise_for_status()
            template_data = response.json()

        template_schema = template_data.get("schema", {})
        template_name = template_data.get("name", "Unknown")

        # Fill the form
        result = await filler.fill_form(
            project_id=project_uuid,
            template_schema=template_schema,
            template_id=request.template_id,
            template_name=template_name,
            overwrite_existing=request.overwrite_existing,
        )

        return FormFillResponse(
            success=True,
            template_id=request.template_id,
            fill_result=result,
            message=f"Filled {len(result.filled_fields)} of {len(result.filled_fields) + len(result.unfilled_fields)} fields",
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"Failed to fetch template: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch form template",
        )
    except Exception as e:
        logger.error(f"Form fill failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get(
    "/projects/{project_id}/fill-preview/{template_id}",
    response_model=FormFillPreview,
    summary="Preview form fill",
)
async def preview_form_fill(
    project_id: str,
    template_id: int,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Preview what form filling would produce.

    Returns all fields with their proposed values and confidence scores,
    without actually applying the changes.
    """
    settings = get_settings()

    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    filler = get_semantic_form_filler(db)

    try:
        # Fetch template schema
        async with httpx.AsyncClient(
            base_url=settings.FORMS_SERVICE_URL,
            timeout=30.0,
            headers={"X-Internal-API-Key": settings.INTERNAL_API_KEY},
        ) as client:
            response = await client.get(f"/api/templates/{template_id}")
            response.raise_for_status()
            template_data = response.json()

        template_schema = template_data.get("schema", {})
        template_name = template_data.get("name", "Unknown")

        # Generate preview
        preview = await filler.preview_fill(
            project_id=project_uuid,
            template_schema=template_schema,
            template_id=template_id,
            template_name=template_name,
        )

        return preview

    except httpx.HTTPStatusError as e:
        logger.error(f"Failed to fetch template: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch form template",
        )
    except Exception as e:
        logger.error(f"Fill preview failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post(
    "/forms/{form_id}/correction",
    summary="Record form correction",
)
async def record_correction(
    form_id: int,
    request: CorrectionRequest,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Record user corrections for learning.

    When a user corrects AI-suggested values, this endpoint records
    the correction to improve future form fills.
    """
    learning = get_learning_system(db)

    user_uuid = user.id
    inst_uuid = user.institution_id

    if not user_uuid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID is required",
        )

    try:
        # Get form details to find project
        settings = get_settings()
        project_id = None

        try:
            async with httpx.AsyncClient(
                base_url=settings.GATEWAY_URL,
                timeout=30.0,
                headers={
                    "X-Internal-API-Key": settings.INTERNAL_API_KEY,
                    "X-User-ID": user_id,
                },
            ) as client:
                response = await client.get(f"/api/forms/{form_id}")
                response.raise_for_status()
                form_data = response.json()
                project_id = form_data.get("data", {}).get("project_id")
        except Exception as e:
            logger.warning(f"Failed to fetch form details: {e}")

        project_uuid = UUID(project_id) if project_id else None

        # Record each correction
        count = await learning.record_corrections_batch(
            user_id=user_uuid,
            project_id=project_uuid,
            institution_id=inst_uuid,
            form_template_id=request.form_id,
            corrections=request.corrections,
        )

        return {
            "success": True,
            "corrections_recorded": count,
        }

    except Exception as e:
        logger.error(f"Failed to record correction: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get(
    "/institutions/{institution_id}/patterns",
    summary="Get institution patterns",
)
async def get_institution_patterns(
    institution_id: str,
    pattern_type: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Get learned patterns for an institution."""
    from app.services.entity_patterns import get_entity_pattern_service

    try:
        inst_uuid = UUID(institution_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid institution ID format",
        )

    pattern_service = get_entity_pattern_service(db)

    try:
        if pattern_type:
            patterns = await pattern_service.get_common_patterns(
                institution_id=inst_uuid,
                pattern_type=pattern_type,
                limit=limit,
            )
        else:
            # Get all pattern types
            patterns = []
            for ptype in ["pi_info", "procedure", "department", "standard_language"]:
                type_patterns = await pattern_service.get_common_patterns(
                    institution_id=inst_uuid,
                    pattern_type=ptype,
                    limit=limit // 4,
                )
                patterns.extend(type_patterns)

        return {
            "patterns": [p.model_dump() for p in patterns],
            "total": len(patterns),
        }

    except Exception as e:
        logger.error(f"Failed to get patterns: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get(
    "/institutions/{institution_id}/suggest-pi",
    summary="Suggest PI information",
)
async def suggest_pi(
    institution_id: str,
    query: str,
    limit: int = 5,
    db: AsyncSession = Depends(get_async_session),
    user: UserContext = Depends(get_current_user),
):
    """Suggest PI information based on partial name."""
    from app.services.entity_patterns import get_entity_pattern_service

    try:
        inst_uuid = UUID(institution_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid institution ID format",
        )

    pattern_service = get_entity_pattern_service(db)

    try:
        suggestions = await pattern_service.suggest_pi(
            institution_id=inst_uuid,
            partial_name=query,
            limit=limit,
        )

        return {
            "suggestions": [s.model_dump() for s in suggestions],
            "query": query,
        }

    except Exception as e:
        logger.error(f"PI suggestion failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
