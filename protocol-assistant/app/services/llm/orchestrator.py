"""LLM Orchestrator with validation, retry logic, and fallback support."""

import json
import logging
import re
from typing import Any, Optional, Type, TypeVar

from pydantic import BaseModel, ValidationError
from tenacity import (
    AsyncRetrying,
    RetryError,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
)

from app.services.llm.base import BaseLLMProvider, LLMError, LLMMessage, LLMResponse, RateLimitError
from app.services.llm.router import LLMRouter, get_llm_router

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class ValidationResult(BaseModel):
    """Result of LLM output validation."""

    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None
    raw_response: str = ""


class LLMOrchestrator:
    """
    Orchestrates LLM calls with validation, retry logic, and fallback support.

    This class provides:
    - Pydantic schema validation of LLM outputs
    - Automatic retry with error feedback to the LLM
    - Fallback to secondary providers on persistent failures
    - JSON extraction from LLM responses
    """

    def __init__(
        self,
        router: Optional[LLMRouter] = None,
        max_retries: int = 3,
        max_validation_retries: int = 2,
    ):
        """
        Initialize the orchestrator.

        Args:
            router: LLM router instance (uses global if not provided)
            max_retries: Maximum API call retries for transient errors
            max_validation_retries: Maximum retries for validation errors
        """
        self.router = router or get_llm_router()
        self.max_retries = max_retries
        self.max_validation_retries = max_validation_retries

    def _extract_json(self, text: str) -> Optional[dict]:
        """
        Extract JSON from LLM response text.

        Handles various formats:
        - Raw JSON
        - JSON in markdown code blocks
        - JSON with surrounding text

        Args:
            text: Raw LLM response text

        Returns:
            Parsed JSON dict or None if extraction fails
        """
        # Try to parse as raw JSON first
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            pass

        # Try to extract from markdown code blocks
        # Matches ```json ... ``` or ``` ... ```
        code_block_patterns = [
            r"```json\s*([\s\S]*?)\s*```",
            r"```\s*([\s\S]*?)\s*```",
        ]

        for pattern in code_block_patterns:
            matches = re.findall(pattern, text, re.MULTILINE)
            for match in matches:
                try:
                    return json.loads(match.strip())
                except json.JSONDecodeError:
                    continue

        # Try to find JSON object in text
        # Look for content between first { and last }
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if start != -1 and end > start:
                potential_json = text[start:end]
                return json.loads(potential_json)
        except json.JSONDecodeError:
            pass

        # Try to find JSON array
        try:
            start = text.find("[")
            end = text.rfind("]") + 1
            if start != -1 and end > start:
                potential_json = text[start:end]
                return json.loads(potential_json)
        except json.JSONDecodeError:
            pass

        return None

    async def _call_with_retry(
        self,
        provider: BaseLLMProvider,
        messages: list[LLMMessage],
        system_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        """
        Call provider with retry logic for transient errors.

        Args:
            provider: LLM provider to use
            messages: Conversation messages
            system_prompt: System prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature

        Returns:
            LLMResponse from the provider

        Raises:
            LLMError: If all retries fail
        """

        def should_retry(exception: BaseException) -> bool:
            if isinstance(exception, RateLimitError):
                return True
            if isinstance(exception, LLMError):
                return exception.retryable
            return False

        try:
            async for attempt in AsyncRetrying(
                stop=stop_after_attempt(self.max_retries),
                wait=wait_exponential(multiplier=1, min=1, max=30),
                retry=retry_if_exception(should_retry),
                reraise=True,
            ):
                with attempt:
                    return await provider.complete(
                        messages=messages,
                        system_prompt=system_prompt,
                        max_tokens=max_tokens,
                        temperature=temperature,
                    )
        except RetryError as e:
            raise e.last_attempt.exception()

    async def generate_validated(
        self,
        schema: Type[T],
        messages: list[LLMMessage],
        system_prompt: str,
        task_type: str = "default",
        max_tokens: int = 4096,
        temperature: float = 0.7,
        provider_name: Optional[str] = None,
    ) -> tuple[T, LLMResponse]:
        """
        Generate LLM output and validate against a Pydantic schema.

        This method:
        1. Calls the LLM with the given messages
        2. Extracts JSON from the response
        3. Validates against the Pydantic schema
        4. On validation failure, retries with error feedback
        5. Falls back to secondary provider if primary fails repeatedly

        Args:
            schema: Pydantic model class to validate against
            messages: Conversation messages
            system_prompt: System prompt (should instruct JSON output format)
            task_type: Type of task for provider routing
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            provider_name: Specific provider to use (overrides task routing)

        Returns:
            Tuple of (validated Pydantic model instance, raw LLM response)

        Raises:
            LLMError: If generation fails after all retries
            ValidationError: If validation fails after all retries
        """
        # Get the appropriate provider
        if provider_name:
            provider = self.router.get_provider(provider_name)
        else:
            provider = self.router.get_provider_for_task(task_type)

        current_messages = messages.copy()
        last_error: Optional[Exception] = None
        providers_tried = set()

        for validation_attempt in range(self.max_validation_retries + 1):
            try:
                # Call the LLM
                response = await self._call_with_retry(
                    provider=provider,
                    messages=current_messages,
                    system_prompt=system_prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )

                # Extract JSON from response
                json_data = self._extract_json(response.content)
                if json_data is None:
                    raise ValueError(
                        f"Could not extract valid JSON from response: {response.content[:200]}..."
                    )

                # Validate against schema
                validated = schema.model_validate(json_data)
                logger.debug(f"Successfully validated response on attempt {validation_attempt + 1}")
                return validated, response

            except ValidationError as e:
                last_error = e
                logger.warning(
                    f"Validation failed on attempt {validation_attempt + 1}: {e.error_count()} errors"
                )

                if validation_attempt < self.max_validation_retries:
                    # Add error feedback to messages for retry
                    error_feedback = self._format_validation_error(e, schema)
                    current_messages.append(
                        LLMMessage(role="assistant", content=response.content)
                    )
                    current_messages.append(
                        LLMMessage(role="user", content=error_feedback)
                    )
                    continue

            except ValueError as e:
                last_error = e
                logger.warning(f"JSON extraction failed: {e}")

                if validation_attempt < self.max_validation_retries:
                    current_messages.append(
                        LLMMessage(
                            role="user",
                            content=(
                                "Your response was not valid JSON. Please respond with "
                                "only a valid JSON object matching the required schema."
                            ),
                        )
                    )
                    continue

            except LLMError as e:
                last_error = e
                logger.warning(f"LLM error with {provider.provider_name}: {e}")
                providers_tried.add(provider.provider_name)

                # Try fallback provider
                fallback = self.router.get_fallback_provider(provider.provider_name)
                if fallback and fallback.provider_name not in providers_tried:
                    logger.info(f"Switching to fallback provider: {fallback.provider_name}")
                    provider = fallback
                    current_messages = messages.copy()  # Reset messages
                    continue

                raise

        # All retries exhausted
        if isinstance(last_error, ValidationError):
            logger.error(f"Validation failed after {self.max_validation_retries + 1} attempts")
            raise last_error
        elif isinstance(last_error, ValueError):
            raise LLMError(
                message=str(last_error),
                provider=provider.provider_name,
                retryable=False,
            )
        else:
            raise last_error or LLMError(
                message="Unknown error during generation",
                provider=provider.provider_name,
                retryable=False,
            )

    def _format_validation_error(self, error: ValidationError, schema: Type[BaseModel]) -> str:
        """Format validation error as feedback for the LLM."""
        error_details = []
        for err in error.errors():
            loc = " -> ".join(str(x) for x in err["loc"])
            error_details.append(f"- Field '{loc}': {err['msg']}")

        schema_info = schema.model_json_schema()

        return (
            "Your previous response had validation errors:\n"
            + "\n".join(error_details)
            + "\n\nPlease provide a corrected JSON response that matches this schema:\n"
            f"```json\n{json.dumps(schema_info, indent=2)}\n```"
        )

    async def generate(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        task_type: str = "default",
        max_tokens: int = 4096,
        temperature: float = 0.7,
        provider_name: Optional[str] = None,
    ) -> LLMResponse:
        """
        Generate LLM output without validation.

        Simple wrapper around provider.complete with retry and fallback logic.

        Args:
            messages: Conversation messages
            system_prompt: System prompt
            task_type: Type of task for provider routing
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            provider_name: Specific provider to use (overrides task routing)

        Returns:
            LLMResponse from the provider
        """
        # Get the appropriate provider
        if provider_name:
            provider = self.router.get_provider(provider_name)
        else:
            provider = self.router.get_provider_for_task(task_type)

        providers_tried = set()

        while True:
            try:
                return await self._call_with_retry(
                    provider=provider,
                    messages=messages,
                    system_prompt=system_prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            except LLMError as e:
                providers_tried.add(provider.provider_name)
                fallback = self.router.get_fallback_provider(provider.provider_name)
                if fallback and fallback.provider_name not in providers_tried:
                    logger.info(f"Switching to fallback provider: {fallback.provider_name}")
                    provider = fallback
                    continue
                raise


# Global orchestrator instance
_orchestrator: Optional[LLMOrchestrator] = None


def get_llm_orchestrator() -> LLMOrchestrator:
    """Get the global LLM orchestrator instance."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = LLMOrchestrator()
    return _orchestrator
