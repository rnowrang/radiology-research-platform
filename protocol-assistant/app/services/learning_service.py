"""Learning Service for tracking user corrections and building learning profiles.

This service implements the user-level learning tier of the Research Intelligence
Platform. It tracks:
- User corrections to AI suggestions
- Explicit feedback on suggestions
- User patterns and preferences
- Fact provenance and history

The learning data is used to improve suggestion quality for individual users.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4
from enum import Enum

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class CorrectionSource(str, Enum):
    """Source of a correction."""
    FORM_FILL = "form_fill"
    QUESTIONNAIRE = "questionnaire"
    DOCUMENT_MODE = "document_mode"
    REVIEW_MODE = "review_mode"


class SuggestionFeedback(str, Enum):
    """Type of feedback on a suggestion."""
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    MODIFIED = "modified"
    IGNORED = "ignored"


class FactSource(str, Enum):
    """Source of a fact."""
    DOCUMENT_EXTRACTION = "document_extraction"
    WIZARD_ANSWER = "wizard_answer"
    USER_INPUT = "user_input"
    FORM_SYNC = "form_sync"
    AI_SUGGESTION = "ai_suggestion"


class LearningService:
    """Service for managing user learning and fact provenance.

    Provides functionality to:
    - Track and record user corrections
    - Record suggestion feedback
    - Manage fact provenance with full history
    - Build and update user learning profiles
    - Query learning data for improved suggestions
    """

    def __init__(self, db: AsyncSession):
        """Initialize the learning service.

        Args:
            db: Async database session
        """
        self.db = db

    # =========================================================================
    # User Learning Profile
    # =========================================================================

    async def get_or_create_profile(self, user_id: UUID) -> Dict[str, Any]:
        """Get or create a user learning profile.

        Args:
            user_id: User UUID

        Returns:
            User learning profile dict
        """
        result = await self.db.execute(
            text("""
                SELECT id, user_id, patterns, common_values, preferences,
                       total_corrections, total_accepted_suggestions,
                       created_at, updated_at
                FROM user_learning_profiles
                WHERE user_id = :user_id
            """),
            {"user_id": str(user_id)}
        )
        row = result.fetchone()

        if row:
            return {
                "id": row.id,
                "user_id": row.user_id,
                "patterns": row.patterns or {},
                "common_values": row.common_values or {},
                "preferences": row.preferences or {},
                "total_corrections": row.total_corrections,
                "total_accepted_suggestions": row.total_accepted_suggestions,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            }

        # Create new profile
        profile_id = uuid4()
        await self.db.execute(
            text("""
                INSERT INTO user_learning_profiles
                    (id, user_id, patterns, common_values, preferences)
                VALUES
                    (:id, :user_id, :patterns, :common_values, :preferences)
            """),
            {
                "id": str(profile_id),
                "user_id": str(user_id),
                "patterns": "{}",
                "common_values": "{}",
                "preferences": "{}",
            }
        )
        await self.db.commit()

        return {
            "id": profile_id,
            "user_id": user_id,
            "patterns": {},
            "common_values": {},
            "preferences": {},
            "total_corrections": 0,
            "total_accepted_suggestions": 0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }

    async def update_profile_patterns(
        self,
        user_id: UUID,
        patterns: Dict[str, Any],
        merge: bool = True
    ) -> Dict[str, Any]:
        """Update user learning patterns.

        Args:
            user_id: User UUID
            patterns: Patterns to update
            merge: If True, merge with existing; if False, replace

        Returns:
            Updated patterns
        """
        profile = await self.get_or_create_profile(user_id)

        if merge:
            current = profile.get("patterns", {})
            current.update(patterns)
            patterns = current

        await self.db.execute(
            text("""
                UPDATE user_learning_profiles
                SET patterns = :patterns,
                    updated_at = NOW()
                WHERE user_id = :user_id
            """),
            {"user_id": str(user_id), "patterns": _to_json(patterns)}
        )
        await self.db.commit()

        return patterns

    async def add_common_value(
        self,
        user_id: UUID,
        field_key: str,
        value: str
    ) -> None:
        """Record a commonly used value for a field.

        Args:
            user_id: User UUID
            field_key: The field key
            value: The value used
        """
        profile = await self.get_or_create_profile(user_id)
        common_values = profile.get("common_values", {})

        if field_key not in common_values:
            common_values[field_key] = {"values": {}, "count": 0}

        field_data = common_values[field_key]
        field_data["count"] += 1

        if value in field_data["values"]:
            field_data["values"][value] += 1
        else:
            field_data["values"][value] = 1

        # Keep only top 10 values per field
        if len(field_data["values"]) > 10:
            sorted_values = sorted(
                field_data["values"].items(),
                key=lambda x: x[1],
                reverse=True
            )[:10]
            field_data["values"] = dict(sorted_values)

        await self.db.execute(
            text("""
                UPDATE user_learning_profiles
                SET common_values = :common_values,
                    updated_at = NOW()
                WHERE user_id = :user_id
            """),
            {"user_id": str(user_id), "common_values": _to_json(common_values)}
        )
        await self.db.commit()

    async def get_common_values(
        self,
        user_id: UUID,
        field_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get commonly used values for a user.

        Args:
            user_id: User UUID
            field_key: Optional specific field to get

        Returns:
            Dict of field_key -> {values: {value: count}, count: total}
        """
        profile = await self.get_or_create_profile(user_id)
        common_values = profile.get("common_values", {})

        if field_key:
            return common_values.get(field_key, {"values": {}, "count": 0})

        return common_values

    # =========================================================================
    # User Corrections
    # =========================================================================

    async def record_correction(
        self,
        user_id: UUID,
        field_key: str,
        original_value: Optional[str],
        corrected_value: str,
        project_id: Optional[UUID] = None,
        form_field_id: Optional[str] = None,
        source: CorrectionSource = CorrectionSource.FORM_FILL,
        suggestion_confidence: Optional[float] = None,
        suggestion_source: Optional[str] = None
    ) -> UUID:
        """Record a user correction to an AI suggestion or value.

        Args:
            user_id: User UUID
            field_key: The field that was corrected
            original_value: Original value (AI suggestion)
            corrected_value: Value after correction
            project_id: Optional project UUID
            form_field_id: Optional form field ID
            source: Source of the correction
            suggestion_confidence: Confidence of original suggestion
            suggestion_source: Source of original suggestion

        Returns:
            UUID of the correction record
        """
        correction_id = uuid4()

        await self.db.execute(
            text("""
                INSERT INTO user_corrections
                    (id, user_id, project_id, field_key, form_field_id,
                     original_value, corrected_value, correction_source,
                     suggestion_confidence, suggestion_source)
                VALUES
                    (:id, :user_id, :project_id, :field_key, :form_field_id,
                     :original_value, :corrected_value, :correction_source,
                     :suggestion_confidence, :suggestion_source)
            """),
            {
                "id": str(correction_id),
                "user_id": str(user_id),
                "project_id": str(project_id) if project_id else None,
                "field_key": field_key,
                "form_field_id": form_field_id,
                "original_value": original_value,
                "corrected_value": corrected_value,
                "correction_source": source.value,
                "suggestion_confidence": suggestion_confidence,
                "suggestion_source": suggestion_source,
            }
        )

        # Update profile correction count
        await self.db.execute(
            text("""
                UPDATE user_learning_profiles
                SET total_corrections = total_corrections + 1,
                    updated_at = NOW()
                WHERE user_id = :user_id
            """),
            {"user_id": str(user_id)}
        )

        await self.db.commit()

        # Also record the corrected value as a common value
        await self.add_common_value(user_id, field_key, corrected_value)

        return correction_id

    async def get_corrections(
        self,
        user_id: UUID,
        field_key: Optional[str] = None,
        project_id: Optional[UUID] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get user corrections.

        Args:
            user_id: User UUID
            field_key: Optional filter by field key
            project_id: Optional filter by project
            limit: Maximum number of corrections to return

        Returns:
            List of correction records
        """
        query = """
            SELECT id, user_id, project_id, field_key, form_field_id,
                   original_value, corrected_value, correction_source,
                   suggestion_confidence, suggestion_source,
                   applied_to_learning, created_at
            FROM user_corrections
            WHERE user_id = :user_id
        """
        params = {"user_id": str(user_id), "limit": limit}

        if field_key:
            query += " AND field_key = :field_key"
            params["field_key"] = field_key

        if project_id:
            query += " AND project_id = :project_id"
            params["project_id"] = str(project_id)

        query += " ORDER BY created_at DESC LIMIT :limit"

        result = await self.db.execute(text(query), params)
        rows = result.fetchall()

        return [
            {
                "id": row.id,
                "user_id": row.user_id,
                "project_id": row.project_id,
                "field_key": row.field_key,
                "form_field_id": row.form_field_id,
                "original_value": row.original_value,
                "corrected_value": row.corrected_value,
                "correction_source": row.correction_source,
                "suggestion_confidence": float(row.suggestion_confidence) if row.suggestion_confidence else None,
                "suggestion_source": row.suggestion_source,
                "applied_to_learning": row.applied_to_learning,
                "created_at": row.created_at,
            }
            for row in rows
        ]

    async def get_correction_patterns(
        self,
        user_id: UUID,
        field_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Analyze correction patterns for a user.

        Args:
            user_id: User UUID
            field_key: Optional specific field to analyze

        Returns:
            Dict with correction patterns and statistics
        """
        query = """
            SELECT field_key, COUNT(*) as correction_count,
                   AVG(suggestion_confidence) as avg_original_confidence
            FROM user_corrections
            WHERE user_id = :user_id
        """
        params = {"user_id": str(user_id)}

        if field_key:
            query += " AND field_key = :field_key"
            params["field_key"] = field_key

        query += " GROUP BY field_key ORDER BY correction_count DESC"

        result = await self.db.execute(text(query), params)
        rows = result.fetchall()

        patterns = {}
        for row in rows:
            patterns[row.field_key] = {
                "correction_count": row.correction_count,
                "avg_original_confidence": float(row.avg_original_confidence) if row.avg_original_confidence else None,
            }

        return patterns

    # =========================================================================
    # Suggestion Feedback
    # =========================================================================

    async def record_feedback(
        self,
        user_id: UUID,
        suggestion_type: str,
        feedback: SuggestionFeedback,
        field_key: Optional[str] = None,
        suggested_value: Optional[str] = None,
        final_value: Optional[str] = None,
        project_id: Optional[UUID] = None,
        suggestion_confidence: Optional[float] = None,
        suggestion_source: Optional[str] = None
    ) -> UUID:
        """Record feedback on an AI suggestion.

        Args:
            user_id: User UUID
            suggestion_type: Type of suggestion
            feedback: Feedback type
            field_key: Optional field key
            suggested_value: The suggested value
            final_value: Final value used
            project_id: Optional project UUID
            suggestion_confidence: Confidence of suggestion
            suggestion_source: Source of suggestion

        Returns:
            UUID of the feedback record
        """
        feedback_id = uuid4()

        await self.db.execute(
            text("""
                INSERT INTO suggestion_feedback
                    (id, user_id, project_id, suggestion_type, field_key,
                     suggested_value, feedback, final_value,
                     suggestion_confidence, suggestion_source)
                VALUES
                    (:id, :user_id, :project_id, :suggestion_type, :field_key,
                     :suggested_value, :feedback, :final_value,
                     :suggestion_confidence, :suggestion_source)
            """),
            {
                "id": str(feedback_id),
                "user_id": str(user_id),
                "project_id": str(project_id) if project_id else None,
                "suggestion_type": suggestion_type,
                "field_key": field_key,
                "suggested_value": suggested_value,
                "feedback": feedback.value,
                "final_value": final_value,
                "suggestion_confidence": suggestion_confidence,
                "suggestion_source": suggestion_source,
            }
        )

        # Update profile stats if accepted
        if feedback == SuggestionFeedback.ACCEPTED:
            await self.db.execute(
                text("""
                    UPDATE user_learning_profiles
                    SET total_accepted_suggestions = total_accepted_suggestions + 1,
                        updated_at = NOW()
                    WHERE user_id = :user_id
                """),
                {"user_id": str(user_id)}
            )

        await self.db.commit()

        return feedback_id

    async def get_feedback_stats(
        self,
        user_id: UUID,
        suggestion_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get feedback statistics for a user.

        Args:
            user_id: User UUID
            suggestion_type: Optional filter by suggestion type

        Returns:
            Dict with feedback statistics
        """
        query = """
            SELECT feedback, COUNT(*) as count
            FROM suggestion_feedback
            WHERE user_id = :user_id
        """
        params = {"user_id": str(user_id)}

        if suggestion_type:
            query += " AND suggestion_type = :suggestion_type"
            params["suggestion_type"] = suggestion_type

        query += " GROUP BY feedback"

        result = await self.db.execute(text(query), params)
        rows = result.fetchall()

        stats = {
            "accepted": 0,
            "rejected": 0,
            "modified": 0,
            "ignored": 0,
            "total": 0,
            "acceptance_rate": 0.0,
        }

        for row in rows:
            stats[row.feedback] = row.count
            stats["total"] += row.count

        if stats["total"] > 0:
            stats["acceptance_rate"] = stats["accepted"] / stats["total"]

        return stats

    # =========================================================================
    # Fact Provenance
    # =========================================================================

    async def create_or_update_provenance(
        self,
        project_id: UUID,
        fact_key: str,
        value: str,
        source: FactSource,
        confidence: float = 1.0,
        source_document_id: Optional[UUID] = None,
        source_reference: Optional[str] = None,
        changed_by_user_id: Optional[UUID] = None,
        change_reason: Optional[str] = None
    ) -> UUID:
        """Create or update fact provenance.

        Args:
            project_id: Project UUID
            fact_key: The fact key
            value: Current value
            source: Source of the fact
            confidence: Confidence score
            source_document_id: Optional source document
            source_reference: Optional reference string
            changed_by_user_id: User who made the change
            change_reason: Reason for change

        Returns:
            UUID of the provenance record
        """
        # Check if provenance exists
        result = await self.db.execute(
            text("""
                SELECT id, current_value, version
                FROM fact_provenance
                WHERE project_id = :project_id AND fact_key = :fact_key
            """),
            {"project_id": str(project_id), "fact_key": fact_key}
        )
        existing = result.fetchone()

        if existing:
            # Update existing
            new_version = existing.version + 1
            await self.db.execute(
                text("""
                    UPDATE fact_provenance
                    SET current_value = :value,
                        primary_source = :source,
                        source_document_id = :source_document_id,
                        source_reference = :source_reference,
                        confidence = :confidence,
                        version = :version,
                        previous_value = :previous_value,
                        changed_by_user_id = :changed_by_user_id,
                        change_reason = :change_reason
                    WHERE id = :id
                """),
                {
                    "id": existing.id,
                    "value": value,
                    "source": source.value,
                    "source_document_id": str(source_document_id) if source_document_id else None,
                    "source_reference": source_reference,
                    "confidence": confidence,
                    "version": new_version,
                    "previous_value": existing.current_value,
                    "changed_by_user_id": str(changed_by_user_id) if changed_by_user_id else None,
                    "change_reason": change_reason,
                }
            )
            await self.db.commit()
            return UUID(existing.id)
        else:
            # Create new
            provenance_id = uuid4()
            await self.db.execute(
                text("""
                    INSERT INTO fact_provenance
                        (id, project_id, fact_key, current_value, primary_source,
                         source_document_id, source_reference, confidence,
                         changed_by_user_id, change_reason)
                    VALUES
                        (:id, :project_id, :fact_key, :value, :source,
                         :source_document_id, :source_reference, :confidence,
                         :changed_by_user_id, :change_reason)
                """),
                {
                    "id": str(provenance_id),
                    "project_id": str(project_id),
                    "fact_key": fact_key,
                    "value": value,
                    "source": source.value,
                    "source_document_id": str(source_document_id) if source_document_id else None,
                    "source_reference": source_reference,
                    "confidence": confidence,
                    "changed_by_user_id": str(changed_by_user_id) if changed_by_user_id else None,
                    "change_reason": change_reason,
                }
            )

            # Also insert initial history record
            await self.db.execute(
                text("""
                    INSERT INTO fact_history
                        (provenance_id, project_id, fact_key, version,
                         value, source, confidence, changed_by_user_id, change_reason)
                    VALUES
                        (:provenance_id, :project_id, :fact_key, 1,
                         :value, :source, :confidence, :changed_by_user_id, :change_reason)
                """),
                {
                    "provenance_id": str(provenance_id),
                    "project_id": str(project_id),
                    "fact_key": fact_key,
                    "value": value,
                    "source": source.value,
                    "confidence": confidence,
                    "changed_by_user_id": str(changed_by_user_id) if changed_by_user_id else None,
                    "change_reason": change_reason,
                }
            )

            await self.db.commit()
            return provenance_id

    async def get_provenance(
        self,
        project_id: UUID,
        fact_key: str
    ) -> Optional[Dict[str, Any]]:
        """Get provenance for a fact.

        Args:
            project_id: Project UUID
            fact_key: The fact key

        Returns:
            Provenance record or None
        """
        result = await self.db.execute(
            text("""
                SELECT id, project_id, fact_key, current_value, primary_source,
                       source_document_id, source_reference, confidence,
                       verified_by_user, verified_at, referenced_by,
                       version, previous_value, changed_by_user_id, change_reason,
                       created_at, updated_at
                FROM fact_provenance
                WHERE project_id = :project_id AND fact_key = :fact_key
            """),
            {"project_id": str(project_id), "fact_key": fact_key}
        )
        row = result.fetchone()

        if not row:
            return None

        return {
            "id": row.id,
            "project_id": row.project_id,
            "fact_key": row.fact_key,
            "current_value": row.current_value,
            "primary_source": row.primary_source,
            "source_document_id": row.source_document_id,
            "source_reference": row.source_reference,
            "confidence": float(row.confidence),
            "verified_by_user": row.verified_by_user,
            "verified_at": row.verified_at,
            "referenced_by": row.referenced_by or [],
            "version": row.version,
            "previous_value": row.previous_value,
            "changed_by_user_id": row.changed_by_user_id,
            "change_reason": row.change_reason,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    async def get_fact_history(
        self,
        project_id: UUID,
        fact_key: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get history of a fact.

        Args:
            project_id: Project UUID
            fact_key: The fact key
            limit: Maximum history entries

        Returns:
            List of history records
        """
        result = await self.db.execute(
            text("""
                SELECT id, provenance_id, project_id, fact_key, version,
                       value, source, confidence, changed_by_user_id,
                       change_reason, created_at
                FROM fact_history
                WHERE project_id = :project_id AND fact_key = :fact_key
                ORDER BY version DESC
                LIMIT :limit
            """),
            {"project_id": str(project_id), "fact_key": fact_key, "limit": limit}
        )
        rows = result.fetchall()

        return [
            {
                "id": row.id,
                "provenance_id": row.provenance_id,
                "project_id": row.project_id,
                "fact_key": row.fact_key,
                "version": row.version,
                "value": row.value,
                "source": row.source,
                "confidence": float(row.confidence) if row.confidence else None,
                "changed_by_user_id": row.changed_by_user_id,
                "change_reason": row.change_reason,
                "created_at": row.created_at,
            }
            for row in rows
        ]

    async def add_reference(
        self,
        project_id: UUID,
        fact_key: str,
        reference_type: str,
        reference_id: str,
        field: Optional[str] = None
    ) -> None:
        """Add a reference to a fact (e.g., a form field that uses this fact).

        Args:
            project_id: Project UUID
            fact_key: The fact key
            reference_type: Type of reference (form, document, etc.)
            reference_id: ID of the referencing entity
            field: Optional field name within the entity
        """
        provenance = await self.get_provenance(project_id, fact_key)
        if not provenance:
            return

        referenced_by = provenance.get("referenced_by", [])
        reference = {
            "type": reference_type,
            "id": reference_id,
            "field": field,
        }

        # Don't add duplicates
        if reference not in referenced_by:
            referenced_by.append(reference)

            await self.db.execute(
                text("""
                    UPDATE fact_provenance
                    SET referenced_by = :referenced_by
                    WHERE project_id = :project_id AND fact_key = :fact_key
                """),
                {
                    "project_id": str(project_id),
                    "fact_key": fact_key,
                    "referenced_by": _to_json(referenced_by),
                }
            )
            await self.db.commit()

    async def verify_fact(
        self,
        project_id: UUID,
        fact_key: str,
        user_id: UUID
    ) -> None:
        """Mark a fact as verified by a user.

        Args:
            project_id: Project UUID
            fact_key: The fact key
            user_id: User who verified
        """
        await self.db.execute(
            text("""
                UPDATE fact_provenance
                SET verified_by_user = TRUE,
                    verified_at = NOW()
                WHERE project_id = :project_id AND fact_key = :fact_key
            """),
            {"project_id": str(project_id), "fact_key": fact_key}
        )
        await self.db.commit()

    # =========================================================================
    # Learning Context for Suggestions
    # =========================================================================

    async def get_learning_context(
        self,
        user_id: UUID,
        field_key: str
    ) -> Dict[str, Any]:
        """Get learning context for improving suggestions.

        Combines user patterns, common values, and correction history
        to provide context for generating better suggestions.

        Args:
            user_id: User UUID
            field_key: The field to get context for

        Returns:
            Dict with learning context
        """
        profile = await self.get_or_create_profile(user_id)
        common_values = await self.get_common_values(user_id, field_key)
        corrections = await self.get_corrections(user_id, field_key=field_key, limit=10)

        # Get most common corrected values
        corrected_values = {}
        for correction in corrections:
            val = correction.get("corrected_value")
            if val:
                corrected_values[val] = corrected_values.get(val, 0) + 1

        return {
            "user_patterns": profile.get("patterns", {}).get(field_key, {}),
            "user_preferences": profile.get("preferences", {}),
            "common_values": common_values.get("values", {}),
            "recent_corrections": corrected_values,
            "correction_count": len(corrections),
            "acceptance_rate": (
                profile.get("total_accepted_suggestions", 0) /
                max(profile.get("total_corrections", 0) + profile.get("total_accepted_suggestions", 0), 1)
            ),
        }


def _to_json(data: Any) -> str:
    """Convert data to JSON string for database storage."""
    import json
    from datetime import datetime, date
    from decimal import Decimal
    from uuid import UUID

    def serializer(obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, UUID):
            return str(obj)
        if hasattr(obj, "value"):  # Enum
            return obj.value
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    return json.dumps(data, default=serializer)


def get_learning_service(db: AsyncSession) -> LearningService:
    """Get a LearningService instance.

    Args:
        db: Async database session

    Returns:
        LearningService instance
    """
    return LearningService(db)
