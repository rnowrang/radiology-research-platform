"""Secure credential storage and management for external integrations."""

import json
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.integration import UserIntegrationCredentials

logger = logging.getLogger(__name__)


class CredentialEncryptionError(Exception):
    """Raised when credential encryption/decryption fails."""

    pass


class CredentialNotFoundError(Exception):
    """Raised when credentials are not found."""

    pass


class CredentialManager:
    """
    Manages secure storage and retrieval of integration credentials.

    Uses Fernet symmetric encryption to protect sensitive data at rest.
    Credentials are stored per-user and per-provider.
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize credential manager.

        Args:
            db: Async database session
        """
        self.db = db
        settings = get_settings()

        # Initialize Fernet cipher with encryption key
        try:
            key = settings.ENCRYPTION_KEY
            # Ensure key is proper Fernet key format (32 url-safe base64-encoded bytes)
            if len(key) < 32:
                # Pad short keys (not recommended for production)
                key = key.ljust(32, "0")
            self.cipher = Fernet(key.encode() if isinstance(key, str) else key)
        except Exception as e:
            logger.error(f"Failed to initialize encryption: {e}")
            raise CredentialEncryptionError(
                "Failed to initialize encryption. Check ENCRYPTION_KEY configuration."
            )

    def _encrypt(self, data: dict) -> bytes:
        """
        Encrypt credential data.

        Args:
            data: Dictionary of credentials to encrypt

        Returns:
            Encrypted bytes
        """
        try:
            json_data = json.dumps(data)
            return self.cipher.encrypt(json_data.encode())
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise CredentialEncryptionError("Failed to encrypt credentials")

    def _decrypt(self, encrypted_data: bytes) -> dict:
        """
        Decrypt credential data.

        Args:
            encrypted_data: Encrypted bytes

        Returns:
            Decrypted dictionary
        """
        try:
            decrypted = self.cipher.decrypt(encrypted_data)
            return json.loads(decrypted.decode())
        except InvalidToken:
            logger.error("Invalid encryption token - credentials may be corrupted")
            raise CredentialEncryptionError(
                "Failed to decrypt credentials - invalid token"
            )
        except json.JSONDecodeError:
            logger.error("Failed to parse decrypted credentials as JSON")
            raise CredentialEncryptionError(
                "Failed to decrypt credentials - invalid format"
            )
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise CredentialEncryptionError("Failed to decrypt credentials")

    async def store_credentials(
        self,
        user_id: UUID,
        provider: str,
        credentials: dict,
        expires_at: datetime = None,
        provider_instance: str = None,
        token_type: str = "oauth2",
        scopes: list[str] = None,
        metadata: dict = None,
    ) -> UUID:
        """
        Store encrypted credentials for a user and provider.

        Args:
            user_id: User ID
            provider: Provider name (zotero, mendeley, redcap)
            credentials: Credential data to encrypt and store
            expires_at: Optional token expiration time
            provider_instance: Optional provider instance identifier
            token_type: Type of token (oauth2, api_key, basic)
            scopes: OAuth scopes granted
            metadata: Additional metadata

        Returns:
            ID of the stored credential record
        """
        encrypted = self._encrypt(credentials)

        # Check if credentials already exist
        result = await self.db.execute(
            select(UserIntegrationCredentials).where(
                UserIntegrationCredentials.user_id == user_id,
                UserIntegrationCredentials.provider == provider,
                UserIntegrationCredentials.provider_instance == provider_instance,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing credentials
            existing.credentials_encrypted = encrypted
            existing.expires_at = expires_at
            existing.access_token_expires_at = expires_at
            existing.token_type = token_type
            existing.scopes = scopes or []
            existing.cred_metadata = metadata or {}
            existing.is_valid = True
            existing.error_count = 0
            existing.last_error = None
            existing.updated_at = datetime.utcnow()
            await self.db.flush()
            return existing.id
        else:
            # Create new credentials
            cred = UserIntegrationCredentials(
                user_id=user_id,
                provider=provider,
                provider_instance=provider_instance,
                credentials_encrypted=encrypted,
                expires_at=expires_at,
                access_token_expires_at=expires_at,
                token_type=token_type,
                scopes=scopes or [],
                metadata=metadata or {},
                is_active=True,
                is_valid=True,
            )
            self.db.add(cred)
            await self.db.flush()
            return cred.id

    async def get_credentials(
        self,
        user_id: UUID,
        provider: str,
        provider_instance: str = None,
    ) -> Optional[dict]:
        """
        Retrieve decrypted credentials for a user and provider.

        Args:
            user_id: User ID
            provider: Provider name
            provider_instance: Optional provider instance

        Returns:
            Decrypted credentials dict or None if not found
        """
        query = select(UserIntegrationCredentials).where(
            UserIntegrationCredentials.user_id == user_id,
            UserIntegrationCredentials.provider == provider,
            UserIntegrationCredentials.is_active == True,
        )

        if provider_instance:
            query = query.where(
                UserIntegrationCredentials.provider_instance == provider_instance
            )

        result = await self.db.execute(query)
        cred = result.scalar_one_or_none()

        if not cred:
            return None

        # Update last used timestamp
        cred.last_used_at = datetime.utcnow()
        await self.db.flush()

        return self._decrypt(cred.credentials_encrypted)

    async def get_credential_record(
        self,
        user_id: UUID,
        provider: str,
        provider_instance: str = None,
    ) -> Optional[UserIntegrationCredentials]:
        """
        Get the full credential record (without decryption).

        Args:
            user_id: User ID
            provider: Provider name
            provider_instance: Optional provider instance

        Returns:
            Credential record or None
        """
        query = select(UserIntegrationCredentials).where(
            UserIntegrationCredentials.user_id == user_id,
            UserIntegrationCredentials.provider == provider,
        )

        if provider_instance:
            query = query.where(
                UserIntegrationCredentials.provider_instance == provider_instance
            )

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update_credentials(
        self,
        user_id: UUID,
        provider: str,
        credentials: dict,
        expires_at: datetime = None,
        provider_instance: str = None,
    ) -> bool:
        """
        Update existing credentials.

        Args:
            user_id: User ID
            provider: Provider name
            credentials: New credential data
            expires_at: New expiration time
            provider_instance: Optional provider instance

        Returns:
            True if updated, False if not found
        """
        encrypted = self._encrypt(credentials)

        query = (
            update(UserIntegrationCredentials)
            .where(
                UserIntegrationCredentials.user_id == user_id,
                UserIntegrationCredentials.provider == provider,
            )
            .values(
                credentials_encrypted=encrypted,
                expires_at=expires_at,
                access_token_expires_at=expires_at,
                is_valid=True,
                error_count=0,
                last_error=None,
                updated_at=datetime.utcnow(),
            )
        )

        if provider_instance:
            query = query.where(
                UserIntegrationCredentials.provider_instance == provider_instance
            )

        result = await self.db.execute(query)
        return result.rowcount > 0

    async def delete_credentials(
        self,
        user_id: UUID,
        provider: str,
        provider_instance: str = None,
    ) -> bool:
        """
        Delete credentials for a user and provider.

        Args:
            user_id: User ID
            provider: Provider name
            provider_instance: Optional provider instance

        Returns:
            True if deleted, False if not found
        """
        query = select(UserIntegrationCredentials).where(
            UserIntegrationCredentials.user_id == user_id,
            UserIntegrationCredentials.provider == provider,
        )

        if provider_instance:
            query = query.where(
                UserIntegrationCredentials.provider_instance == provider_instance
            )

        result = await self.db.execute(query)
        cred = result.scalar_one_or_none()

        if cred:
            await self.db.delete(cred)
            return True
        return False

    async def mark_invalid(
        self,
        user_id: UUID,
        provider: str,
        error_message: str = None,
        provider_instance: str = None,
    ) -> bool:
        """
        Mark credentials as invalid (e.g., after token revocation).

        Args:
            user_id: User ID
            provider: Provider name
            error_message: Optional error message
            provider_instance: Optional provider instance

        Returns:
            True if updated, False if not found
        """
        cred = await self.get_credential_record(user_id, provider, provider_instance)

        if cred:
            cred.is_valid = False
            cred.error_count = (cred.error_count or 0) + 1
            cred.last_error = error_message
            cred.updated_at = datetime.utcnow()
            await self.db.flush()
            return True
        return False

    async def is_token_expired(
        self,
        user_id: UUID,
        provider: str,
        provider_instance: str = None,
    ) -> Optional[bool]:
        """
        Check if stored token has expired.

        Args:
            user_id: User ID
            provider: Provider name
            provider_instance: Optional provider instance

        Returns:
            True if expired, False if not, None if no credentials found
        """
        cred = await self.get_credential_record(user_id, provider, provider_instance)

        if not cred:
            return None

        if not cred.expires_at:
            return False  # No expiration means never expires (API keys)

        return datetime.utcnow() > cred.expires_at

    async def list_user_integrations(
        self,
        user_id: UUID,
    ) -> list[dict]:
        """
        List all integrations for a user.

        Args:
            user_id: User ID

        Returns:
            List of integration status dictionaries
        """
        result = await self.db.execute(
            select(UserIntegrationCredentials).where(
                UserIntegrationCredentials.user_id == user_id
            )
        )
        credentials = result.scalars().all()

        return [
            {
                "provider": cred.provider,
                "provider_instance": cred.provider_instance,
                "is_active": cred.is_active,
                "is_valid": cred.is_valid,
                "expires_at": cred.expires_at.isoformat() if cred.expires_at else None,
                "last_used_at": cred.last_used_at.isoformat()
                if cred.last_used_at
                else None,
                "scopes": cred.scopes,
                "metadata": cred.cred_metadata,
            }
            for cred in credentials
        ]
