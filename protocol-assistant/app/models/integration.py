"""Integration and credentials models for Protocol Assistant."""

from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
    Index,
    LargeBinary,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base
import uuid


class UserIntegrationCredentials(Base):
    """
    Stores encrypted credentials for external integrations.

    Supports OAuth tokens, API keys, and other authentication
    methods for services like REDCap, EHR systems, etc.
    """
    __tablename__ = "user_integration_credentials"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # User scope
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    institution_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # Provider identification
    provider = Column(String(100), nullable=False, index=True)  # redcap, epic, cerner, etc.
    provider_instance = Column(String(255), nullable=True)  # Specific instance URL/ID

    # Encrypted credentials (stored as bytes)
    credentials_encrypted = Column(LargeBinary, nullable=False)
    encryption_key_id = Column(String(100), nullable=True)  # Reference to key used
    encryption_algorithm = Column(String(50), default="AES-256-GCM")

    # Token management
    token_type = Column(String(50), default="oauth2")  # oauth2, api_key, basic, certificate
    access_token_expires_at = Column(DateTime, nullable=True)
    refresh_token_expires_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)  # General expiration

    # Scopes and permissions
    scopes = Column(JSON, default=[])  # OAuth scopes granted
    permissions = Column(JSON, nullable=True)  # Provider-specific permissions

    # Status
    is_active = Column(Boolean, default=True)
    is_valid = Column(Boolean, default=True)  # Set to false if token is revoked/invalid
    last_used_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    error_count = Column(Integer, default=0)

    # Metadata
    cred_metadata = Column("metadata", JSON, nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "provider", "provider_instance", name="uq_user_integration_provider"),
        Index("ix_user_integration_credentials_provider", "provider"),
        Index("ix_user_integration_credentials_user_provider", "user_id", "provider"),
        Index("ix_user_integration_credentials_expires", "expires_at"),
    )


class InstitutionIntegration(Base):
    """
    Institution-level integration configurations.

    Stores shared integration settings and credentials
    that apply to all users within an institution.
    """
    __tablename__ = "institution_integrations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Institution scope
    institution_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # Integration identification
    integration_type = Column(String(100), nullable=False)  # hl7_fhir, redcap, ehr, storage, etc.
    integration_name = Column(String(255), nullable=False)
    provider = Column(String(100), nullable=False)

    # Configuration
    config = Column(JSON, nullable=False, default={})  # Non-sensitive configuration
    endpoint_url = Column(String(1000), nullable=True)

    # Credentials (institution-level)
    credentials_encrypted = Column(LargeBinary, nullable=True)
    encryption_key_id = Column(String(100), nullable=True)

    # Status
    is_enabled = Column(Boolean, default=True)
    is_configured = Column(Boolean, default=False)
    last_sync_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    health_status = Column(String(50), default="unknown")  # healthy, degraded, error, unknown

    # Sync settings
    sync_enabled = Column(Boolean, default=False)
    sync_interval_minutes = Column(Integer, nullable=True)
    sync_config = Column(JSON, nullable=True)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("institution_id", "integration_type", "provider", name="uq_institution_integration"),
        Index("ix_institution_integrations_type", "integration_type"),
        Index("ix_institution_integrations_enabled", "is_enabled"),
    )


class WebhookEndpoint(Base):
    """
    Webhook endpoints for receiving notifications from integrations.
    """
    __tablename__ = "webhook_endpoints"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Scope
    institution_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    integration_id = Column(UUID(as_uuid=True), ForeignKey("institution_integrations.id", ondelete="CASCADE"), nullable=True)

    # Endpoint configuration
    name = Column(String(255), nullable=False)
    url = Column(String(1000), nullable=False)
    secret_key_encrypted = Column(LargeBinary, nullable=True)  # For verifying webhook signatures

    # Event configuration
    events = Column(JSON, default=[])  # List of events to listen for
    filters = Column(JSON, nullable=True)  # Event filters

    # Status
    is_active = Column(Boolean, default=True)
    last_triggered_at = Column(DateTime, nullable=True)
    last_success_at = Column(DateTime, nullable=True)
    last_failure_at = Column(DateTime, nullable=True)
    failure_count = Column(Integer, default=0)

    # Retry configuration
    max_retries = Column(Integer, default=3)
    retry_delay_seconds = Column(Integer, default=60)

    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_webhook_endpoints_active", "is_active"),
        Index("ix_webhook_endpoints_institution", "institution_id"),
    )
