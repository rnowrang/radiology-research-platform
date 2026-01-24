"""
Circuit breaker pattern implementation for Protocol Assistant.

This module implements the circuit breaker pattern to prevent cascading failures
when external services (like LLM providers) are experiencing issues.
"""

import logging
import threading
import time
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Callable, Dict, Optional, TypeVar

from app.services.resilience.config import ResilienceConfig

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(Enum):
    """Possible states of a circuit breaker."""

    CLOSED = "closed"  # Normal operation, requests flow through
    OPEN = "open"  # Circuit is open, requests are blocked
    HALF_OPEN = "half_open"  # Testing if the circuit can be closed


class CircuitBreakerOpen(Exception):
    """Exception raised when the circuit breaker is open."""

    def __init__(
        self,
        message: str = "Circuit breaker is open",
        circuit_name: str = "",
        time_until_retry: Optional[float] = None,
    ):
        self.circuit_name = circuit_name
        self.time_until_retry = time_until_retry
        super().__init__(message)


class CircuitBreaker:
    """
    Circuit breaker implementation for protecting external service calls.

    The circuit breaker monitors failures and opens the circuit when too many
    failures occur, preventing further calls until the circuit resets.

    States:
    - CLOSED: Normal operation, all requests pass through
    - OPEN: Too many failures, requests are blocked immediately
    - HALF_OPEN: Testing phase, limited requests allowed to check recovery
    """

    def __init__(
        self,
        name: str = "default",
        failure_threshold: int = 5,
        timeout: int = 60,
        half_open_max_calls: int = 3,
        success_threshold: int = 2,
        excluded_exceptions: Optional[tuple] = None,
    ):
        """
        Initialize the circuit breaker.

        Args:
            name: Identifier for this circuit breaker
            failure_threshold: Number of failures before opening circuit
            timeout: Seconds to wait before attempting to close circuit
            half_open_max_calls: Max calls allowed in half-open state
            success_threshold: Successes needed in half-open to close
            excluded_exceptions: Exceptions that don't count as failures
        """
        self.name = name
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.half_open_max_calls = half_open_max_calls
        self.success_threshold = success_threshold
        self.excluded_exceptions = excluded_exceptions or ()

        # State tracking
        self._failures = 0
        self._successes_in_half_open = 0
        self._calls_in_half_open = 0
        self._last_failure_time: Optional[datetime] = None
        self._state = CircuitState.CLOSED

        # Thread safety
        self._lock = threading.RLock()

        # Metrics
        self._total_calls = 0
        self._total_failures = 0
        self._total_success = 0
        self._times_opened = 0

    @property
    def state(self) -> CircuitState:
        """Get the current circuit state."""
        with self._lock:
            return self._state

    @property
    def is_closed(self) -> bool:
        """Check if circuit is closed (normal operation)."""
        return self.state == CircuitState.CLOSED

    @property
    def is_open(self) -> bool:
        """Check if circuit is open (blocking requests)."""
        return self.state == CircuitState.OPEN

    def get_stats(self) -> Dict[str, Any]:
        """Get circuit breaker statistics."""
        with self._lock:
            return {
                "name": self.name,
                "state": self._state.value,
                "failures": self._failures,
                "failure_threshold": self.failure_threshold,
                "last_failure": self._last_failure_time.isoformat() if self._last_failure_time else None,
                "total_calls": self._total_calls,
                "total_failures": self._total_failures,
                "total_success": self._total_success,
                "times_opened": self._times_opened,
            }

    def _should_try_reset(self) -> bool:
        """Check if enough time has passed to attempt resetting the circuit."""
        if self._last_failure_time is None:
            return True
        return datetime.now() - self._last_failure_time > timedelta(seconds=self.timeout)

    def _on_success(self) -> None:
        """Handle a successful call."""
        with self._lock:
            self._total_success += 1

            if self._state == CircuitState.HALF_OPEN:
                self._successes_in_half_open += 1
                logger.debug(
                    f"Circuit {self.name}: Success in half-open state "
                    f"({self._successes_in_half_open}/{self.success_threshold})"
                )

                if self._successes_in_half_open >= self.success_threshold:
                    self._close_circuit()
            else:
                # Reset failure count on success in closed state
                self._failures = 0

    def _on_failure(self, exception: Exception) -> None:
        """Handle a failed call."""
        with self._lock:
            self._total_failures += 1
            self._failures += 1
            self._last_failure_time = datetime.now()

            logger.warning(
                f"Circuit {self.name}: Failure recorded "
                f"({self._failures}/{self.failure_threshold}): {exception}"
            )

            if self._state == CircuitState.HALF_OPEN:
                # Any failure in half-open state opens the circuit
                self._open_circuit()
            elif self._failures >= self.failure_threshold:
                self._open_circuit()

    def _open_circuit(self) -> None:
        """Open the circuit breaker."""
        self._state = CircuitState.OPEN
        self._times_opened += 1
        logger.warning(
            f"Circuit {self.name}: OPENED after {self._failures} failures. "
            f"Will retry after {self.timeout}s"
        )

    def _close_circuit(self) -> None:
        """Close the circuit breaker (return to normal operation)."""
        self._state = CircuitState.CLOSED
        self._failures = 0
        self._successes_in_half_open = 0
        self._calls_in_half_open = 0
        logger.info(f"Circuit {self.name}: CLOSED - returning to normal operation")

    def _half_open_circuit(self) -> None:
        """Transition to half-open state for testing."""
        self._state = CircuitState.HALF_OPEN
        self._successes_in_half_open = 0
        self._calls_in_half_open = 0
        logger.info(f"Circuit {self.name}: HALF-OPEN - testing if service recovered")

    def _can_execute(self) -> bool:
        """Check if a call should be allowed to proceed."""
        with self._lock:
            self._total_calls += 1

            if self._state == CircuitState.CLOSED:
                return True

            if self._state == CircuitState.OPEN:
                if self._should_try_reset():
                    self._half_open_circuit()
                    return True
                return False

            if self._state == CircuitState.HALF_OPEN:
                if self._calls_in_half_open < self.half_open_max_calls:
                    self._calls_in_half_open += 1
                    return True
                return False

            return False

    def call(self, func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """
        Execute a function through the circuit breaker.

        Args:
            func: Function to execute
            *args: Positional arguments for the function
            **kwargs: Keyword arguments for the function

        Returns:
            The result of the function

        Raises:
            CircuitBreakerOpen: If the circuit is open
            Exception: Any exception raised by the function
        """
        if not self._can_execute():
            time_until_retry = None
            if self._last_failure_time:
                elapsed = (datetime.now() - self._last_failure_time).total_seconds()
                time_until_retry = max(0, self.timeout - elapsed)

            raise CircuitBreakerOpen(
                message=f"Circuit breaker '{self.name}' is open",
                circuit_name=self.name,
                time_until_retry=time_until_retry,
            )

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except self.excluded_exceptions:
            # Don't count excluded exceptions as failures
            raise
        except Exception as e:
            self._on_failure(e)
            raise

    async def call_async(self, func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        """
        Execute an async function through the circuit breaker.

        Args:
            func: Async function to execute
            *args: Positional arguments for the function
            **kwargs: Keyword arguments for the function

        Returns:
            The result of the function

        Raises:
            CircuitBreakerOpen: If the circuit is open
            Exception: Any exception raised by the function
        """
        if not self._can_execute():
            time_until_retry = None
            if self._last_failure_time:
                elapsed = (datetime.now() - self._last_failure_time).total_seconds()
                time_until_retry = max(0, self.timeout - elapsed)

            raise CircuitBreakerOpen(
                message=f"Circuit breaker '{self.name}' is open",
                circuit_name=self.name,
                time_until_retry=time_until_retry,
            )

        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except self.excluded_exceptions:
            raise
        except Exception as e:
            self._on_failure(e)
            raise

    def reset(self) -> None:
        """Manually reset the circuit breaker to closed state."""
        with self._lock:
            self._close_circuit()
            logger.info(f"Circuit {self.name}: Manually reset to CLOSED")


class CircuitBreakerRegistry:
    """
    Registry for managing multiple circuit breakers.

    Provides a centralized way to create, access, and monitor circuit breakers
    for different services.
    """

    def __init__(self, config: Optional[ResilienceConfig] = None):
        """
        Initialize the registry.

        Args:
            config: Default configuration for circuit breakers
        """
        self.config = config or ResilienceConfig()
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._lock = threading.Lock()

    def get_or_create(
        self,
        name: str,
        failure_threshold: Optional[int] = None,
        timeout: Optional[int] = None,
    ) -> CircuitBreaker:
        """
        Get an existing circuit breaker or create a new one.

        Args:
            name: Name of the circuit breaker
            failure_threshold: Override default failure threshold
            timeout: Override default timeout

        Returns:
            CircuitBreaker instance
        """
        with self._lock:
            if name not in self._breakers:
                self._breakers[name] = CircuitBreaker(
                    name=name,
                    failure_threshold=failure_threshold or self.config.circuit_breaker_threshold,
                    timeout=timeout or self.config.circuit_breaker_timeout,
                    half_open_max_calls=self.config.circuit_breaker_half_open_max_calls,
                )
            return self._breakers[name]

    def get(self, name: str) -> Optional[CircuitBreaker]:
        """Get a circuit breaker by name if it exists."""
        return self._breakers.get(name)

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all circuit breakers."""
        return {name: cb.get_stats() for name, cb in self._breakers.items()}

    def reset_all(self) -> None:
        """Reset all circuit breakers."""
        for breaker in self._breakers.values():
            breaker.reset()


# Global registry instance
_registry: Optional[CircuitBreakerRegistry] = None


def get_circuit_breaker_registry() -> CircuitBreakerRegistry:
    """Get the global circuit breaker registry."""
    global _registry
    if _registry is None:
        _registry = CircuitBreakerRegistry()
    return _registry


def get_circuit_breaker(name: str) -> CircuitBreaker:
    """Get or create a circuit breaker by name."""
    return get_circuit_breaker_registry().get_or_create(name)
