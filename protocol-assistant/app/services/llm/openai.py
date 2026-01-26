"""OpenAI LLM provider implementation."""

import logging
from typing import AsyncIterator

import openai
from openai import APIConnectionError, APIStatusError, RateLimitError as OpenAIRateLimitError

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


class OpenAIProvider(BaseLLMProvider):
    """OpenAI LLM provider using OpenAI SDK."""

    provider_name: str = "openai"

    def __init__(self):
        """Initialize OpenAI provider with API credentials."""
        settings = get_settings()
        self.api_key = settings.OPENAI_API_KEY
        self.model = settings.OPENAI_MODEL
        self._client: openai.AsyncOpenAI | None = None

    @property
    def client(self) -> openai.AsyncOpenAI:
        """Lazy initialization of OpenAI client."""
        if self._client is None:
            if not self.api_key:
                raise AuthenticationError(
                    "OpenAI API key not configured",
                    provider=self.provider_name,
                )
            self._client = openai.AsyncOpenAI(api_key=self.api_key)
        return self._client

    def is_available(self) -> bool:
        """Check if OpenAI provider is available."""
        return bool(self.api_key)

    async def complete(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """
        Generate a completion using OpenAI.

        Args:
            messages: List of conversation messages
            system_prompt: System prompt to set context
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0-1)

        Returns:
            LLMResponse with generated content and metadata
        """
        try:
            # Build messages with system prompt first
            openai_messages = [{"role": "system", "content": system_prompt}]
            openai_messages.extend(
                {"role": msg.role, "content": msg.content}
                for msg in messages
                if msg.role in ("user", "assistant")
            )

            response = await self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=openai_messages,
            )

            # Extract content from response
            content = ""
            finish_reason = None
            if response.choices:
                content = response.choices[0].message.content or ""
                finish_reason = response.choices[0].finish_reason

            # Build usage dict
            usage = {}
            if response.usage:
                usage = {
                    "input_tokens": response.usage.prompt_tokens,
                    "output_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                }

            return LLMResponse(
                content=content,
                model=response.model,
                provider="openai",
                usage=usage,
                finish_reason=finish_reason,
            )

        except OpenAIRateLimitError as e:
            logger.warning(f"OpenAI rate limit exceeded: {e}")
            raise RateLimitError(
                message=str(e),
                provider=self.provider_name,
                retry_after=60.0,  # Default retry after 60 seconds
            )
        except APIStatusError as e:
            if e.status_code == 401:
                logger.error(f"OpenAI authentication failed: {e}")
                raise AuthenticationError(
                    message="Invalid OpenAI API key",
                    provider=self.provider_name,
                )
            logger.error(f"OpenAI API error: {e}")
            raise LLMError(
                message=str(e),
                provider=self.provider_name,
                retryable=e.status_code >= 500,
            )
        except APIConnectionError as e:
            logger.error(f"OpenAI connection error: {e}")
            raise LLMError(
                message=f"Failed to connect to OpenAI API: {e}",
                provider=self.provider_name,
                retryable=True,
            )
        except Exception as e:
            logger.error(f"Unexpected OpenAI error: {e}")
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
        Stream a completion using OpenAI.

        Args:
            messages: List of conversation messages
            system_prompt: System prompt to set context
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0-1)

        Yields:
            String chunks of the generated content
        """
        try:
            # Build messages with system prompt first
            openai_messages = [{"role": "system", "content": system_prompt}]
            openai_messages.extend(
                {"role": msg.role, "content": msg.content}
                for msg in messages
                if msg.role in ("user", "assistant")
            )

            stream = await self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=openai_messages,
                stream=True,
            )

            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        except OpenAIRateLimitError as e:
            logger.warning(f"OpenAI rate limit exceeded during stream: {e}")
            raise RateLimitError(
                message=str(e),
                provider=self.provider_name,
                retry_after=60.0,
            )
        except APIStatusError as e:
            if e.status_code == 401:
                raise AuthenticationError(
                    message="Invalid OpenAI API key",
                    provider=self.provider_name,
                )
            raise LLMError(
                message=str(e),
                provider=self.provider_name,
                retryable=e.status_code >= 500,
            )
        except APIConnectionError as e:
            raise LLMError(
                message=f"Failed to connect to OpenAI API: {e}",
                provider=self.provider_name,
                retryable=True,
            )
        except Exception as e:
            logger.error(f"Unexpected OpenAI streaming error: {e}")
            raise LLMError(
                message=str(e),
                provider=self.provider_name,
                retryable=False,
            )
