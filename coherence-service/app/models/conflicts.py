"""Conflict Models for Coherence Service.

Conflicts represent detected inconsistencies across project documents
that need resolution.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from app.models.rules import RuleSeverity, ResolutionOption


class ConflictStatus(str, Enum):
    """Status of a conflict."""
    ACTIVE = "active"           # Needs resolution
    RESOLVED = "resolved"       # Has been resolved
    DEFERRED = "deferred"       # Marked to resolve later
    OVERRIDDEN = "overridden"   # Intentionally different


class Conflict(BaseModel):
    """A detected coherence conflict.

    Represents an inconsistency detected by the coherence engine
    that requires user attention or resolution.
    """
    conflict_id: str = Field(default_factory=lambda: str(uuid4()))
    project_id: str = Field(..., description="Project this conflict belongs to")

    # What rule detected this
    rule_id: str = Field(..., description="Rule that detected this conflict")
    rule_name: str = Field(..., description="Human-readable rule name")
    severity: RuleSeverity = Field(default=RuleSeverity.WARNING)

    # What's conflicting
    fact_key: str = Field(..., description="The fact key with conflicting values")
    description: str = Field(..., description="Human-readable conflict description")

    # The conflicting values
    values: Dict[str, Any] = Field(
        ...,
        description="Map of source -> value (e.g., {'protocol': 150, 'irb_form': 100})"
    )
    sources: List[str] = Field(
        ...,
        description="List of document/source types involved"
    )

    # Status and resolution
    status: ConflictStatus = Field(default=ConflictStatus.ACTIVE)
    resolution_options: List[ResolutionOption] = Field(default_factory=list)

    # Resolution details (if resolved)
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolution: Optional[ResolutionOption] = None
    resolution_value: Optional[Any] = None
    resolution_note: Optional[str] = None

    # Timestamps
    detected_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        use_enum_values = True


class ConflictResolution(BaseModel):
    """Request to resolve a conflict."""
    resolution: ResolutionOption = Field(
        ...,
        description="How to resolve the conflict"
    )
    value: Optional[Any] = Field(
        None,
        description="Value to use if resolution requires it"
    )
    note: Optional[str] = Field(
        None,
        description="Optional note explaining the resolution"
    )
    propagate: bool = Field(
        default=True,
        description="Whether to propagate the change to other documents"
    )


class CoherenceStatus(BaseModel):
    """Overall coherence status for a project.

    Provides a summary of the project's coherence state including
    score, active conflicts, and recommendations.
    """
    project_id: str
    coherence_score: float = Field(
        ...,
        ge=0,
        le=100,
        description="Coherence score (0-100)"
    )

    # Counts
    total_rules_checked: int = 0
    rules_passed: int = 0
    rules_failed: int = 0

    # Conflicts by severity
    conflicts_error: int = 0
    conflicts_warning: int = 0
    conflicts_info: int = 0
    total_conflicts: int = 0

    # Status
    has_blocking_issues: bool = Field(
        default=False,
        description="True if there are ERROR severity conflicts"
    )
    ready_for_submission: bool = Field(
        default=True,
        description="True if no blocking issues exist"
    )

    # Top issues
    top_issues: List[str] = Field(
        default_factory=list,
        description="Summary of most important issues"
    )

    # Timestamps
    last_checked_at: datetime = Field(default_factory=datetime.utcnow)

    @classmethod
    def calculate(
        cls,
        project_id: str,
        conflicts: List[Conflict],
        total_rules: int = 0,
    ) -> "CoherenceStatus":
        """Calculate coherence status from conflicts.

        Args:
            project_id: Project ID
            conflicts: List of active conflicts
            total_rules: Total number of rules checked

        Returns:
            Calculated CoherenceStatus
        """
        active_conflicts = [c for c in conflicts if c.status == ConflictStatus.ACTIVE]

        errors = sum(1 for c in active_conflicts if c.severity == RuleSeverity.ERROR)
        warnings = sum(1 for c in active_conflicts if c.severity == RuleSeverity.WARNING)
        infos = sum(1 for c in active_conflicts if c.severity == RuleSeverity.INFO)

        total_active = len(active_conflicts)

        # Calculate score (100 - weighted penalty)
        # Errors: -10 each, Warnings: -3 each, Info: -1 each
        penalty = (errors * 10) + (warnings * 3) + (infos * 1)
        score = max(0, 100 - penalty)

        # Top issues (errors first, then warnings)
        top_issues = []
        for conflict in sorted(
            active_conflicts,
            key=lambda c: (
                0 if c.severity == RuleSeverity.ERROR else
                1 if c.severity == RuleSeverity.WARNING else 2
            )
        )[:5]:
            top_issues.append(conflict.description)

        return cls(
            project_id=project_id,
            coherence_score=score,
            total_rules_checked=total_rules,
            rules_passed=total_rules - len(active_conflicts),
            rules_failed=len(active_conflicts),
            conflicts_error=errors,
            conflicts_warning=warnings,
            conflicts_info=infos,
            total_conflicts=total_active,
            has_blocking_issues=errors > 0,
            ready_for_submission=errors == 0,
            top_issues=top_issues,
        )
