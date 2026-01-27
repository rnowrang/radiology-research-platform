"""Learning System for multi-level form fill improvement.

Tracks corrections at three levels:
1. User level - individual preferences
2. Project level - project-specific context
3. Institution level - department conventions

Uses corrections to improve future form fills.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.knowledge import CorrectionRecord, LearnedValue

logger = logging.getLogger(__name__)


class LearningSystem:
    """Service for learning from user corrections."""

    def __init__(self, db: AsyncSession):
        """Initialize the learning system.

        Args:
            db: Async database session
        """
        self.db = db

    async def record_correction(
        self,
        user_id: UUID,
        project_id: UUID,
        institution_id: Optional[UUID],
        form_template_id: int,
        field_id: str,
        field_label: Optional[str],
        field_type: Optional[str],
        original_value: Any,
        corrected_value: Any,
        source_evidence: Optional[str] = None,
        knowledge_base_keys: Optional[List[str]] = None,
    ) -> UUID:
        """Record a correction for learning.

        Args:
            user_id: User who made the correction
            project_id: Project context
            institution_id: Optional institution context
            form_template_id: Form template being edited
            field_id: Field that was corrected
            field_label: Human-readable field label
            field_type: Field type (text, radio, etc.)
            original_value: AI-suggested value
            corrected_value: User's corrected value
            source_evidence: What evidence was used for original
            knowledge_base_keys: Which KB facts were used

        Returns:
            UUID of the correction record
        """
        import json

        correction_id = uuid4()

        await self.db.execute(
            text("""
                INSERT INTO form_fill_corrections
                    (id, user_id, project_id, institution_id, form_template_id,
                     field_id, field_label, field_type,
                     original_value, corrected_value,
                     source_evidence, knowledge_base_keys)
                VALUES
                    (:id, :user_id, :project_id, :institution_id, :form_template_id,
                     :field_id, :field_label, :field_type,
                     :original_value, :corrected_value,
                     :source_evidence, :knowledge_base_keys)
            """),
            {
                "id": str(correction_id),
                "user_id": str(user_id),
                "project_id": str(project_id),
                "institution_id": str(institution_id) if institution_id else None,
                "form_template_id": form_template_id,
                "field_id": field_id,
                "field_label": field_label,
                "field_type": field_type,
                "original_value": json.dumps(original_value) if original_value is not None else None,
                "corrected_value": json.dumps(corrected_value) if corrected_value is not None else None,
                "source_evidence": source_evidence,
                "knowledge_base_keys": json.dumps(knowledge_base_keys) if knowledge_base_keys else None,
            }
        )
        await self.db.commit()

        logger.info(f"Recorded correction {correction_id} for field {field_id} by user {user_id}")
        return correction_id

    async def record_corrections_batch(
        self,
        user_id: UUID,
        project_id: UUID,
        institution_id: Optional[UUID],
        form_template_id: int,
        corrections: List[CorrectionRecord],
    ) -> int:
        """Record multiple corrections in batch.

        Args:
            user_id: User who made the corrections
            project_id: Project context
            institution_id: Optional institution context
            form_template_id: Form template being edited
            corrections: List of CorrectionRecord objects

        Returns:
            Number of corrections recorded
        """
        count = 0
        for correction in corrections:
            await self.record_correction(
                user_id=user_id,
                project_id=project_id,
                institution_id=institution_id,
                form_template_id=form_template_id,
                field_id=correction.field_id,
                field_label=correction.field_label,
                field_type=correction.field_type,
                original_value=correction.original_value,
                corrected_value=correction.corrected_value,
                source_evidence=correction.source_evidence,
                knowledge_base_keys=correction.knowledge_base_keys,
            )
            count += 1
        return count

    async def get_learned_value(
        self,
        field_id: str,
        user_id: Optional[UUID] = None,
        project_id: Optional[UUID] = None,
        institution_id: Optional[UUID] = None,
    ) -> Optional[LearnedValue]:
        """Get best learned value for a field.

        Checks in priority order: User > Project > Institution

        Args:
            field_id: Field ID to look up
            user_id: Optional user context
            project_id: Optional project context
            institution_id: Optional institution context

        Returns:
            LearnedValue with suggestion or None
        """
        # 1. Check user-specific patterns
        if user_id:
            user_value = await self._get_user_pattern(user_id, field_id)
            if user_value and user_value.confidence > 0.8:
                return user_value

        # 2. Check project-specific patterns
        if project_id:
            project_value = await self._get_project_pattern(project_id, field_id)
            if project_value and project_value.confidence > 0.7:
                return project_value

        # 3. Check institution patterns
        if institution_id:
            institution_value = await self._get_institution_pattern(institution_id, field_id)
            if institution_value and institution_value.confidence > 0.6:
                return institution_value

        return None

    async def _get_user_pattern(
        self,
        user_id: UUID,
        field_id: str
    ) -> Optional[LearnedValue]:
        """Get user-level learned pattern.

        Args:
            user_id: User UUID
            field_id: Field ID

        Returns:
            LearnedValue or None
        """
        import json

        # Get most recent corrections for this user+field
        result = await self.db.execute(
            text("""
                SELECT corrected_value, COUNT(*) as usage_count
                FROM form_fill_corrections
                WHERE user_id = :user_id AND field_id = :field_id
                GROUP BY corrected_value
                ORDER BY usage_count DESC, MAX(created_at) DESC
                LIMIT 1
            """),
            {"user_id": str(user_id), "field_id": field_id}
        )
        row = result.fetchone()

        if not row or row.corrected_value is None:
            return None

        usage_count = row.usage_count

        # Calculate confidence based on usage
        confidence = min(0.95, 0.7 + (usage_count * 0.05))

        try:
            value = json.loads(row.corrected_value)
        except (json.JSONDecodeError, TypeError):
            value = row.corrected_value

        return LearnedValue(
            value=value,
            confidence=confidence,
            source_level="user",
            usage_count=usage_count,
        )

    async def _get_project_pattern(
        self,
        project_id: UUID,
        field_id: str
    ) -> Optional[LearnedValue]:
        """Get project-level learned pattern.

        Args:
            project_id: Project UUID
            field_id: Field ID

        Returns:
            LearnedValue or None
        """
        import json

        result = await self.db.execute(
            text("""
                SELECT corrected_value, COUNT(*) as usage_count
                FROM form_fill_corrections
                WHERE project_id = :project_id AND field_id = :field_id
                GROUP BY corrected_value
                ORDER BY usage_count DESC, MAX(created_at) DESC
                LIMIT 1
            """),
            {"project_id": str(project_id), "field_id": field_id}
        )
        row = result.fetchone()

        if not row or row.corrected_value is None:
            return None

        usage_count = row.usage_count
        confidence = min(0.9, 0.6 + (usage_count * 0.05))

        try:
            value = json.loads(row.corrected_value)
        except (json.JSONDecodeError, TypeError):
            value = row.corrected_value

        return LearnedValue(
            value=value,
            confidence=confidence,
            source_level="project",
            usage_count=usage_count,
        )

    async def _get_institution_pattern(
        self,
        institution_id: UUID,
        field_id: str
    ) -> Optional[LearnedValue]:
        """Get institution-level learned pattern.

        Args:
            institution_id: Institution UUID
            field_id: Field ID

        Returns:
            LearnedValue or None
        """
        import json

        result = await self.db.execute(
            text("""
                SELECT corrected_value, COUNT(*) as usage_count
                FROM form_fill_corrections
                WHERE institution_id = :institution_id AND field_id = :field_id
                GROUP BY corrected_value
                ORDER BY usage_count DESC, MAX(created_at) DESC
                LIMIT 1
            """),
            {"institution_id": str(institution_id), "field_id": field_id}
        )
        row = result.fetchone()

        if not row or row.corrected_value is None:
            return None

        usage_count = row.usage_count
        confidence = min(0.85, 0.5 + (usage_count * 0.03))

        try:
            value = json.loads(row.corrected_value)
        except (json.JSONDecodeError, TypeError):
            value = row.corrected_value

        return LearnedValue(
            value=value,
            confidence=confidence,
            source_level="institution",
            usage_count=usage_count,
        )

    async def get_correction_history(
        self,
        field_id: str,
        user_id: Optional[UUID] = None,
        project_id: Optional[UUID] = None,
        institution_id: Optional[UUID] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """Get correction history for a field.

        Args:
            field_id: Field ID
            user_id: Optional filter by user
            project_id: Optional filter by project
            institution_id: Optional filter by institution
            limit: Maximum records to return

        Returns:
            List of correction records
        """
        import json

        # Build query with optional filters
        conditions = ["field_id = :field_id"]
        params = {"field_id": field_id, "limit": limit}

        if user_id:
            conditions.append("user_id = :user_id")
            params["user_id"] = str(user_id)
        if project_id:
            conditions.append("project_id = :project_id")
            params["project_id"] = str(project_id)
        if institution_id:
            conditions.append("institution_id = :institution_id")
            params["institution_id"] = str(institution_id)

        where_clause = " AND ".join(conditions)

        result = await self.db.execute(
            text(f"""
                SELECT id, user_id, project_id, institution_id, form_template_id,
                       field_id, field_label, field_type,
                       original_value, corrected_value,
                       source_evidence, created_at
                FROM form_fill_corrections
                WHERE {where_clause}
                ORDER BY created_at DESC
                LIMIT :limit
            """),
            params
        )
        rows = result.fetchall()

        corrections = []
        for row in rows:
            try:
                original = json.loads(row.original_value) if row.original_value else None
            except (json.JSONDecodeError, TypeError):
                original = row.original_value

            try:
                corrected = json.loads(row.corrected_value) if row.corrected_value else None
            except (json.JSONDecodeError, TypeError):
                corrected = row.corrected_value

            corrections.append({
                "id": row.id,
                "user_id": row.user_id,
                "project_id": row.project_id,
                "institution_id": row.institution_id,
                "form_template_id": row.form_template_id,
                "field_id": row.field_id,
                "field_label": row.field_label,
                "field_type": row.field_type,
                "original_value": original,
                "corrected_value": corrected,
                "source_evidence": row.source_evidence,
                "created_at": row.created_at,
                "was_corrected": original != corrected,
            })

        return corrections

    async def get_correction_stats(
        self,
        user_id: Optional[UUID] = None,
        project_id: Optional[UUID] = None,
        institution_id: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """Get statistics about corrections.

        Args:
            user_id: Optional filter by user
            project_id: Optional filter by project
            institution_id: Optional filter by institution

        Returns:
            Dict with correction statistics
        """
        conditions = []
        params = {}

        if user_id:
            conditions.append("user_id = :user_id")
            params["user_id"] = str(user_id)
        if project_id:
            conditions.append("project_id = :project_id")
            params["project_id"] = str(project_id)
        if institution_id:
            conditions.append("institution_id = :institution_id")
            params["institution_id"] = str(institution_id)

        where_clause = " AND ".join(conditions) if conditions else "1=1"

        result = await self.db.execute(
            text(f"""
                SELECT
                    COUNT(*) as total_corrections,
                    COUNT(DISTINCT field_id) as unique_fields,
                    COUNT(DISTINCT user_id) as unique_users
                FROM form_fill_corrections
                WHERE {where_clause}
            """),
            params
        )
        row = result.fetchone()

        return {
            "total_corrections": row.total_corrections if row else 0,
            "unique_fields": row.unique_fields if row else 0,
            "unique_users": row.unique_users if row else 0,
        }

    async def get_most_corrected_fields(
        self,
        institution_id: Optional[UUID] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Get fields that are most frequently corrected.

        Args:
            institution_id: Optional filter by institution
            limit: Maximum fields to return

        Returns:
            List of field correction stats
        """
        params = {"limit": limit}
        inst_filter = ""

        if institution_id:
            inst_filter = "WHERE institution_id = :institution_id"
            params["institution_id"] = str(institution_id)

        result = await self.db.execute(
            text(f"""
                SELECT
                    field_id,
                    field_label,
                    COUNT(*) as correction_count,
                    COUNT(DISTINCT user_id) as affected_users
                FROM form_fill_corrections
                {inst_filter}
                GROUP BY field_id, field_label
                ORDER BY correction_count DESC
                LIMIT :limit
            """),
            params
        )
        rows = result.fetchall()

        return [
            {
                "field_id": row.field_id,
                "field_label": row.field_label,
                "correction_count": row.correction_count,
                "affected_users": row.affected_users,
            }
            for row in rows
        ]


def get_learning_system(db: AsyncSession) -> LearningSystem:
    """Get a LearningSystem instance.

    Args:
        db: Async database session

    Returns:
        LearningSystem instance
    """
    return LearningSystem(db)
