"""Conflict Detector Service.

Detects and manages coherence conflicts across project documents.
Provides both real-time (hot path) and batch analysis capabilities.
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.rules import RuleEvaluation, RuleSeverity, ResolutionOption
from app.models.conflicts import (
    Conflict,
    ConflictResolution,
    ConflictStatus,
    CoherenceStatus,
)
from app.services.rule_engine import RuleEngine, get_rule_engine

logger = logging.getLogger(__name__)


class ConflictDetector:
    """Service for detecting and managing coherence conflicts.

    Provides:
    - Real-time conflict detection (< 100ms for hot path)
    - Batch analysis for full project checks
    - Conflict persistence and management
    - Resolution workflows
    """

    def __init__(
        self,
        db: AsyncSession,
        rule_engine: Optional[RuleEngine] = None,
    ):
        """Initialize the conflict detector.

        Args:
            db: Async database session
            rule_engine: Optional rule engine instance
        """
        self.db = db
        self.rule_engine = rule_engine or get_rule_engine()
        self.settings = get_settings()

    async def check_realtime(
        self,
        project_id: UUID,
        fact_key: str,
        new_value: Any,
        source: str,
    ) -> List[Conflict]:
        """Perform real-time conflict check for a single fact change.

        This is the hot-path check that must complete quickly (<100ms).

        Args:
            project_id: Project UUID
            fact_key: The fact key being changed
            new_value: The new value
            source: Source of the change

        Returns:
            List of detected conflicts
        """
        start_time = time.time()
        conflicts = []

        try:
            # Get relevant rules for this fact key
            relevant_rules = [
                r for r in self.rule_engine.get_all_rules()
                if fact_key in r.fact_keys or any(
                    fact_key.startswith(k) or k.startswith(fact_key)
                    for k in r.fact_keys
                )
            ]

            if not relevant_rules:
                return []

            # Get current knowledge base (simplified for speed)
            kb = await self._get_knowledge_base_fast(project_id)
            if not kb:
                return []

            # Simulate the change
            modified_kb = self._apply_change(kb, fact_key, new_value, source)

            # Evaluate relevant rules only
            for rule in relevant_rules:
                result = self.rule_engine.evaluate_rule(rule, modified_kb)

                # Check timeout
                elapsed = (time.time() - start_time) * 1000
                if elapsed > self.settings.REALTIME_CHECK_TIMEOUT_MS:
                    logger.warning(
                        "Realtime check timeout for project %s, checked %d rules",
                        project_id, len(conflicts)
                    )
                    break

                if not result.passed:
                    conflict = self._create_conflict_from_result(
                        project_id, result, rule
                    )
                    conflicts.append(conflict)

        except Exception as e:
            logger.error("Realtime check error: %s", e)

        elapsed = (time.time() - start_time) * 1000
        logger.debug(
            "Realtime check for %s completed in %.2fms, found %d conflicts",
            project_id, elapsed, len(conflicts)
        )

        return conflicts

    async def check_full(
        self,
        project_id: UUID,
        persist: bool = True,
    ) -> CoherenceStatus:
        """Perform full coherence check on a project.

        This is the batch analysis that checks all rules.

        Args:
            project_id: Project UUID
            persist: Whether to persist detected conflicts

        Returns:
            CoherenceStatus summary
        """
        start_time = time.time()

        try:
            # Get full knowledge base
            kb = await self._get_knowledge_base(project_id)
            if not kb:
                return CoherenceStatus(
                    project_id=str(project_id),
                    coherence_score=100.0,
                    total_rules_checked=0,
                )

            # Evaluate all rules
            results = self.rule_engine.evaluate_all_rules(kb)

            # Convert failed results to conflicts
            conflicts = []
            for result in results:
                if not result.passed:
                    rule = self.rule_engine.get_rule(result.rule_id)
                    conflict = self._create_conflict_from_result(
                        project_id, result, rule
                    )
                    conflicts.append(conflict)

            # Persist conflicts if requested
            if persist and conflicts:
                await self._persist_conflicts(project_id, conflicts)

            # Calculate status
            status = CoherenceStatus.calculate(
                project_id=str(project_id),
                conflicts=conflicts,
                total_rules=len(results),
            )

            elapsed = (time.time() - start_time) * 1000
            logger.info(
                "Full check for %s completed in %.2fms, score: %.1f",
                project_id, elapsed, status.coherence_score
            )

            return status

        except Exception as e:
            logger.error("Full check error for %s: %s", project_id, e)
            return CoherenceStatus(
                project_id=str(project_id),
                coherence_score=0.0,
                total_rules_checked=0,
                top_issues=[f"Error during check: {str(e)}"],
            )

    async def get_conflicts(
        self,
        project_id: UUID,
        status: Optional[ConflictStatus] = None,
    ) -> List[Conflict]:
        """Get conflicts for a project.

        Args:
            project_id: Project UUID
            status: Optional status filter

        Returns:
            List of Conflict objects
        """
        query = """
            SELECT conflict_id, project_id, rule_id, rule_name, severity,
                   fact_key, description, values, sources, status,
                   resolution_options, resolved_by, resolved_at, resolution,
                   resolution_value, resolution_note, detected_at, updated_at
            FROM coherence_conflicts
            WHERE project_id = :project_id
        """
        params = {"project_id": str(project_id)}

        if status:
            query += " AND status = :status"
            params["status"] = status.value

        query += " ORDER BY detected_at DESC"

        try:
            result = await self.db.execute(text(query), params)
            rows = result.fetchall()

            conflicts = []
            for row in rows:
                conflicts.append(Conflict(
                    conflict_id=row.conflict_id,
                    project_id=row.project_id,
                    rule_id=row.rule_id,
                    rule_name=row.rule_name,
                    severity=RuleSeverity(row.severity),
                    fact_key=row.fact_key,
                    description=row.description,
                    values=row.values or {},
                    sources=row.sources or [],
                    status=ConflictStatus(row.status),
                    resolution_options=[ResolutionOption(o) for o in (row.resolution_options or [])],
                    resolved_by=row.resolved_by,
                    resolved_at=row.resolved_at,
                    resolution=ResolutionOption(row.resolution) if row.resolution else None,
                    resolution_value=row.resolution_value,
                    resolution_note=row.resolution_note,
                    detected_at=row.detected_at,
                    updated_at=row.updated_at,
                ))

            return conflicts

        except Exception as e:
            logger.error("Error getting conflicts: %s", e)
            return []

    async def resolve_conflict(
        self,
        conflict_id: str,
        resolution: ConflictResolution,
        user_id: str,
    ) -> Optional[Conflict]:
        """Resolve a conflict.

        Args:
            conflict_id: Conflict ID
            resolution: Resolution details
            user_id: ID of user resolving

        Returns:
            Updated Conflict or None if not found
        """
        try:
            # Determine new status based on resolution
            new_status = ConflictStatus.RESOLVED
            if resolution.resolution == ResolutionOption.MARK_INTENTIONAL:
                new_status = ConflictStatus.OVERRIDDEN
            elif resolution.resolution == ResolutionOption.DEFER:
                new_status = ConflictStatus.DEFERRED

            query = """
                UPDATE coherence_conflicts
                SET status = :status,
                    resolved_by = :resolved_by,
                    resolved_at = :resolved_at,
                    resolution = :resolution,
                    resolution_value = :resolution_value,
                    resolution_note = :resolution_note,
                    updated_at = NOW()
                WHERE conflict_id = :conflict_id
                RETURNING *
            """

            result = await self.db.execute(
                text(query),
                {
                    "conflict_id": conflict_id,
                    "status": new_status.value,
                    "resolved_by": user_id,
                    "resolved_at": datetime.utcnow(),
                    "resolution": resolution.resolution.value,
                    "resolution_value": str(resolution.value) if resolution.value else None,
                    "resolution_note": resolution.note,
                }
            )
            await self.db.commit()

            row = result.fetchone()
            if not row:
                return None

            # Return updated conflict
            return Conflict(
                conflict_id=row.conflict_id,
                project_id=row.project_id,
                rule_id=row.rule_id,
                rule_name=row.rule_name,
                severity=RuleSeverity(row.severity),
                fact_key=row.fact_key,
                description=row.description,
                values=row.values or {},
                sources=row.sources or [],
                status=ConflictStatus(row.status),
                resolved_by=row.resolved_by,
                resolved_at=row.resolved_at,
                resolution=ResolutionOption(row.resolution) if row.resolution else None,
                resolution_value=row.resolution_value,
                resolution_note=row.resolution_note,
                detected_at=row.detected_at,
                updated_at=row.updated_at,
            )

        except Exception as e:
            logger.error("Error resolving conflict: %s", e)
            return None

    async def get_coherence_status(self, project_id: UUID) -> CoherenceStatus:
        """Get current coherence status for a project.

        Args:
            project_id: Project UUID

        Returns:
            CoherenceStatus summary
        """
        conflicts = await self.get_conflicts(project_id, status=ConflictStatus.ACTIVE)

        # Get total rules count
        total_rules = len(self.rule_engine.get_all_rules())

        return CoherenceStatus.calculate(
            project_id=str(project_id),
            conflicts=conflicts,
            total_rules=total_rules,
        )

    # =========================================================================
    # Helper Methods
    # =========================================================================

    async def _get_knowledge_base_fast(
        self,
        project_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """Get knowledge base quickly (minimal data for hot path)."""
        try:
            result = await self.db.execute(
                text("""
                    SELECT facts, protocol_data
                    FROM project_knowledge_base
                    WHERE project_id = :project_id
                """),
                {"project_id": str(project_id)}
            )
            row = result.fetchone()
            if row:
                return {
                    "facts": row.facts or [],
                    "protocol_data": row.protocol_data or {},
                }
            return None
        except Exception as e:
            logger.error("Error getting KB fast: %s", e)
            return None

    async def _get_knowledge_base(
        self,
        project_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """Get full knowledge base for a project."""
        try:
            result = await self.db.execute(
                text("""
                    SELECT facts, protocol_data, documents, wizard_answers
                    FROM project_knowledge_base
                    WHERE project_id = :project_id
                """),
                {"project_id": str(project_id)}
            )
            row = result.fetchone()
            if row:
                return {
                    "facts": row.facts or [],
                    "protocol_data": row.protocol_data or {},
                    "documents": row.documents or [],
                    "wizard_answers": row.wizard_answers or {},
                }
            return None
        except Exception as e:
            logger.error("Error getting KB: %s", e)
            return None

    def _apply_change(
        self,
        kb: Dict[str, Any],
        fact_key: str,
        new_value: Any,
        source: str,
    ) -> Dict[str, Any]:
        """Apply a change to a copy of the knowledge base."""
        import copy
        modified = copy.deepcopy(kb)

        # Add/update fact
        facts = modified.get("facts", [])
        found = False
        for fact in facts:
            if fact.get("key") == fact_key and fact.get("source") == source:
                fact["value"] = new_value
                found = True
                break

        if not found:
            facts.append({
                "key": fact_key,
                "value": new_value,
                "source": source,
            })

        modified["facts"] = facts
        return modified

    def _create_conflict_from_result(
        self,
        project_id: UUID,
        result: RuleEvaluation,
        rule,
    ) -> Conflict:
        """Create a Conflict from a failed rule evaluation."""
        return Conflict(
            project_id=str(project_id),
            rule_id=result.rule_id,
            rule_name=result.rule_name,
            severity=result.severity,
            fact_key=result.fact_key or (rule.fact_keys[0] if rule and rule.fact_keys else "unknown"),
            description=result.message,
            values=result.actual_values or {},
            sources=result.conflicting_sources or [],
            resolution_options=rule.resolution_options if rule else [],
        )

    async def _persist_conflicts(
        self,
        project_id: UUID,
        conflicts: List[Conflict],
    ) -> None:
        """Persist conflicts to database."""
        import json

        for conflict in conflicts:
            try:
                # Check if similar conflict already exists
                existing = await self.db.execute(
                    text("""
                        SELECT conflict_id FROM coherence_conflicts
                        WHERE project_id = :project_id
                          AND rule_id = :rule_id
                          AND fact_key = :fact_key
                          AND status = 'active'
                    """),
                    {
                        "project_id": conflict.project_id,
                        "rule_id": conflict.rule_id,
                        "fact_key": conflict.fact_key,
                    }
                )

                if existing.fetchone():
                    # Update existing conflict
                    await self.db.execute(
                        text("""
                            UPDATE coherence_conflicts
                            SET values = :values,
                                sources = :sources,
                                description = :description,
                                updated_at = NOW()
                            WHERE project_id = :project_id
                              AND rule_id = :rule_id
                              AND fact_key = :fact_key
                              AND status = 'active'
                        """),
                        {
                            "project_id": conflict.project_id,
                            "rule_id": conflict.rule_id,
                            "fact_key": conflict.fact_key,
                            "values": json.dumps(conflict.values),
                            "sources": json.dumps(conflict.sources),
                            "description": conflict.description,
                        }
                    )
                else:
                    # Insert new conflict
                    await self.db.execute(
                        text("""
                            INSERT INTO coherence_conflicts (
                                conflict_id, project_id, rule_id, rule_name,
                                severity, fact_key, description, values, sources,
                                status, resolution_options, detected_at
                            ) VALUES (
                                :conflict_id, :project_id, :rule_id, :rule_name,
                                :severity, :fact_key, :description, :values, :sources,
                                :status, :resolution_options, :detected_at
                            )
                        """),
                        {
                            "conflict_id": conflict.conflict_id,
                            "project_id": conflict.project_id,
                            "rule_id": conflict.rule_id,
                            "rule_name": conflict.rule_name,
                            "severity": conflict.severity.value if hasattr(conflict.severity, 'value') else conflict.severity,
                            "fact_key": conflict.fact_key,
                            "description": conflict.description,
                            "values": json.dumps(conflict.values),
                            "sources": json.dumps(conflict.sources),
                            "status": conflict.status.value if hasattr(conflict.status, 'value') else conflict.status,
                            "resolution_options": json.dumps([
                                o.value if hasattr(o, 'value') else o
                                for o in conflict.resolution_options
                            ]),
                            "detected_at": conflict.detected_at,
                        }
                    )

                await self.db.commit()

            except Exception as e:
                logger.error("Error persisting conflict: %s", e)


def get_conflict_detector(db: AsyncSession) -> ConflictDetector:
    """Get a ConflictDetector instance.

    Args:
        db: Async database session

    Returns:
        ConflictDetector instance
    """
    return ConflictDetector(db)
