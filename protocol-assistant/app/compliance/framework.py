"""Base compliance framework classes for Protocol Assistant.

This module provides the foundation for implementing various compliance
standards including HIPAA, 21 CFR Part 11, GDPR, and SOC2.
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ComplianceStandard(str, Enum):
    """Supported compliance standards."""

    HIPAA = "hipaa"
    CFR_21_11 = "21_cfr_11"
    GDPR = "gdpr"
    SOC2 = "soc2"


class ComplianceResult(BaseModel):
    """Result of a compliance validation check."""

    passed: bool = Field(..., description="Whether the compliance check passed")
    standard: str = Field(..., description="The compliance standard being checked")
    requirement: str = Field(..., description="The specific requirement being validated")
    message: Optional[str] = Field(None, description="Human-readable message about the result")
    details: Optional[dict[str, Any]] = Field(
        None, description="Additional details about the check"
    )
    severity: str = Field(
        default="error", description="Severity level: error, warning, info"
    )
    remediation: Optional[str] = Field(
        None, description="Suggested remediation if check failed"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "passed": False,
                "standard": "HIPAA",
                "requirement": "phi_redaction",
                "message": "PHI detected in content to be sent to LLM",
                "severity": "error",
                "remediation": "Use PHI detector to redact sensitive information before external transmission",
            }
        }


class ComplianceViolation(Exception):
    """Exception raised when a compliance requirement is violated.

    This exception should be raised when a compliance check fails and
    the operation cannot proceed. The exception contains all necessary
    information for logging and remediation.
    """

    def __init__(
        self,
        standard: str,
        requirement: str,
        message: str,
        severity: str = "error",
        details: Optional[dict[str, Any]] = None,
    ):
        """
        Initialize a compliance violation.

        Args:
            standard: The compliance standard that was violated (e.g., "HIPAA")
            requirement: The specific requirement that was violated
            message: Human-readable description of the violation
            severity: Violation severity (error, warning, info)
            details: Additional context about the violation
        """
        self.standard = standard
        self.requirement = requirement
        self.message = message
        self.severity = severity
        self.details = details or {}
        super().__init__(f"{standard}/{requirement}: {message}")

    def to_dict(self) -> dict[str, Any]:
        """Convert violation to dictionary for serialization."""
        return {
            "standard": self.standard,
            "requirement": self.requirement,
            "message": self.message,
            "severity": self.severity,
            "details": self.details,
        }

    def to_result(self) -> ComplianceResult:
        """Convert violation to a ComplianceResult."""
        return ComplianceResult(
            passed=False,
            standard=self.standard,
            requirement=self.requirement,
            message=self.message,
            severity=self.severity,
            details=self.details,
        )


class ComplianceRequirement(ABC):
    """Abstract base class for compliance requirements.

    Each compliance requirement implements validation and enforcement
    logic for a specific aspect of a compliance standard.
    """

    name: str
    description: str
    standard: ComplianceStandard
    is_mandatory: bool = True

    @abstractmethod
    async def validate(self, context: dict[str, Any]) -> ComplianceResult:
        """
        Validate that the context meets this compliance requirement.

        Args:
            context: Dictionary containing data to validate. Contents vary
                    by requirement type but may include:
                    - text: Text content to check
                    - request: FastAPI Request object
                    - user_id: User performing the action
                    - resource_id: Resource being accessed

        Returns:
            ComplianceResult indicating whether the requirement is met
        """
        pass

    @abstractmethod
    async def enforce(self, context: dict[str, Any]) -> Any:
        """
        Enforce this compliance requirement on the context.

        For some requirements, this may modify data (e.g., redacting PHI).
        For others, it may simply log the action or raise an exception.

        Args:
            context: Dictionary containing data to process

        Returns:
            Modified data or None, depending on the requirement type

        Raises:
            ComplianceViolation: If the requirement cannot be enforced
        """
        pass

    def get_info(self) -> dict[str, Any]:
        """Get information about this requirement."""
        return {
            "name": self.name,
            "description": self.description,
            "standard": self.standard.value,
            "is_mandatory": self.is_mandatory,
        }


class ComplianceContext(BaseModel):
    """Context object passed to compliance validators."""

    text: Optional[str] = Field(None, description="Text content to validate")
    user_id: Optional[str] = Field(None, description="User performing the action")
    resource_id: Optional[str] = Field(None, description="Resource being accessed")
    resource_type: Optional[str] = Field(None, description="Type of resource")
    action: Optional[str] = Field(None, description="Action being performed")
    ip_address: Optional[str] = Field(None, description="Client IP address")
    session_id: Optional[str] = Field(None, description="Session identifier")
    institution_id: Optional[str] = Field(None, description="Institution identifier")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional context")

    def to_dict(self) -> dict[str, Any]:
        """Convert context to dictionary."""
        return self.model_dump(exclude_none=True)


class ComplianceReport(BaseModel):
    """Aggregated compliance report for multiple checks."""

    timestamp: str = Field(..., description="Report generation timestamp")
    standard: str = Field(..., description="Compliance standard evaluated")
    overall_passed: bool = Field(..., description="Whether all checks passed")
    total_checks: int = Field(..., description="Total number of checks performed")
    passed_checks: int = Field(..., description="Number of checks that passed")
    failed_checks: int = Field(..., description="Number of checks that failed")
    results: list[ComplianceResult] = Field(
        ..., description="Individual check results"
    )
    violations: list[dict[str, Any]] = Field(
        default_factory=list, description="List of violations found"
    )

    @classmethod
    def from_results(
        cls, standard: str, results: list[ComplianceResult], timestamp: str
    ) -> "ComplianceReport":
        """Create a report from a list of compliance results."""
        passed_results = [r for r in results if r.passed]
        failed_results = [r for r in results if not r.passed]

        return cls(
            timestamp=timestamp,
            standard=standard,
            overall_passed=len(failed_results) == 0,
            total_checks=len(results),
            passed_checks=len(passed_results),
            failed_checks=len(failed_results),
            results=results,
            violations=[
                {
                    "requirement": r.requirement,
                    "message": r.message,
                    "severity": r.severity,
                }
                for r in failed_results
            ],
        )
