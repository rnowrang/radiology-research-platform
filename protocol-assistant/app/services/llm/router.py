"""LLM Router for task-based provider routing."""

import logging
from typing import Optional

from app.config import get_settings
from app.services.llm.base import BaseLLMProvider, LLMError
from app.services.llm.claude import ClaudeProvider
from app.services.llm.openai import OpenAIProvider

logger = logging.getLogger(__name__)

# Default task routing configuration
# Maps task types to preferred providers
DEFAULT_TASK_ROUTING = {
    "protocol_generation": "claude",
    "section_writing": "claude",
    "compliance_check": "claude",
    "risk_assessment": "claude",
    "summary": "openai",
    "translation": "openai",
    "default": "claude",
}


class LLMRouter:
    """Routes LLM requests to appropriate providers based on task type."""

    def __init__(self):
        """Initialize the router with available providers."""
        self.settings = get_settings()
        self._providers: dict[str, BaseLLMProvider] = {}
        self._task_routing: dict[str, str] = {}
        self._initialize_providers()
        self._load_task_routing()

    def _initialize_providers(self) -> None:
        """Initialize available LLM providers based on configuration."""
        # Initialize Claude provider if API key is available
        if self.settings.has_claude_api_key():
            self._providers["claude"] = ClaudeProvider()
            logger.info("Claude provider initialized")

        # Initialize OpenAI provider if API key is available
        if self.settings.has_openai_api_key():
            self._providers["openai"] = OpenAIProvider()
            logger.info("OpenAI provider initialized")

        if not self._providers:
            logger.warning("No LLM providers available - check API key configuration")

    def _load_task_routing(self) -> None:
        """Load task routing configuration."""
        # Start with defaults
        self._task_routing = DEFAULT_TASK_ROUTING.copy()

        # Override with config if provided
        config_routing = self.settings.get_task_routing()
        if config_routing:
            self._task_routing.update(config_routing)
            logger.info(f"Loaded custom task routing: {config_routing}")

    @property
    def available_providers(self) -> list[str]:
        """Get list of available provider names."""
        return list(self._providers.keys())

    @property
    def default_provider(self) -> str:
        """Get the default provider name."""
        return self.settings.DEFAULT_LLM_PROVIDER

    def get_provider(self, provider_name: Optional[str] = None) -> BaseLLMProvider:
        """
        Get a specific provider by name.

        Args:
            provider_name: Name of the provider (claude, openai, etc.)
                          If None, returns the default provider

        Returns:
            The requested LLM provider

        Raises:
            LLMError: If the provider is not available
        """
        name = provider_name or self.default_provider

        if name not in self._providers:
            # Try fallback to any available provider
            if self._providers:
                fallback = next(iter(self._providers.keys()))
                logger.warning(
                    f"Provider '{name}' not available, falling back to '{fallback}'"
                )
                return self._providers[fallback]
            raise LLMError(
                message=f"Provider '{name}' not available and no fallback found",
                provider=name,
                retryable=False,
            )

        return self._providers[name]

    def get_provider_for_task(self, task_type: str) -> BaseLLMProvider:
        """
        Get the best provider for a specific task type.

        Args:
            task_type: The type of task (e.g., 'protocol_generation', 'summary')

        Returns:
            The recommended LLM provider for the task
        """
        # Look up preferred provider for this task
        preferred = self._task_routing.get(task_type, self._task_routing.get("default"))

        if preferred and preferred in self._providers:
            logger.debug(f"Using {preferred} for task type: {task_type}")
            return self._providers[preferred]

        # Fall back to default provider
        logger.debug(f"Using default provider for task type: {task_type}")
        return self.get_provider()

    def get_fallback_provider(self, current_provider: str) -> Optional[BaseLLMProvider]:
        """
        Get a fallback provider different from the current one.

        Args:
            current_provider: Name of the current provider that failed

        Returns:
            A different provider, or None if no fallback is available
        """
        for name, provider in self._providers.items():
            if name != current_provider and provider.is_available():
                logger.info(f"Falling back from {current_provider} to {name}")
                return provider
        return None

    def has_fallback(self, current_provider: str) -> bool:
        """Check if a fallback provider is available."""
        return any(
            name != current_provider and provider.is_available()
            for name, provider in self._providers.items()
        )


# Global router instance
_router: Optional[LLMRouter] = None


def get_llm_router() -> LLMRouter:
    """Get the global LLM router instance."""
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router
