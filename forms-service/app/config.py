"""Configuration settings for the Forms Service."""

from functools import lru_cache
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "postgresql://radiology:radiology_secret@localhost:5432/radiology_research"

    @property
    def db_url(self) -> str:
        """Return database URL with postgresql:// prefix."""
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url

    # Security
    secret_key: str = "your-super-secret-jwt-key"
    internal_api_key: str = "internal-service-key"

    # Service URLs
    gateway_url: str = "http://localhost:3000"

    # File storage
    storage_path: str = "/app/storage"
    template_dir: str = "/app/storage/templates"
    generated_dir: str = "/app/storage/generated"
    upload_dir: str = "/app/storage/uploads"

    # LibreOffice (for PDF conversion)
    libreoffice_path: str = "/usr/bin/soffice"

    # Debug mode
    debug: bool = False

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
