"""Base integration provider interface for external services."""

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AuthResult(BaseModel):
    """Result of an authentication attempt."""

    success: bool
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[datetime] = None
    user_id: Optional[str] = None
    error: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class SyncResult(BaseModel):
    """Result of a synchronization operation."""

    success: bool
    items_synced: int = 0
    items_created: int = 0
    items_updated: int = 0
    items_deleted: int = 0
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    duration_seconds: float = 0.0
    last_sync_token: Optional[str] = None


class IntegrationProvider(ABC):
    """
    Abstract base class for external integration providers.

    All integration providers must implement authentication,
    token refresh, and connection testing methods.
    """

    name: str

    @abstractmethod
    async def authenticate(self, credentials: dict) -> AuthResult:
        """
        Authenticate with the external service.

        Args:
            credentials: Provider-specific credentials (API key, OAuth code, etc.)

        Returns:
            AuthResult with success status and tokens if successful
        """
        pass

    @abstractmethod
    async def refresh_token(self, refresh_token: str) -> AuthResult:
        """
        Refresh an expired access token.

        Args:
            refresh_token: The refresh token from previous authentication

        Returns:
            AuthResult with new tokens if successful
        """
        pass

    @abstractmethod
    async def test_connection(self, access_token: str) -> bool:
        """
        Test if the current credentials are valid.

        Args:
            access_token: The access token to test

        Returns:
            True if connection is valid, False otherwise
        """
        pass

    async def revoke_token(self, access_token: str) -> bool:
        """
        Revoke an access token (optional implementation).

        Args:
            access_token: The access token to revoke

        Returns:
            True if revocation was successful
        """
        return True

    def get_auth_url(self, redirect_uri: str, state: str) -> Optional[str]:
        """
        Get OAuth authorization URL (for OAuth providers).

        Args:
            redirect_uri: URI to redirect after authorization
            state: State parameter for CSRF protection

        Returns:
            Authorization URL or None if not applicable
        """
        return None
