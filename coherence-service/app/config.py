"""Configuration settings for Coherence Service."""

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/radiology_research"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def convert_database_url(cls, v: str) -> str:
        """Convert postgres:// to postgresql+asyncpg:// for async SQLAlchemy."""
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Neo4j Graph Database
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "neo4j_secret"

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Internal API Key
    INTERNAL_API_KEY: str = ""

    # Service URLs
    GATEWAY_URL: str = "http://gateway:3000"
    PROTOCOL_ASSISTANT_URL: str = "http://protocol-assistant:8000"

    # Application settings
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Coherence settings
    REALTIME_CHECK_TIMEOUT_MS: int = 100  # Max time for real-time checks
    BATCH_CHECK_INTERVAL_MINUTES: int = 60  # How often to run batch analysis
    MAX_CONFLICTS_PER_PROJECT: int = 100  # Max conflicts to track


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
