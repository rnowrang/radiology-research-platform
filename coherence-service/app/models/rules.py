"""Coherence Rule Models.

Rules define what consistency checks to perform across documents
and how to handle violations.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class RuleSeverity(str, Enum):
    """Severity level for rule violations."""
    ERROR = "error"      # Must fix before submission
    WARNING = "warning"  # Should fix, soft block
    INFO = "info"        # Suggestion only


class CheckType(str, Enum):
    """Types of coherence checks."""
    CROSS_DOCUMENT_EQUALITY = "cross_document_equality"  # Same value across docs
    LOGICAL_CONSISTENCY = "logical_consistency"          # Logical rules
    REQUIRED_FIELD = "required_field"                    # Field must exist
    TIMELINE_CONSISTENCY = "timeline_consistency"        # Date logic
    REGULATORY_COMPLIANCE = "regulatory_compliance"      # Required elements
    VALUE_RANGE = "value_range"                          # Value within range
    CONDITIONAL_REQUIREMENT = "conditional_requirement"  # If X then Y required


class ResolutionOption(str, Enum):
    """Options for resolving conflicts."""
    ADOPT_SOURCE_VALUE = "adopt_source_value"           # Use KB/protocol value
    ADOPT_FORM_VALUE = "adopt_form_value"               # Use form value
    MARK_INTENTIONAL = "mark_intentional_difference"    # Acknowledge override
    PROVIDE_NEW_VALUE = "provide_new_value"             # User provides value
    DEFER = "defer"                                      # Resolve later


class CoherenceRule(BaseModel):
    """Definition of a coherence rule.

    Rules are defined declaratively and can be loaded from YAML files
    or created programmatically.
    """
    rule_id: str = Field(..., description="Unique rule identifier")
    version: str = Field(default="1.0", description="Rule version")
    name: str = Field(..., description="Human-readable rule name")
    description: str = Field(..., description="What this rule checks")
    severity: RuleSeverity = Field(default=RuleSeverity.WARNING)
    check_type: CheckType = Field(..., description="Type of check to perform")
    enabled: bool = Field(default=True, description="Whether rule is active")

    # What to check
    fact_keys: List[str] = Field(
        default_factory=list,
        description="KB fact keys involved in this check"
    )
    documents: List[str] = Field(
        default_factory=list,
        description="Document types to check (protocol, irb_form, budget, etc.)"
    )

    # Check parameters
    parameters: Dict[str, Any] = Field(
        default_factory=dict,
        description="Rule-specific parameters"
    )

    # Resolution
    resolution_options: List[ResolutionOption] = Field(
        default_factory=lambda: [
            ResolutionOption.ADOPT_SOURCE_VALUE,
            ResolutionOption.ADOPT_FORM_VALUE,
            ResolutionOption.MARK_INTENTIONAL,
        ],
        description="Available resolution options"
    )

    # Metadata
    category: str = Field(default="general", description="Rule category")
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True


class RuleEvaluation(BaseModel):
    """Result of evaluating a rule against project data."""
    rule_id: str
    rule_name: str
    severity: RuleSeverity
    passed: bool = Field(description="Whether the rule check passed")
    message: str = Field(description="Human-readable result message")

    # Details if failed
    fact_key: Optional[str] = None
    expected_value: Optional[Any] = None
    actual_values: Optional[Dict[str, Any]] = None  # source -> value
    conflicting_sources: Optional[List[str]] = None

    # Context
    evaluated_at: datetime = Field(default_factory=datetime.utcnow)
    evaluation_time_ms: float = Field(default=0)

    class Config:
        use_enum_values = True


# Built-in rule definitions
BUILTIN_RULES: List[Dict[str, Any]] = [
    {
        "rule_id": "SAMPLE_SIZE_CONSISTENCY",
        "name": "Sample Size Consistency",
        "description": "Sample size must match across protocol, IRB forms, and budget",
        "severity": "warning",
        "check_type": "cross_document_equality",
        "fact_keys": ["sample_size", "target_enrollment", "number_of_subjects"],
        "documents": ["protocol", "irb_form", "budget"],
        "category": "data_consistency",
        "tags": ["core", "sample_size"],
    },
    {
        "rule_id": "PI_INFO_CONSISTENCY",
        "name": "PI Information Consistency",
        "description": "Principal investigator name and email must match across documents",
        "severity": "warning",
        "check_type": "cross_document_equality",
        "fact_keys": ["pi_name", "pi_email", "principal_investigator.name", "principal_investigator.email"],
        "documents": ["protocol", "irb_form"],
        "category": "personnel",
        "tags": ["core", "personnel"],
    },
    {
        "rule_id": "DATES_LOGICAL",
        "name": "Date Logic",
        "description": "Start date must be before end date",
        "severity": "error",
        "check_type": "timeline_consistency",
        "fact_keys": ["start_date", "end_date", "study_start_date", "study_end_date"],
        "parameters": {
            "comparison": "start_before_end",
        },
        "category": "timeline",
        "tags": ["core", "dates"],
    },
    {
        "rule_id": "STUDY_TYPE_DOCUMENTS",
        "name": "Study Type Document Requirements",
        "description": "Required documents must be present based on study type",
        "severity": "error",
        "check_type": "conditional_requirement",
        "fact_keys": ["study_type"],
        "parameters": {
            "prospective": ["consent_form", "recruitment_materials"],
            "retrospective": ["hipaa_waiver_justification"],
            "clinical_trial": ["dsmb_charter", "fda_approval"],
        },
        "category": "regulatory",
        "tags": ["core", "documents"],
    },
    {
        "rule_id": "REQUIRED_STUDY_TITLE",
        "name": "Study Title Required",
        "description": "Study title must be provided",
        "severity": "error",
        "check_type": "required_field",
        "fact_keys": ["study_title", "title", "protocol_title"],
        "category": "basic_info",
        "tags": ["core", "required"],
    },
    {
        "rule_id": "STUDY_DURATION_REASONABLE",
        "name": "Study Duration Check",
        "description": "Study duration should be between 1 month and 10 years",
        "severity": "info",
        "check_type": "value_range",
        "fact_keys": ["study_duration_months", "duration"],
        "parameters": {
            "min_value": 1,
            "max_value": 120,
            "unit": "months",
        },
        "category": "timeline",
        "tags": ["validation", "duration"],
    },
]


def get_builtin_rules() -> List[CoherenceRule]:
    """Get list of built-in coherence rules."""
    return [CoherenceRule(**rule) for rule in BUILTIN_RULES]
