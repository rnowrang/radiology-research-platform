"""
Resilience module for Protocol Assistant.

This module provides robust error handling, retry logic, circuit breaker patterns,
and graceful degradation for LLM operations and other external service calls.
"""

from app.services.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerOpen,
    CircuitState,
)
from app.services.resilience.config import ResilienceConfig
from app.services.resilience.graceful_degradation import (
    DegradationStrategy,
    FallbackRequired,
    GracefulDegradation,
)
from app.services.resilience.notifications import NotificationService
from app.services.resilience.progress import ProgressTracker
from app.services.resilience.queue import celery_app
from app.services.resilience.retry import RetryHandler

__all__ = [
    # Config
    "ResilienceConfig",
    # Queue
    "celery_app",
    # Retry
    "RetryHandler",
    # Circuit Breaker
    "CircuitBreaker",
    "CircuitBreakerOpen",
    "CircuitState",
    # Progress
    "ProgressTracker",
    # Notifications
    "NotificationService",
    # Graceful Degradation
    "GracefulDegradation",
    "DegradationStrategy",
    "FallbackRequired",
]
