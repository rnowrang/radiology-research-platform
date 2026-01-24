"""LLM service module - Provider-agnostic LLM abstraction layer."""

from app.services.llm.base import (
    AuthenticationError,
    BaseLLMProvider,
    LLMError,
    LLMMessage,
    LLMResponse,
    LLMUsage,
    RateLimitError,
)
from app.services.llm.claude import ClaudeProvider
from app.services.llm.openai import OpenAIProvider
from app.services.llm.orchestrator import (
    LLMOrchestrator,
    ValidationResult,
    get_llm_orchestrator,
)
from app.services.llm.router import (
    DEFAULT_TASK_ROUTING,
    LLMRouter,
    get_llm_router,
)

__all__ = [
    # Base classes and models
    "BaseLLMProvider",
    "LLMMessage",
    "LLMResponse",
    "LLMUsage",
    # Errors
    "LLMError",
    "RateLimitError",
    "AuthenticationError",
    # Providers
    "ClaudeProvider",
    "OpenAIProvider",
    # Router
    "LLMRouter",
    "get_llm_router",
    "DEFAULT_TASK_ROUTING",
    # Orchestrator
    "LLMOrchestrator",
    "ValidationResult",
    "get_llm_orchestrator",
]
