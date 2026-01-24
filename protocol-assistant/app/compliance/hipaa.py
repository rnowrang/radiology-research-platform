"""HIPAA compliance requirements for Protocol Assistant.

This module implements HIPAA (Health Insurance Portability and Accountability Act)
compliance requirements that are always enforced when handling protected health
information (PHI) in the Protocol Assistant service.

HIPAA Safe Harbor: The 18 HIPAA identifiers that constitute PHI:
1. Names
2. Geographic data (smaller than state)
3. Dates (except year) related to an individual
4. Telephone numbers
5. Fax numbers
6. Email addresses
7. Social Security numbers
8. Medical record numbers
9. Health plan beneficiary numbers
10. Account numbers
11. Certificate/license numbers
12. Vehicle identifiers and serial numbers
13. Device identifiers and serial numbers
14. Web URLs
15. IP addresses
16. Biometric identifiers
17. Full-face photographs
18. Any other unique identifying number or code
"""

import logging
from typing import Any, Optional

from fastapi import Request

from app.compliance.framework import (
    ComplianceContext,
    ComplianceReport,
    ComplianceRequirement,
    ComplianceResult,
    ComplianceStandard,
    ComplianceViolation,
)
from app.services.phi_detector import PHIDetector, get_phi_detector

logger = logging.getLogger(__name__)


class PHIRedactionRequirement(ComplianceRequirement):
    """
    Requirement: All PHI must be redacted before sending to external LLM providers.

    This requirement ensures that no Protected Health Information is transmitted
    to external AI services, maintaining patient privacy and HIPAA compliance.
    """

    name = "phi_redaction"
    description = "All PHI must be redacted before sending to external LLM providers"
    standard = ComplianceStandard.HIPAA
    is_mandatory = True

    def __init__(self, sensitivity: str = "medium"):
        """
        Initialize the PHI redaction requirement.

        Args:
            sensitivity: PHI detection sensitivity level (low, medium, high)
        """
        self.sensitivity = sensitivity

    async def validate(self, context: dict[str, Any]) -> ComplianceResult:
        """
        Validate that text content does not contain PHI.

        Args:
            context: Dictionary containing:
                - text: Text content to validate

        Returns:
            ComplianceResult indicating whether the text is PHI-free
        """
        text = context.get("text", "")
        if not text:
            return ComplianceResult(
                passed=True,
                standard="HIPAA",
                requirement=self.name,
                message="No text content to validate",
            )

        detector = get_phi_detector(self.sensitivity)
        summary = detector.get_phi_summary(text)

        if summary["has_phi"]:
            phi_types = list(summary["by_type"].keys())
            return ComplianceResult(
                passed=False,
                standard="HIPAA",
                requirement=self.name,
                message=f"PHI detected in content: {', '.join(phi_types)}",
                severity="error",
                details={
                    "phi_types_found": phi_types,
                    "total_matches": summary["total_count"],
                    "by_type": {
                        k: v["count"] for k, v in summary["by_type"].items()
                    },
                },
                remediation="Use PHIRedactionRequirement.enforce() to redact PHI before external transmission",
            )

        return ComplianceResult(
            passed=True,
            standard="HIPAA",
            requirement=self.name,
            message="No PHI detected in content",
        )

    async def enforce(self, context: dict[str, Any]) -> str:
        """
        Enforce PHI redaction by redacting all detected PHI from text.

        Args:
            context: Dictionary containing:
                - text: Text content to redact

        Returns:
            Text with all PHI redacted
        """
        text = context.get("text", "")
        if not text:
            return ""

        detector = get_phi_detector(self.sensitivity)
        redacted_text = detector.redact(text)

        # Log the redaction action
        summary = detector.get_phi_summary(text)
        if summary["has_phi"]:
            logger.info(
                f"PHI redacted: {summary['total_count']} instances of "
                f"{list(summary['by_type'].keys())}"
            )

        return redacted_text


class AuditLoggingRequirement(ComplianceRequirement):
    """
    Requirement: All access and modifications to PHI must be logged.

    HIPAA requires covered entities to implement hardware, software, and/or
    procedural mechanisms to record and examine activity in information systems
    that contain or use electronic protected health information.
    """

    name = "audit_logging"
    description = "All access and modifications must be logged with sufficient detail"
    standard = ComplianceStandard.HIPAA
    is_mandatory = True

    async def validate(self, context: dict[str, Any]) -> ComplianceResult:
        """
        Validate that audit logging is enabled and configured.

        This validation checks that the audit logging infrastructure is
        available. The actual logging is performed by the audit middleware.

        Args:
            context: Dictionary containing:
                - audit_enabled: Whether audit logging is enabled

        Returns:
            ComplianceResult indicating audit logging status
        """
        audit_enabled = context.get("audit_enabled", True)

        if not audit_enabled:
            return ComplianceResult(
                passed=False,
                standard="HIPAA",
                requirement=self.name,
                message="Audit logging is not enabled",
                severity="error",
                remediation="Enable audit logging in application configuration",
            )

        return ComplianceResult(
            passed=True,
            standard="HIPAA",
            requirement=self.name,
            message="Audit logging is enabled and configured",
        )

    async def enforce(self, context: dict[str, Any]) -> None:
        """
        Enforce audit logging by logging the current action.

        Note: Primary enforcement is via the audit middleware. This method
        provides a way to explicitly log specific actions.

        Args:
            context: Dictionary containing action details to log
        """
        # Audit logging is primarily implemented via middleware
        # This method can be used for explicit logging of specific actions
        action = context.get("action", "unspecified")
        user_id = context.get("user_id", "unknown")
        resource_id = context.get("resource_id")

        logger.info(
            f"HIPAA Audit: user={user_id} action={action} resource={resource_id}"
        )


class AccessControlRequirement(ComplianceRequirement):
    """
    Requirement: Access must be limited to authorized users only.

    HIPAA requires technical policies and procedures for electronic information
    systems that maintain electronic protected health information to allow
    access only to those persons or software programs that have been granted
    access rights.
    """

    name = "access_control"
    description = "Access must be limited to authorized users with appropriate roles"
    standard = ComplianceStandard.HIPAA
    is_mandatory = True

    async def validate(self, context: dict[str, Any]) -> ComplianceResult:
        """
        Validate that the user has appropriate access rights.

        Args:
            context: Dictionary containing:
                - user_id: ID of the user requesting access
                - resource_id: ID of the resource being accessed
                - action: The action being performed
                - user_roles: List of roles the user has
                - required_roles: List of roles required for access

        Returns:
            ComplianceResult indicating access authorization status
        """
        user_id = context.get("user_id")
        resource_id = context.get("resource_id")
        action = context.get("action", "access")
        user_roles = set(context.get("user_roles", []))
        required_roles = set(context.get("required_roles", []))

        # If no user_id, access is not authenticated
        if not user_id:
            return ComplianceResult(
                passed=False,
                standard="HIPAA",
                requirement=self.name,
                message="Access denied: User not authenticated",
                severity="error",
                details={"resource_id": resource_id, "action": action},
                remediation="Authenticate user before accessing protected resources",
            )

        # If required_roles specified, check user has at least one
        if required_roles and not user_roles.intersection(required_roles):
            return ComplianceResult(
                passed=False,
                standard="HIPAA",
                requirement=self.name,
                message=f"Access denied: User lacks required role for {action}",
                severity="error",
                details={
                    "user_id": str(user_id),
                    "resource_id": str(resource_id) if resource_id else None,
                    "action": action,
                    "user_roles": list(user_roles),
                    "required_roles": list(required_roles),
                },
                remediation="Request appropriate role assignment from administrator",
            )

        return ComplianceResult(
            passed=True,
            standard="HIPAA",
            requirement=self.name,
            message="Access authorized",
            details={
                "user_id": str(user_id),
                "action": action,
            },
        )

    async def enforce(self, context: dict[str, Any]) -> None:
        """
        Enforce access control by raising exception if unauthorized.

        Args:
            context: Dictionary containing access control context

        Raises:
            ComplianceViolation: If access is not authorized
        """
        result = await self.validate(context)

        if not result.passed:
            raise ComplianceViolation(
                standard="HIPAA",
                requirement=self.name,
                message=result.message or "Access denied",
                severity=result.severity,
                details=result.details,
            )


class MinimumNecessaryRequirement(ComplianceRequirement):
    """
    Requirement: Only the minimum necessary PHI should be used or disclosed.

    HIPAA requires covered entities to make reasonable efforts to limit access
    to protected health information to those persons who need access to perform
    their job duties.
    """

    name = "minimum_necessary"
    description = "Only minimum necessary PHI should be used or disclosed"
    standard = ComplianceStandard.HIPAA
    is_mandatory = True

    async def validate(self, context: dict[str, Any]) -> ComplianceResult:
        """
        Validate that only minimum necessary data is being accessed.

        Args:
            context: Dictionary containing:
                - requested_fields: Fields being requested
                - allowed_fields: Fields the user is allowed to access
                - purpose: Purpose for accessing the data

        Returns:
            ComplianceResult indicating minimum necessary compliance
        """
        requested_fields = set(context.get("requested_fields", []))
        allowed_fields = set(context.get("allowed_fields", []))
        purpose = context.get("purpose", "unspecified")

        if allowed_fields and requested_fields:
            unauthorized_fields = requested_fields - allowed_fields
            if unauthorized_fields:
                return ComplianceResult(
                    passed=False,
                    standard="HIPAA",
                    requirement=self.name,
                    message=f"Request exceeds minimum necessary: unauthorized fields",
                    severity="warning",
                    details={
                        "unauthorized_fields": list(unauthorized_fields),
                        "purpose": purpose,
                    },
                    remediation="Limit request to only required fields",
                )

        return ComplianceResult(
            passed=True,
            standard="HIPAA",
            requirement=self.name,
            message="Request complies with minimum necessary standard",
        )

    async def enforce(self, context: dict[str, Any]) -> dict[str, Any]:
        """
        Enforce minimum necessary by filtering to allowed fields only.

        Args:
            context: Dictionary containing:
                - data: Data to filter
                - allowed_fields: Fields allowed for access

        Returns:
            Filtered data containing only allowed fields
        """
        data = context.get("data", {})
        allowed_fields = set(context.get("allowed_fields", []))

        if not allowed_fields:
            return data

        return {k: v for k, v in data.items() if k in allowed_fields}


class HIPAACompliance:
    """
    HIPAA compliance manager.

    This class orchestrates all HIPAA compliance requirements and provides
    methods for validating and enforcing compliance across the application.
    HIPAA compliance is always enforced - it cannot be disabled.
    """

    def __init__(self, phi_sensitivity: str = "medium"):
        """
        Initialize HIPAA compliance manager.

        Args:
            phi_sensitivity: PHI detection sensitivity level
        """
        self.requirements = [
            PHIRedactionRequirement(sensitivity=phi_sensitivity),
            AuditLoggingRequirement(),
            AccessControlRequirement(),
            MinimumNecessaryRequirement(),
        ]
        self._requirement_map = {r.name: r for r in self.requirements}

    def get_requirement(self, name: str) -> Optional[ComplianceRequirement]:
        """Get a specific requirement by name."""
        return self._requirement_map.get(name)

    async def validate_request(
        self, context: dict[str, Any]
    ) -> list[ComplianceResult]:
        """
        Validate a request against all HIPAA requirements.

        Args:
            context: Dictionary containing request context

        Returns:
            List of ComplianceResult objects for each requirement

        Raises:
            ComplianceViolation: If any mandatory requirement fails
        """
        results = []

        for req in self.requirements:
            result = await req.validate(context)
            results.append(result)

            # Raise exception on mandatory requirement failure
            if not result.passed and req.is_mandatory:
                logger.warning(
                    f"HIPAA violation: {req.name} - {result.message}"
                )
                raise ComplianceViolation(
                    standard="HIPAA",
                    requirement=req.name,
                    message=result.message or f"Failed {req.name} requirement",
                    severity=result.severity,
                    details=result.details,
                )

        return results

    async def validate_all(
        self, context: dict[str, Any], raise_on_failure: bool = True
    ) -> ComplianceReport:
        """
        Validate against all requirements and generate a report.

        Args:
            context: Dictionary containing request context
            raise_on_failure: Whether to raise exception on failure

        Returns:
            ComplianceReport summarizing all validation results
        """
        from datetime import datetime

        results = []
        violations = []

        for req in self.requirements:
            try:
                result = await req.validate(context)
                results.append(result)

                if not result.passed:
                    violations.append(result)
                    if raise_on_failure and req.is_mandatory:
                        raise ComplianceViolation(
                            standard="HIPAA",
                            requirement=req.name,
                            message=result.message or f"Failed {req.name}",
                            severity=result.severity,
                            details=result.details,
                        )
            except ComplianceViolation:
                raise
            except Exception as e:
                logger.error(f"Error validating {req.name}: {e}")
                results.append(
                    ComplianceResult(
                        passed=False,
                        standard="HIPAA",
                        requirement=req.name,
                        message=f"Validation error: {str(e)}",
                        severity="error",
                    )
                )

        return ComplianceReport.from_results(
            standard="HIPAA",
            results=results,
            timestamp=datetime.utcnow().isoformat(),
        )

    async def ensure_phi_redacted(self, text: str) -> str:
        """
        Ensure all PHI is redacted from text.

        This is a convenience method for the most common HIPAA operation:
        redacting PHI before sending data to external services.

        Args:
            text: Text that may contain PHI

        Returns:
            Text with all PHI redacted
        """
        req = self.get_requirement("phi_redaction")
        if req:
            return await req.enforce({"text": text})
        return text

    async def check_access(
        self,
        user_id: str,
        resource_id: Optional[str] = None,
        action: str = "access",
        user_roles: Optional[list[str]] = None,
        required_roles: Optional[list[str]] = None,
    ) -> ComplianceResult:
        """
        Check if a user has access to a resource.

        Args:
            user_id: ID of the user requesting access
            resource_id: ID of the resource being accessed
            action: The action being performed
            user_roles: List of roles the user has
            required_roles: List of roles required for access

        Returns:
            ComplianceResult indicating access status
        """
        req = self.get_requirement("access_control")
        if req:
            return await req.validate(
                {
                    "user_id": user_id,
                    "resource_id": resource_id,
                    "action": action,
                    "user_roles": user_roles or [],
                    "required_roles": required_roles or [],
                }
            )
        return ComplianceResult(
            passed=True,
            standard="HIPAA",
            requirement="access_control",
            message="Access control not configured",
        )

    def get_requirements_info(self) -> list[dict[str, Any]]:
        """Get information about all HIPAA requirements."""
        return [req.get_info() for req in self.requirements]


# Global HIPAA compliance instance
_hipaa_compliance: Optional[HIPAACompliance] = None


def get_hipaa_compliance(phi_sensitivity: str = "medium") -> HIPAACompliance:
    """Get the global HIPAA compliance instance."""
    global _hipaa_compliance
    if _hipaa_compliance is None:
        _hipaa_compliance = HIPAACompliance(phi_sensitivity=phi_sensitivity)
    return _hipaa_compliance
