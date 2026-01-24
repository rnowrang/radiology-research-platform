"""Base classes and models for LLM providers."""

from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional

from pydantic import BaseModel, Field


class LLMMessage(BaseModel):
    """Represents a message in a conversation."""

    role: str = Field(..., description="Role: 'user', 'assistant', or 'system'")
    content: str = Field(..., description="Message content")


class LLMUsage(BaseModel):
    """Token usage information from LLM response."""

    input_tokens: int = Field(default=0, description="Number of input tokens")
    output_tokens: int = Field(default=0, description="Number of output tokens")
    total_tokens: int = Field(default=0, description="Total tokens used")


class LLMResponse(BaseModel):
    """Response from an LLM provider."""

    content: str = Field(..., description="Generated content")
    model: str = Field(..., description="Model used for generation")
    usage: dict = Field(default_factory=dict, description="Token usage information")
    finish_reason: Optional[str] = Field(default=None, description="Reason for completion")


class LLMError(Exception):
    """Base exception for LLM errors."""

    def __init__(self, message: str, provider: str, retryable: bool = False):
        self.message = message
        self.provider = provider
        self.retryable = retryable
        super().__init__(message)


class RateLimitError(LLMError):
    """Raised when rate limit is exceeded."""

    def __init__(self, message: str, provider: str, retry_after: Optional[float] = None):
        super().__init__(message, provider, retryable=True)
        self.retry_after = retry_after


class AuthenticationError(LLMError):
    """Raised when authentication fails."""

    def __init__(self, message: str, provider: str):
        super().__init__(message, provider, retryable=False)


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    provider_name: str = "base"

    @abstractmethod
    async def complete(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """
        Generate a completion for the given messages.

        Args:
            messages: List of conversation messages
            system_prompt: System prompt to set context
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0-1)

        Returns:
            LLMResponse with generated content and metadata
        """
        pass

    @abstractmethod
    async def stream(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        """
        Stream a completion for the given messages.

        Args:
            messages: List of conversation messages
            system_prompt: System prompt to set context
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0-1)

        Yields:
            String chunks of the generated content
        """
        pass

    def is_available(self) -> bool:
        """Check if the provider is available (has valid credentials)."""
        return True
