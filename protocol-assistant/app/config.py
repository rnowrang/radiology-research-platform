"""Configuration settings for Protocol Assistant service."""

import json
from functools import lru_cache
from typing import Any, Optional

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
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/protocol_assistant"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def convert_database_url(cls, v: str) -> str:
        """Convert postgres:// to postgresql+asyncpg:// for async SQLAlchemy."""
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Claude API
    CLAUDE_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-20250514"

    # OpenAI API
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    # LLM Configuration
    DEFAULT_LLM_PROVIDER: str = "claude"
    LLM_TASK_ROUTING: str = "{}"

    # Service URLs
    FORMS_SERVICE_URL: str = "http://localhost:8000"

    # Internal API Key for service-to-service communication
    INTERNAL_API_KEY: str = ""

    # Storage
    STORAGE_PATH: str = "/app/storage"

    # Redis Configuration (for Celery queue and caching)
    REDIS_URL: str = "redis://localhost:6379/0"

    # Neo4j Graph Database Configuration
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "neo4j_secret"

    # Gateway URL for internal service communication
    GATEWAY_URL: str = "http://gateway:3000"

    # Application settings
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Security (legacy support)
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ENCRYPTION_KEY: str = "your-32-byte-encryption-key-here"

    # Mendeley OAuth Configuration
    MENDELEY_CLIENT_ID: str = ""
    MENDELEY_CLIENT_SECRET: str = ""

    # Feature Flags
    ENABLE_RAG: bool = True
    ENABLE_AB_TESTING: bool = True

    @field_validator("LLM_TASK_ROUTING", mode="before")
    @classmethod
    def validate_llm_task_routing(cls, v: Any) -> str:
        """Validate LLM_TASK_ROUTING is valid JSON."""
        if isinstance(v, dict):
            return json.dumps(v)
        if isinstance(v, str):
            try:
                json.loads(v)
            except json.JSONDecodeError as e:
                raise ValueError(f"LLM_TASK_ROUTING must be valid JSON: {e}")
        return v

    def get_task_routing(self) -> dict[str, str]:
        """Parse and return task routing configuration."""
        try:
            return json.loads(self.LLM_TASK_ROUTING)
        except json.JSONDecodeError:
            return {}

    def has_claude_api_key(self) -> bool:
        """Check if Claude API key is configured."""
        return bool(self.CLAUDE_API_KEY)

    def has_openai_api_key(self) -> bool:
        """Check if OpenAI API key is configured."""
        return bool(self.OPENAI_API_KEY)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
