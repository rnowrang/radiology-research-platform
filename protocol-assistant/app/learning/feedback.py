"""
Feedback collection and analysis for Protocol Assistant.

This module provides user feedback collection for AI outputs,
enabling continuous improvement through:
- Rating-based feedback
- Textual comments
- Structured corrections
- Aggregate analysis
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from uuid import UUID, uuid4
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel, Field
import logging

from app.models.learning import AIFeedback
from app.learning.prompt_management import PromptManager

logger = logging.getLogger(__name__)


class FeedbackRequest(BaseModel):
    """Request model for submitting feedback."""

    rating: int = Field(..., ge=1, le=5, description="Rating from 1 (poor) to 5 (excellent)")
    feedback_type: str = Field(
        ...,
        description="Type of feedback: accuracy, completeness, clarity, helpfulness, relevance"
    )
    comment: Optional[str] = Field(None, description="Optional text comment")
    corrections: Optional[dict] = Field(None, description="Structured corrections made by user")
    issue_category: Optional[str] = Field(
        None,
        description="Category of issue: factual_error, formatting, tone, missing_info, etc."
    )
    severity: Optional[str] = Field(
        None,
        description="Issue severity: low, medium, high, critical"
    )


class FeedbackSummary(BaseModel):
    """Aggregated feedback summary."""

    total_count: int
    avg_rating: float
    rating_distribution: dict[int, int]
    by_type: dict[str, float]
    by_category: dict[str, int]
    recent_comments: list[str]
    trend: Optional[str] = None  # improving, stable, declining


class FeedbackService:
    """
    Service for collecting and analyzing user feedback on AI outputs.

    This service:
    - Records individual feedback entries
    - Links feedback to prompt versions for A/B analysis
    - Provides aggregate summaries for reporting
    - Identifies common issues and patterns
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.prompt_manager = PromptManager(db)

    async def record_feedback(
        self,
        session_id: UUID,
        output_id: str,
        user_id: UUID,
        feedback: FeedbackRequest,
        institution_id: Optional[UUID] = None,
        prompt_version_id: Optional[int] = None,
        message_id: Optional[int] = None,
        document_id: Optional[UUID] = None,
        original_content: Optional[str] = None,
        corrected_content: Optional[str] = None,
    ) -> AIFeedback:
        """
        Record user feedback on AI output.

        Args:
            session_id: The chat session ID
            output_id: Reference to the specific output being rated
            user_id: ID of the user providing feedback
            feedback: The feedback data
            institution_id: Optional institution ID
            prompt_version_id: Optional ID of prompt version used
            message_id: Optional chat message ID
            document_id: Optional generated document ID
            original_content: Optional original AI output
            corrected_content: Optional user-corrected version

        Returns:
            The created AIFeedback record
        """
        fb = AIFeedback(
            id=uuid4(),
            session_id=session_id,
            output_id=output_id,
            user_id=user_id,
            institution_id=institution_id,
            rating=feedback.rating,
            feedback_type=feedback.feedback_type,
            comment=feedback.comment,
            corrections=feedback.corrections,
            issue_category=feedback.issue_category,
            severity=feedback.severity,
            prompt_version_id=prompt_version_id,
            message_id=message_id,
            document_id=document_id,
            original_content=original_content,
            corrected_content=corrected_content,
        )

        self.db.add(fb)
        await self.db.commit()
        await self.db.refresh(fb)

        logger.info(
            f"Recorded feedback from user {user_id}: rating={feedback.rating}, "
            f"type={feedback.feedback_type}"
        )

        # Update prompt metrics if version is tracked
        if prompt_version_id:
            await self.prompt_manager.update_metrics(
                prompt_version_id,
                success=feedback.rating >= 4,
                quality_score=feedback.rating / 5.0,
            )

        return fb

    async def get_feedback(self, feedback_id: UUID) -> Optional[AIFeedback]:
        """
        Get a specific feedback entry.

        Args:
            feedback_id: UUID of the feedback entry

        Returns:
            The AIFeedback or None if not found
        """
        return await self.db.get(AIFeedback, feedback_id)

    async def get_session_feedback(
        self,
        session_id: UUID,
    ) -> list[AIFeedback]:
        """
        Get all feedback for a session.

        Args:
            session_id: The chat session ID

        Returns:
            List of AIFeedback entries for the session
        """
        result = await self.db.execute(
            select(AIFeedback)
            .where(AIFeedback.session_id == session_id)
            .order_by(AIFeedback.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_feedback_summary(
        self,
        prompt_key: Optional[str] = None,
        prompt_version_id: Optional[int] = None,
        institution_id: Optional[UUID] = None,
        days: int = 30,
    ) -> FeedbackSummary:
        """
        Get aggregated feedback summary.

        Args:
            prompt_key: Optional filter by prompt key (requires version lookup)
            prompt_version_id: Optional filter by specific prompt version
            institution_id: Optional filter by institution
            days: Number of days to include in summary

        Returns:
            FeedbackSummary with aggregate metrics
        """
        since = datetime.utcnow() - timedelta(days=days)

        query = select(AIFeedback).where(AIFeedback.created_at >= since)

        if prompt_version_id:
            query = query.where(AIFeedback.prompt_version_id == prompt_version_id)

        if institution_id:
            query = query.where(AIFeedback.institution_id == institution_id)

        result = await self.db.execute(query)
        feedbacks = list(result.scalars().all())

        if not feedbacks:
            return FeedbackSummary(
                total_count=0,
                avg_rating=0,
                rating_distribution={1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
                by_type={},
                by_category={},
                recent_comments=[],
            )

        # Calculate metrics
        total = len(feedbacks)
        avg_rating = sum(f.rating for f in feedbacks if f.rating) / total

        # Rating distribution
        rating_dist = {i: 0 for i in range(1, 6)}
        for f in feedbacks:
            if f.rating:
                rating_dist[f.rating] += 1

        # Average by feedback type
        by_type: dict[str, list[int]] = {}
        for f in feedbacks:
            if f.feedback_type not in by_type:
                by_type[f.feedback_type] = []
            if f.rating:
                by_type[f.feedback_type].append(f.rating)

        type_averages = {
            ft: sum(ratings) / len(ratings)
            for ft, ratings in by_type.items()
            if ratings
        }

        # Count by issue category
        by_category: dict[str, int] = {}
        for f in feedbacks:
            if f.issue_category:
                by_category[f.issue_category] = by_category.get(f.issue_category, 0) + 1

        # Recent comments
        recent_comments = [
            f.comment
            for f in sorted(feedbacks, key=lambda x: x.created_at, reverse=True)[:10]
            if f.comment
        ]

        # Calculate trend
        trend = await self._calculate_trend(feedbacks, days)

        return FeedbackSummary(
            total_count=total,
            avg_rating=round(avg_rating, 2),
            rating_distribution=rating_dist,
            by_type=type_averages,
            by_category=by_category,
            recent_comments=recent_comments,
            trend=trend,
        )

    async def _calculate_trend(
        self,
        feedbacks: list[AIFeedback],
        days: int,
    ) -> Optional[str]:
        """
        Calculate rating trend over time.

        Compares first half to second half of the period.
        """
        if len(feedbacks) < 10:
            return None

        midpoint = datetime.utcnow() - timedelta(days=days // 2)

        first_half = [f.rating for f in feedbacks if f.created_at < midpoint and f.rating]
        second_half = [f.rating for f in feedbacks if f.created_at >= midpoint and f.rating]

        if not first_half or not second_half:
            return None

        first_avg = sum(first_half) / len(first_half)
        second_avg = sum(second_half) / len(second_half)

        diff = second_avg - first_avg

        if diff > 0.2:
            return "improving"
        elif diff < -0.2:
            return "declining"
        else:
            return "stable"

    async def get_low_rated_outputs(
        self,
        threshold: int = 2,
        institution_id: Optional[UUID] = None,
        days: int = 30,
        limit: int = 50,
    ) -> list[AIFeedback]:
        """
        Get outputs with low ratings for review.

        Args:
            threshold: Maximum rating to include
            institution_id: Optional filter by institution
            days: Number of days to include
            limit: Maximum results to return

        Returns:
            List of low-rated AIFeedback entries
        """
        since = datetime.utcnow() - timedelta(days=days)

        query = (
            select(AIFeedback)
            .where(
                AIFeedback.created_at >= since,
                AIFeedback.rating <= threshold,
            )
            .order_by(AIFeedback.created_at.desc())
            .limit(limit)
        )

        if institution_id:
            query = query.where(AIFeedback.institution_id == institution_id)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_corrections(
        self,
        prompt_version_id: Optional[int] = None,
        days: int = 30,
        limit: int = 100,
    ) -> list[AIFeedback]:
        """
        Get feedback entries with user corrections for learning.

        Args:
            prompt_version_id: Optional filter by prompt version
            days: Number of days to include
            limit: Maximum results to return

        Returns:
            List of AIFeedback entries with corrections
        """
        since = datetime.utcnow() - timedelta(days=days)

        query = (
            select(AIFeedback)
            .where(
                AIFeedback.created_at >= since,
                AIFeedback.corrections != None,
            )
            .order_by(AIFeedback.created_at.desc())
            .limit(limit)
        )

        if prompt_version_id:
            query = query.where(AIFeedback.prompt_version_id == prompt_version_id)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_common_issues(
        self,
        days: int = 30,
        min_occurrences: int = 3,
    ) -> list[dict]:
        """
        Identify common issue patterns from feedback.

        Args:
            days: Number of days to analyze
            min_occurrences: Minimum occurrences to include

        Returns:
            List of common issues with counts and examples
        """
        since = datetime.utcnow() - timedelta(days=days)

        result = await self.db.execute(
            select(AIFeedback)
            .where(
                AIFeedback.created_at >= since,
                AIFeedback.issue_category != None,
            )
        )
        feedbacks = result.scalars().all()

        # Group by category and severity
        issues: dict[tuple[str, str], list[AIFeedback]] = {}
        for f in feedbacks:
            key = (f.issue_category, f.severity or "unspecified")
            if key not in issues:
                issues[key] = []
            issues[key].append(f)

        # Filter and format
        common = []
        for (category, severity), entries in issues.items():
            if len(entries) >= min_occurrences:
                common.append({
                    "category": category,
                    "severity": severity,
                    "count": len(entries),
                    "avg_rating": sum(e.rating for e in entries if e.rating) / len(entries),
                    "example_comments": [
                        e.comment for e in entries[:3] if e.comment
                    ],
                })

        # Sort by count descending
        common.sort(key=lambda x: x["count"], reverse=True)

        return common
