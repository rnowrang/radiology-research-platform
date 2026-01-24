"""Claude (Anthropic) LLM provider implementation."""

import logging
from typing import AsyncIterator

import anthropic
from anthropic import APIConnectionError, APIStatusError, RateLimitError as AnthropicRateLimitError

from app.config import get_settings
from app.services.llm.base import (
    AuthenticationError,
    BaseLLMProvider,
    LLMError,
    LLMMessage,
    LLMResponse,
    RateLimitError,
)

logger = logging.getLogger(__name__)


class ClaudeProvider(BaseLLMProvider):
    """Claude LLM provider using Anthropic SDK."""

    provider_name: str = "claude"

    def __init__(self):
        """Initialize Claude provider with API credentials."""
        settings = get_settings()
        self.api_key = settings.CLAUDE_API_KEY
        self.model = settings.CLAUDE_MODEL
        self._client: anthropic.AsyncAnthropic | None = None

    @property
    def client(self) -> anthropic.AsyncAnthropic:
        """Lazy initialization of Anthropic client."""
        if self._client is None:
            if not self.api_key:
                raise AuthenticationError(
                    "Claude API key not configured",
                    provider=self.provider_name,
                )
            self._client = anthropic.AsyncAnthropic(api_key=self.api_key)
        return self._client

    def is_available(self) -> bool:
        """Check if Claude provider is available."""
        return bool(self.api_key)

    async def complete(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """
        Generate a completion using Claude.

        Args:
            messages: List of conversation messages
            system_prompt: System prompt to set context
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0-1)

        Returns:
            LLMResponse with generated content and metadata
        """
        try:
            # Convert messages to Anthropic format
            anthropic_messages = [
                {"role": msg.role, "content": msg.content}
                for msg in messages
                if msg.role in ("user", "assistant")
            ]

            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=anthropic_messages,
            )

            # Extract content from response
            content = ""
            if response.content:
                content = response.content[0].text

            return LLMResponse(
                content=content,
                model=response.model,
                usage={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                    "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
                },
                finish_reason=response.stop_reason,
            )

        except AnthropicRateLimitError as e:
            logger.warning(f"Claude rate limit exceeded: {e}")
            raise RateLimitError(
                message=str(e),
                provider=self.provider_name,
                retry_after=60.0,  # Default retry after 60 seconds
            )
        except APIStatusError as e:
            if e.status_code == 401:
                logger.error(f"Claude authentication failed: {e}")
                raise AuthenticationError(
                    message="Invalid Claude API key",
                    provider=self.provider_name,
                )
            logger.error(f"Claude API error: {e}")
            raise LLMError(
                message=str(e),
                provider=self.provider_name,
                retryable=e.status_code >= 500,
            )
        except APIConnectionError as e:
            logger.error(f"Claude connection error: {e}")
            raise LLMError(
                message=f"Failed to connect to Claude API: {e}",
                provider=self.provider_name,
                retryable=True,
            )
        except Exception as e:
            logger.error(f"Unexpected Claude error: {e}")
            raise LLMError(
                message=str(e),
                provider=self.provider_name,
                retryable=False,
            )

    async def stream(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        """
        Stream a completion using Claude.

        Args:
            messages: List of conversation messages
            system_prompt: System prompt to set context
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0-1)

        Yields:
            String chunks of the generated content
        """
        try:
            # Convert messages to Anthropic format
            anthropic_messages = [
                {"role": msg.role, "content": msg.content}
                for msg in messages
                if msg.role in ("user", "assistant")
            ]

            async with self.client.messages.stream(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=anthropic_messages,
            ) as stream:
                async for text in stream.text_stream:
                    yield text

        except AnthropicRateLimitError as e:
            logger.warning(f"Claude rate limit exceeded during stream: {e}")
            raise RateLimitError(
                message=str(e),
                provider=self.provider_name,
                retry_after=60.0,
            )
        except APIStatusError as e:
            if e.status_code == 401:
                raise AuthenticationError(
                    message="Invalid Claude API key",
                    provider=self.provider_name,
                )
            raise LLMError(
                message=str(e),
                provider=self.provider_name,
                retryable=e.status_code >= 500,
            )
        except APIConnectionError as e:
            raise LLMError(
                message=f"Failed to connect to Claude API: {e}",
                provider=self.provider_name,
                retryable=True,
            )
        except Exception as e:
            logger.error(f"Unexpected Claude streaming error: {e}")
            raise LLMError(
                message=str(e),
                provider=self.provider_name,
                retryable=False,
            )
