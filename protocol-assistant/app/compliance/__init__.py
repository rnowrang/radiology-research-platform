"""Compliance framework for Protocol Assistant.

This module provides HIPAA, 21 CFR Part 11, GDPR, and SOC2 compliance
capabilities for the Protocol Assistant service.
"""

from app.compliance.framework import (
    ComplianceRequirement,
    ComplianceResult,
    ComplianceStandard,
    ComplianceViolation,
)
from app.compliance.hipaa import (
    AccessControlRequirement,
    AuditLoggingRequirement,
    HIPAACompliance,
    PHIRedactionRequirement,
)
from app.compliance.cfr21 import CFR21Part11Compliance, SignatureCredentials

__all__ = [
    # Framework
    "ComplianceRequirement",
    "ComplianceResult",
    "ComplianceStandard",
    "ComplianceViolation",
    # HIPAA
    "HIPAACompliance",
    "PHIRedactionRequirement",
    "AuditLoggingRequirement",
    "AccessControlRequirement",
    # 21 CFR Part 11
    "CFR21Part11Compliance",
    "SignatureCredentials",
]
