"""Configuration settings for resilience and retry behavior."""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class FallbackBehavior(str, Enum):
    """Defines how the system should behave when all retries are exhausted."""

    RETRY_THEN_FAIL = "retry_then_fail"
    IMMEDIATE_FALLBACK = "immediate_fallback"
    NOTIFY_ONLY = "notify_only"
    CACHED_RESPONSE = "cached_response"


class ResilienceConfig(BaseModel):
    """
    Configuration for resilience behavior including retries, timeouts, and fallbacks.

    This configuration controls how the Protocol Assistant handles failures
    when communicating with LLMs and other external services.
    """

    # Retry settings
    max_retries: int = Field(
        default=3,
        ge=0,
        le=10,
        description="Maximum number of retry attempts for failed operations",
    )
    retry_delay_base: float = Field(
        default=1.0,
        ge=0.1,
        le=60.0,
        description="Base delay in seconds for exponential backoff",
    )
    retry_delay_max: float = Field(
        default=60.0,
        ge=1.0,
        le=300.0,
        description="Maximum delay in seconds between retries",
    )
    retry_jitter: bool = Field(
        default=True,
        description="Add random jitter to retry delays to prevent thundering herd",
    )

    # Queue settings
    queue_timeout: int = Field(
        default=300,
        ge=30,
        le=3600,
        description="Maximum time in seconds for a queued task to complete",
    )
    task_priority_default: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Default priority for queued tasks (1=highest, 10=lowest)",
    )

    # Fallback behavior
    fallback_behavior: FallbackBehavior = Field(
        default=FallbackBehavior.RETRY_THEN_FAIL,
        description="Strategy when all retries are exhausted",
    )
    enable_notifications: bool = Field(
        default=True,
        description="Whether to send user notifications on failures",
    )

    # Circuit breaker settings
    circuit_breaker_threshold: int = Field(
        default=5,
        ge=1,
        le=50,
        description="Number of failures before circuit opens",
    )
    circuit_breaker_timeout: int = Field(
        default=60,
        ge=10,
        le=600,
        description="Seconds to wait before attempting to reset circuit",
    )
    circuit_breaker_half_open_max_calls: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Maximum calls allowed in half-open state",
    )

    # Health check settings
    health_check_interval: int = Field(
        default=30,
        ge=5,
        le=300,
        description="Interval in seconds between health checks",
    )
    health_check_timeout: int = Field(
        default=10,
        ge=1,
        le=60,
        description="Timeout in seconds for health check requests",
    )

    # Rate limiting awareness
    respect_rate_limits: bool = Field(
        default=True,
        description="Whether to honor rate limit headers from providers",
    )
    rate_limit_buffer: float = Field(
        default=1.1,
        ge=1.0,
        le=2.0,
        description="Multiplier for rate limit retry-after values",
    )

    class Config:
        """Pydantic configuration."""

        use_enum_values = True


def get_default_config() -> ResilienceConfig:
    """Get the default resilience configuration."""
    return ResilienceConfig()


def get_aggressive_retry_config() -> ResilienceConfig:
    """Get a configuration with more aggressive retry settings."""
    return ResilienceConfig(
        max_retries=5,
        retry_delay_base=0.5,
        retry_delay_max=120.0,
        circuit_breaker_threshold=10,
    )


def get_conservative_config() -> ResilienceConfig:
    """Get a configuration with conservative settings for critical operations."""
    return ResilienceConfig(
        max_retries=2,
        retry_delay_base=2.0,
        circuit_breaker_threshold=3,
        fallback_behavior=FallbackBehavior.NOTIFY_ONLY,
    )
