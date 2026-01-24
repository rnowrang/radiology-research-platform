"""API endpoints for external integrations."""

import logging
import secrets
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_async_session
from app.integrations.credential_manager import (
    CredentialManager,
    CredentialEncryptionError,
)
from app.integrations.mendeley import MendeleyIntegration
from app.integrations.redcap import FieldMapping, REDCapForm, REDCapIntegration
from app.integrations.zotero import Citation, FormattedCitation, ZoteroIntegration

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


# Request/Response models
class ConnectRequest(BaseModel):
    """Request to connect an integration."""

    provider: str = Field(..., description="Integration provider name")
    credentials: dict = Field(..., description="Provider-specific credentials")


class ConnectResponse(BaseModel):
    """Response from connection attempt."""

    success: bool
    provider: str
    message: Optional[str] = None
    user_id: Optional[str] = None
    metadata: Optional[dict] = None


class DisconnectResponse(BaseModel):
    """Response from disconnection."""

    success: bool
    provider: str
    message: str


class IntegrationStatus(BaseModel):
    """Status of an integration connection."""

    provider: str
    connected: bool
    is_valid: bool = True
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    metadata: Optional[dict] = None


class ProviderInfo(BaseModel):
    """Information about an integration provider."""

    name: str
    auth_type: str
    description: str
    requires_oauth: bool = False
    oauth_url: Optional[str] = None


class SearchRequest(BaseModel):
    """Request for reference search."""

    query: str = Field(..., min_length=1, max_length=500)
    limit: int = Field(default=50, ge=1, le=100)


class CitationFormatRequest(BaseModel):
    """Request to format citations."""

    item_keys: list[str] = Field(..., min_items=1, max_items=50)
    style: str = Field(default="apa")


class OAuthStateRequest(BaseModel):
    """Request for OAuth authorization URL."""

    provider: str
    redirect_uri: str


class OAuthStateResponse(BaseModel):
    """Response with OAuth authorization details."""

    auth_url: str
    state: str


class REDCapFormsResponse(BaseModel):
    """Response with REDCap forms."""

    forms: list[str]


class REDCapFormDetailResponse(BaseModel):
    """Response with detailed REDCap form structure."""

    form: REDCapForm


class FieldMappingRequest(BaseModel):
    """Request for IRB field mapping suggestions."""

    irb_field_type: str


# Placeholder for user authentication
# In production, this would come from your auth system
def get_current_user_id() -> UUID:
    """Get the current authenticated user ID."""
    # TODO: Implement actual authentication
    return UUID("00000000-0000-0000-0000-000000000001")


@router.get("/providers", response_model=list[ProviderInfo])
async def list_providers() -> list[ProviderInfo]:
    """
    List all available integration providers.

    Returns information about each supported integration including
    authentication type and requirements.
    """
    settings = get_settings()

    return [
        ProviderInfo(
            name="zotero",
            auth_type="api_key",
            description="Zotero reference manager - access your library and format citations",
            requires_oauth=False,
        ),
        ProviderInfo(
            name="mendeley",
            auth_type="oauth",
            description="Mendeley reference manager - sync documents and folders",
            requires_oauth=True,
            oauth_url="https://api.mendeley.com/oauth/authorize",
        ),
        ProviderInfo(
            name="redcap",
            auth_type="api_token",
            description="REDCap research data capture - sync forms and data",
            requires_oauth=False,
        ),
    ]


@router.post("/connect", response_model=ConnectResponse)
async def connect_integration(
    request: ConnectRequest,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> ConnectResponse:
    """
    Connect an external integration.

    Authenticates with the provider and stores credentials securely.
    """
    provider = request.provider.lower()
    settings = get_settings()

    try:
        if provider == "zotero":
            integration = ZoteroIntegration()
            result = await integration.authenticate(request.credentials)
        elif provider == "mendeley":
            integration = MendeleyIntegration(
                client_id=settings.MENDELEY_CLIENT_ID if hasattr(settings, 'MENDELEY_CLIENT_ID') else None,
                client_secret=settings.MENDELEY_CLIENT_SECRET if hasattr(settings, 'MENDELEY_CLIENT_SECRET') else None,
            )
            result = await integration.authenticate(request.credentials)
        elif provider == "redcap":
            integration = REDCapIntegration()
            result = await integration.authenticate(request.credentials)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown provider: {provider}",
            )

        if result.success:
            # Store credentials securely
            try:
                cred_manager = CredentialManager(db)
                await cred_manager.store_credentials(
                    user_id=user_id,
                    provider=provider,
                    credentials={
                        **request.credentials,
                        "access_token": result.access_token,
                        "refresh_token": result.refresh_token,
                        "user_id": result.user_id,
                    },
                    expires_at=result.expires_at,
                    metadata=result.metadata,
                )
                await db.commit()
            except CredentialEncryptionError as e:
                logger.error(f"Failed to store credentials: {e}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to store credentials securely",
                )

            return ConnectResponse(
                success=True,
                provider=provider,
                message="Successfully connected",
                user_id=result.user_id,
                metadata=result.metadata,
            )
        else:
            return ConnectResponse(
                success=False,
                provider=provider,
                message=result.error,
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Connection error for {provider}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to connect: {str(e)}",
        )


@router.delete("/{provider}", response_model=DisconnectResponse)
async def disconnect_integration(
    provider: str,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> DisconnectResponse:
    """
    Disconnect an integration and remove stored credentials.
    """
    try:
        cred_manager = CredentialManager(db)
        deleted = await cred_manager.delete_credentials(user_id, provider.lower())
        await db.commit()

        if deleted:
            return DisconnectResponse(
                success=True,
                provider=provider,
                message="Successfully disconnected",
            )
        else:
            return DisconnectResponse(
                success=True,
                provider=provider,
                message="No connection found",
            )
    except Exception as e:
        logger.exception(f"Disconnect error for {provider}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disconnect: {str(e)}",
        )


@router.get("/{provider}/status", response_model=IntegrationStatus)
async def get_integration_status(
    provider: str,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> IntegrationStatus:
    """
    Check the connection status of an integration.
    """
    try:
        cred_manager = CredentialManager(db)
        record = await cred_manager.get_credential_record(user_id, provider.lower())

        if not record:
            return IntegrationStatus(
                provider=provider,
                connected=False,
            )

        return IntegrationStatus(
            provider=provider,
            connected=True,
            is_valid=record.is_valid,
            expires_at=record.expires_at,
            last_used_at=record.last_used_at,
            metadata=record.metadata,
        )
    except Exception as e:
        logger.exception(f"Status check error for {provider}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to check status: {str(e)}",
        )


@router.get("/status", response_model=list[IntegrationStatus])
async def get_all_integration_status(
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> list[IntegrationStatus]:
    """
    Get status of all integrations for the current user.
    """
    try:
        cred_manager = CredentialManager(db)
        integrations = await cred_manager.list_user_integrations(user_id)

        return [
            IntegrationStatus(
                provider=i["provider"],
                connected=True,
                is_valid=i["is_valid"],
                expires_at=datetime.fromisoformat(i["expires_at"])
                if i["expires_at"]
                else None,
                last_used_at=datetime.fromisoformat(i["last_used_at"])
                if i["last_used_at"]
                else None,
                metadata=i["metadata"],
            )
            for i in integrations
        ]
    except Exception as e:
        logger.exception("Failed to get integration statuses")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get statuses: {str(e)}",
        )


@router.post("/oauth/state", response_model=OAuthStateResponse)
async def get_oauth_state(
    request: OAuthStateRequest,
) -> OAuthStateResponse:
    """
    Get OAuth authorization URL and state for OAuth providers.
    """
    provider = request.provider.lower()
    settings = get_settings()

    if provider == "mendeley":
        state = secrets.token_urlsafe(32)
        integration = MendeleyIntegration(
            client_id=settings.MENDELEY_CLIENT_ID if hasattr(settings, 'MENDELEY_CLIENT_ID') else None,
        )
        auth_url = integration.get_auth_url(request.redirect_uri, state)

        return OAuthStateResponse(auth_url=auth_url, state=state)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider {provider} does not support OAuth",
        )


# Zotero-specific endpoints
@router.post("/zotero/search", response_model=list[Citation])
async def search_zotero(
    request: SearchRequest,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> list[Citation]:
    """
    Search the user's Zotero library.
    """
    cred_manager = CredentialManager(db)
    creds = await cred_manager.get_credentials(user_id, "zotero")

    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Zotero not connected. Please connect your Zotero account first.",
        )

    try:
        zotero = ZoteroIntegration(
            api_key=creds.get("api_key") or creds.get("access_token"),
            user_id=creds.get("user_id"),
        )
        results = await zotero.search_references(request.query, limit=request.limit)
        return results
    except Exception as e:
        logger.exception("Zotero search error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )


@router.get("/zotero/library", response_model=list[Citation])
async def get_zotero_library(
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> list[Citation]:
    """
    Get items from the user's Zotero library.
    """
    cred_manager = CredentialManager(db)
    creds = await cred_manager.get_credentials(user_id, "zotero")

    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Zotero not connected",
        )

    try:
        zotero = ZoteroIntegration(
            api_key=creds.get("api_key") or creds.get("access_token"),
            user_id=creds.get("user_id"),
        )
        return await zotero.get_library(limit=limit, start=offset)
    except Exception as e:
        logger.exception("Zotero library fetch error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch library: {str(e)}",
        )


@router.post("/zotero/format", response_model=list[FormattedCitation])
async def format_zotero_citations(
    request: CitationFormatRequest,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> list[FormattedCitation]:
    """
    Format Zotero citations in a specific style.
    """
    cred_manager = CredentialManager(db)
    creds = await cred_manager.get_credentials(user_id, "zotero")

    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Zotero not connected",
        )

    try:
        zotero = ZoteroIntegration(
            api_key=creds.get("api_key") or creds.get("access_token"),
            user_id=creds.get("user_id"),
        )
        return await zotero.format_citations(request.item_keys, style=request.style)
    except Exception as e:
        logger.exception("Citation formatting error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Formatting failed: {str(e)}",
        )


# Mendeley-specific endpoints
@router.post("/mendeley/search", response_model=list[Citation])
async def search_mendeley(
    request: SearchRequest,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> list[Citation]:
    """
    Search the user's Mendeley library.
    """
    cred_manager = CredentialManager(db)
    creds = await cred_manager.get_credentials(user_id, "mendeley")

    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Mendeley not connected",
        )

    # Check if token is expired and refresh if needed
    is_expired = await cred_manager.is_token_expired(user_id, "mendeley")
    if is_expired:
        settings = get_settings()
        mendeley = MendeleyIntegration(
            client_id=settings.MENDELEY_CLIENT_ID if hasattr(settings, 'MENDELEY_CLIENT_ID') else None,
            client_secret=settings.MENDELEY_CLIENT_SECRET if hasattr(settings, 'MENDELEY_CLIENT_SECRET') else None,
        )
        refresh_result = await mendeley.refresh_token(creds.get("refresh_token"))
        if refresh_result.success:
            await cred_manager.update_credentials(
                user_id,
                "mendeley",
                {
                    **creds,
                    "access_token": refresh_result.access_token,
                    "refresh_token": refresh_result.refresh_token,
                },
                expires_at=refresh_result.expires_at,
            )
            await db.commit()
            creds["access_token"] = refresh_result.access_token
        else:
            await cred_manager.mark_invalid(user_id, "mendeley", "Token refresh failed")
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired. Please reconnect Mendeley.",
            )

    try:
        mendeley = MendeleyIntegration(access_token=creds.get("access_token"))
        return await mendeley.search_references(request.query, limit=request.limit)
    except Exception as e:
        logger.exception("Mendeley search error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )


# REDCap-specific endpoints
@router.get("/redcap/forms", response_model=REDCapFormsResponse)
async def get_redcap_forms(
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> REDCapFormsResponse:
    """
    Get list of available REDCap forms/instruments.
    """
    cred_manager = CredentialManager(db)
    creds = await cred_manager.get_credentials(user_id, "redcap")

    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="REDCap not connected",
        )

    try:
        redcap = REDCapIntegration(
            api_url=creds.get("api_url"),
            api_token=creds.get("api_token") or creds.get("access_token"),
        )
        forms = await redcap.get_forms()
        return REDCapFormsResponse(forms=forms)
    except Exception as e:
        logger.exception("REDCap forms fetch error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch forms: {str(e)}",
        )


@router.get("/redcap/forms/{form_name}", response_model=REDCapFormDetailResponse)
async def get_redcap_form_detail(
    form_name: str,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> REDCapFormDetailResponse:
    """
    Get detailed structure of a REDCap form.
    """
    cred_manager = CredentialManager(db)
    creds = await cred_manager.get_credentials(user_id, "redcap")

    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="REDCap not connected",
        )

    try:
        redcap = REDCapIntegration(
            api_url=creds.get("api_url"),
            api_token=creds.get("api_token") or creds.get("access_token"),
        )
        form = await redcap.export_form_structure(form_name)
        return REDCapFormDetailResponse(form=form)
    except Exception as e:
        logger.exception("REDCap form detail error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch form: {str(e)}",
        )


@router.post("/redcap/mapping-suggestions", response_model=list[FieldMapping])
async def get_irb_field_mappings(
    request: FieldMappingRequest,
    db: AsyncSession = Depends(get_async_session),
    user_id: UUID = Depends(get_current_user_id),
) -> list[FieldMapping]:
    """
    Get suggested mappings between REDCap and IRB form fields.
    """
    cred_manager = CredentialManager(db)
    creds = await cred_manager.get_credentials(user_id, "redcap")

    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="REDCap not connected",
        )

    try:
        redcap = REDCapIntegration(
            api_url=creds.get("api_url"),
            api_token=creds.get("api_token") or creds.get("access_token"),
        )
        mappings = await redcap.get_field_for_irb_mapping(request.irb_field_type)
        return mappings
    except Exception as e:
        logger.exception("REDCap mapping error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get mappings: {str(e)}",
        )
