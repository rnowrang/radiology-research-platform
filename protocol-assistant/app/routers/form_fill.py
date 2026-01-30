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
from app.services.llm_form_filler import get_llm_form_filler
from app.services.learning_system import get_learning_system
from app.services.llm.base import LLMError
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

    Uses LLM-powered holistic form filling when enabled, with fallback
    to deterministic semantic matching if LLM fails.

    If form_id is provided, the form will be updated with filled values.
    If form_id is not provided and create_if_missing is true, a new form
    will be created from the template.
    """
    settings = get_settings()

    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

    form_id = request.form_id

    try:
        async with httpx.AsyncClient(
            base_url=settings.FORMS_SERVICE_URL,
            timeout=30.0,
            headers={"X-Internal-API-Key": settings.INTERNAL_API_KEY},
        ) as client:
            # Fetch template schema
            response = await client.get(f"/api/templates/{request.template_id}")
            response.raise_for_status()
            template_data = response.json()

            template_schema = template_data.get("schema", {})
            template_name = template_data.get("name", "Unknown")

            # Create form if needed
            if form_id is None and request.create_if_missing:
                create_response = await client.post(
                    "/api/forms",
                    json={
                        "template_id": request.template_id,
                        "title": f"{template_name} - Auto-filled",
                        "owner_id": str(user.id),
                        "project_id": project_id,
                    },
                )
                create_response.raise_for_status()
                created_form = create_response.json()
                form_id = created_form.get("id")
                logger.info(f"Created new form {form_id} for project {project_id}")

            # Calculate fill results
            result = None
            if settings.ENABLE_LLM_FORM_FILLER:
                try:
                    llm_filler = get_llm_form_filler(db)
                    result = await llm_filler.fill_form(
                        project_id=project_uuid,
                        template_schema=template_schema,
                        template_id=request.template_id,
                        template_name=template_name,
                        overwrite_existing=request.overwrite_existing,
                    )
                    logger.info(f"LLM form fill succeeded: {result.fill_rate}% fill rate")
                except LLMError as e:
                    logger.warning(f"LLM form fill failed, using fallback: {e}")
                except Exception as e:
                    logger.warning(f"LLM form fill error, using fallback: {e}")

            # Fallback to semantic filler
            if result is None:
                filler = get_semantic_form_filler(db)
                result = await filler.fill_form(
                    project_id=project_uuid,
                    template_schema=template_schema,
                    template_id=request.template_id,
                    template_name=template_name,
                    overwrite_existing=request.overwrite_existing,
                )

            # Apply filled values to form if we have a form_id
            logger.info(f"Checking form update: form_id={form_id}, filled_fields_count={len(result.filled_fields) if result.filled_fields else 0}")
            if form_id and result.filled_fields:
                # Filter by confidence if mode is high_confidence_only
                fields_to_apply = result.filled_fields
                if request.fill_mode == "high_confidence_only":
                    fields_to_apply = [f for f in fields_to_apply if f.confidence_level == "high"]

                if fields_to_apply:
                    # Build changes for form update
                    changes = [
                        {
                            "field_id": field.field_id,
                            "field_label": field.field_label,
                            "old_value": None,
                            "new_value": field.value,
                        }
                        for field in fields_to_apply
                    ]

                    # Update the form via forms-service
                    update_response = await client.post(
                        f"/api/forms/{form_id}/data",
                        json={
                            "changes": changes,
                            "user_id": str(user.id),
                        },
                    )
                    update_response.raise_for_status()
                    logger.info(f"Updated form {form_id} with {len(changes)} fields")

        return FormFillResponse(
            success=True,
            form_id=form_id,
            template_id=request.template_id,
            fill_result=result,
            message=f"Filled {len(result.filled_fields)} of {len(result.filled_fields) + len(result.unfilled_fields)} fields",
        )

    except httpx.HTTPStatusError as e:
        logger.error(f"Failed to fetch template or update form: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to communicate with forms service: {e.response.text if e.response else str(e)}",
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
    without actually applying the changes. Uses LLM-powered filling when
    enabled, with fallback to deterministic semantic matching.
    """
    settings = get_settings()

    try:
        project_uuid = UUID(project_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project ID format",
        )

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

        # Try LLM filler first if enabled
        preview = None
        if settings.ENABLE_LLM_FORM_FILLER:
            try:
                llm_filler = get_llm_form_filler(db)
                preview = await llm_filler.preview_fill(
                    project_id=project_uuid,
                    template_schema=template_schema,
                    template_id=template_id,
                    template_name=template_name,
                )
                logger.info(f"LLM form fill preview succeeded: {preview.fill_rate}% fill rate")
            except LLMError as e:
                logger.warning(f"LLM form fill preview failed, using fallback: {e}")
            except Exception as e:
                logger.warning(f"LLM form fill preview error, using fallback: {e}")

        # Fallback to semantic filler
        if preview is None:
            filler = get_semantic_form_filler(db)
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
