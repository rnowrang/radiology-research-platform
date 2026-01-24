"""
Usage analytics service for Protocol Assistant.

This module provides comprehensive analytics including:
- Usage metrics (sessions, documents, generations)
- Cost tracking and projections
- Quality metrics aggregation
- Performance monitoring
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from uuid import UUID, uuid4
from datetime import datetime, timedelta, date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field
import logging

from app.models.analytics import UsageAnalytics, UserActivity, FeatureUsageMetric
from app.models.learning import AIFeedback

logger = logging.getLogger(__name__)


class UsageSummary(BaseModel):
    """Usage metrics summary."""

    total_sessions: int
    total_documents_analyzed: int
    total_documents_generated: int
    total_form_prefills: int
    total_tokens_used: int
    active_users: int
    avg_session_duration: int = Field(..., description="Average duration in seconds")
    completion_rate: float = Field(..., description="Session completion rate (0-1)")


class QualityMetrics(BaseModel):
    """AI output quality metrics."""

    avg_extraction_accuracy: float
    avg_user_rating: float
    correction_rate: float = Field(..., description="Rate of user corrections")
    retry_rate: float = Field(..., description="Rate of retried operations")
    fallback_rate: float = Field(..., description="Rate of LLM fallbacks")


class CostAnalysis(BaseModel):
    """Cost breakdown and projections."""

    total_cost: float
    cost_by_provider: dict[str, float]
    cost_by_task: dict[str, float]
    cost_per_session: float
    projected_monthly_cost: float


class DailyTrend(BaseModel):
    """Daily metrics for trend analysis."""

    date: date
    sessions: int
    documents: int
    tokens: int
    cost: float
    avg_rating: Optional[float] = None


class AnalyticsService:
    """
    Service for tracking and reporting usage analytics.

    This service provides:
    - Usage summary aggregation
    - Cost tracking and projections
    - Quality metrics calculation
    - Trend analysis
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_usage_summary(
        self,
        institution_id: UUID,
        start_date: date,
        end_date: date,
    ) -> UsageSummary:
        """
        Get usage summary for an institution.

        Aggregates daily analytics records for the specified period.

        Args:
            institution_id: Institution UUID
            start_date: Start of period
            end_date: End of period

        Returns:
            UsageSummary with aggregate metrics
        """
        result = await self.db.execute(
            select(
                func.sum(UsageAnalytics.session_count),
                func.sum(UsageAnalytics.document_count),
                func.sum(UsageAnalytics.generation_count),
                func.sum(UsageAnalytics.prefill_count),
                func.sum(UsageAnalytics.token_count),
                func.sum(UsageAnalytics.active_user_count),
                func.avg(UsageAnalytics.avg_session_duration_seconds),
                func.avg(UsageAnalytics.completion_rate),
            )
            .where(
                UsageAnalytics.institution_id == institution_id,
                UsageAnalytics.date >= start_date,
                UsageAnalytics.date <= end_date,
            )
        )
        row = result.one()

        return UsageSummary(
            total_sessions=row[0] or 0,
            total_documents_analyzed=row[1] or 0,
            total_documents_generated=row[2] or 0,
            total_form_prefills=row[3] or 0,
            total_tokens_used=row[4] or 0,
            active_users=row[5] or 0,
            avg_session_duration=int(row[6] or 0),
            completion_rate=float(row[7] or 0),
        )

    async def get_quality_metrics(
        self,
        institution_id: UUID,
        start_date: date,
        end_date: date,
    ) -> QualityMetrics:
        """
        Get quality metrics for AI outputs.

        Args:
            institution_id: Institution UUID
            start_date: Start of period
            end_date: End of period

        Returns:
            QualityMetrics with accuracy and satisfaction data
        """
        # Get feedback ratings
        feedback_result = await self.db.execute(
            select(
                func.avg(AIFeedback.rating),
                func.count(AIFeedback.id),
                func.count(AIFeedback.corrections),  # Count entries with corrections
            )
            .where(
                AIFeedback.institution_id == institution_id,
                AIFeedback.created_at >= datetime.combine(start_date, datetime.min.time()),
                AIFeedback.created_at <= datetime.combine(end_date, datetime.max.time()),
            )
        )
        fb_row = feedback_result.one()

        avg_rating = float(fb_row[0] or 0)
        total_feedback = fb_row[1] or 0
        corrections_count = fb_row[2] or 0

        correction_rate = corrections_count / total_feedback if total_feedback > 0 else 0

        # Get usage analytics for retry/fallback rates
        usage_result = await self.db.execute(
            select(UsageAnalytics)
            .where(
                UsageAnalytics.institution_id == institution_id,
                UsageAnalytics.date >= start_date,
                UsageAnalytics.date <= end_date,
            )
        )
        usage_records = usage_result.scalars().all()

        # Calculate rates from error tracking
        total_errors = sum(r.error_count for r in usage_records)
        total_sessions = sum(r.session_count for r in usage_records)

        retry_rate = 0.0
        fallback_rate = 0.0

        if usage_records:
            for record in usage_records:
                errors_by_type = record.errors_by_type or {}
                if "retry" in errors_by_type and total_sessions > 0:
                    retry_rate += errors_by_type["retry"] / total_sessions
                if "fallback" in errors_by_type and total_sessions > 0:
                    fallback_rate += errors_by_type["fallback"] / total_sessions

        return QualityMetrics(
            avg_extraction_accuracy=0.0,  # Would need specific tracking
            avg_user_rating=avg_rating,
            correction_rate=correction_rate,
            retry_rate=retry_rate,
            fallback_rate=fallback_rate,
        )

    async def get_cost_analysis(
        self,
        institution_id: UUID,
        start_date: date,
        end_date: date,
    ) -> CostAnalysis:
        """
        Get cost breakdown for AI usage.

        Aggregates costs by provider and projects future costs.

        Args:
            institution_id: Institution UUID
            start_date: Start of period
            end_date: End of period

        Returns:
            CostAnalysis with breakdown and projections
        """
        result = await self.db.execute(
            select(
                func.sum(UsageAnalytics.cost_claude),
                func.sum(UsageAnalytics.cost_openai),
                func.sum(UsageAnalytics.session_count),
            )
            .where(
                UsageAnalytics.institution_id == institution_id,
                UsageAnalytics.date >= start_date,
                UsageAnalytics.date <= end_date,
            )
        )
        row = result.one()

        claude_cost = float(row[0] or 0)
        openai_cost = float(row[1] or 0)
        total_sessions = row[2] or 1

        total_cost = claude_cost + openai_cost

        # Project monthly cost based on daily average
        days = (end_date - start_date).days + 1
        daily_avg = total_cost / days if days > 0 else 0
        projected = daily_avg * 30

        # Get cost by task type from feature usage
        cost_by_task = await self._get_cost_by_task(
            institution_id, start_date, end_date
        )

        return CostAnalysis(
            total_cost=round(total_cost, 4),
            cost_by_provider={
                "claude": round(claude_cost, 4),
                "openai": round(openai_cost, 4),
            },
            cost_by_task=cost_by_task,
            cost_per_session=round(
                total_cost / total_sessions if total_sessions > 0 else 0, 4
            ),
            projected_monthly_cost=round(projected, 2),
        )

    async def _get_cost_by_task(
        self,
        institution_id: UUID,
        start_date: date,
        end_date: date,
    ) -> dict[str, float]:
        """Get cost breakdown by task/feature type."""
        result = await self.db.execute(
            select(UsageAnalytics.feature_usage)
            .where(
                UsageAnalytics.institution_id == institution_id,
                UsageAnalytics.date >= start_date,
                UsageAnalytics.date <= end_date,
            )
        )

        # Aggregate feature usage
        totals: dict[str, int] = {}
        for row in result.all():
            usage = row[0] or {}
            for feature, count in usage.items():
                totals[feature] = totals.get(feature, 0) + count

        # Calculate proportional costs (simplified)
        total_usage = sum(totals.values())
        if total_usage == 0:
            return {}

        # Get total cost
        cost_result = await self.db.execute(
            select(func.sum(UsageAnalytics.cost_total))
            .where(
                UsageAnalytics.institution_id == institution_id,
                UsageAnalytics.date >= start_date,
                UsageAnalytics.date <= end_date,
            )
        )
        total_cost = float(cost_result.scalar_one_or_none() or 0)

        return {
            feature: round(total_cost * (count / total_usage), 4)
            for feature, count in totals.items()
        }

    async def get_daily_trends(
        self,
        institution_id: UUID,
        start_date: date,
        end_date: date,
    ) -> list[DailyTrend]:
        """
        Get daily trends for visualization.

        Args:
            institution_id: Institution UUID
            start_date: Start of period
            end_date: End of period

        Returns:
            List of DailyTrend records
        """
        result = await self.db.execute(
            select(UsageAnalytics)
            .where(
                UsageAnalytics.institution_id == institution_id,
                UsageAnalytics.date >= start_date,
                UsageAnalytics.date <= end_date,
            )
            .order_by(UsageAnalytics.date)
        )

        records = result.scalars().all()

        return [
            DailyTrend(
                date=r.date,
                sessions=r.session_count,
                documents=r.document_count,
                tokens=r.token_count,
                cost=float(r.cost_total or 0),
                avg_rating=None,  # Would need to join with feedback
            )
            for r in records
        ]

    async def record_daily_analytics(
        self,
        institution_id: UUID,
        analytics_date: date,
        session_count: int = 0,
        document_count: int = 0,
        generation_count: int = 0,
        prefill_count: int = 0,
        token_count: int = 0,
        active_user_count: int = 0,
        avg_session_duration: int = 0,
        completion_rate: float = 0,
        cost_claude: float = 0,
        cost_openai: float = 0,
        feature_usage: Optional[dict] = None,
        errors_by_type: Optional[dict] = None,
    ) -> UsageAnalytics:
        """
        Record daily analytics for an institution.

        Creates or updates the daily record.

        Args:
            institution_id: Institution UUID
            analytics_date: The date for this record
            Other args are metric values to record

        Returns:
            The UsageAnalytics record
        """
        # Check if exists
        result = await self.db.execute(
            select(UsageAnalytics)
            .where(
                UsageAnalytics.institution_id == institution_id,
                UsageAnalytics.date == analytics_date,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update existing record
            existing.session_count = session_count
            existing.document_count = document_count
            existing.generation_count = generation_count
            existing.prefill_count = prefill_count
            existing.token_count = token_count
            existing.active_user_count = active_user_count
            existing.avg_session_duration_seconds = avg_session_duration
            existing.completion_rate = Decimal(str(completion_rate))
            existing.cost_claude = Decimal(str(cost_claude))
            existing.cost_openai = Decimal(str(cost_openai))
            existing.cost_total = Decimal(str(cost_claude + cost_openai))
            if feature_usage is not None:
                existing.feature_usage = feature_usage
            if errors_by_type is not None:
                existing.errors_by_type = errors_by_type

            await self.db.commit()
            await self.db.refresh(existing)

            logger.debug(
                f"Updated analytics for institution {institution_id} on {analytics_date}"
            )
            return existing
        else:
            # Create new record
            analytics = UsageAnalytics(
                id=uuid4(),
                institution_id=institution_id,
                date=analytics_date,
                session_count=session_count,
                document_count=document_count,
                generation_count=generation_count,
                prefill_count=prefill_count,
                token_count=token_count,
                active_user_count=active_user_count,
                avg_session_duration_seconds=avg_session_duration,
                completion_rate=Decimal(str(completion_rate)),
                cost_claude=Decimal(str(cost_claude)),
                cost_openai=Decimal(str(cost_openai)),
                cost_total=Decimal(str(cost_claude + cost_openai)),
                feature_usage=feature_usage or {},
                errors_by_type=errors_by_type or {},
            )
            self.db.add(analytics)
            await self.db.commit()
            await self.db.refresh(analytics)

            logger.debug(
                f"Created analytics for institution {institution_id} on {analytics_date}"
            )
            return analytics

    async def record_activity(
        self,
        user_id: UUID,
        activity_type: str,
        institution_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
        activity_detail: Optional[str] = None,
        metadata: Optional[dict] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        duration_ms: Optional[int] = None,
        success: bool = True,
    ) -> UserActivity:
        """
        Record individual user activity.

        Args:
            user_id: User UUID
            activity_type: Type of activity (e.g., "session_start", "document_upload")
            Other args are optional context

        Returns:
            The UserActivity record
        """
        activity = UserActivity(
            id=uuid4(),
            user_id=user_id,
            institution_id=institution_id,
            session_id=session_id,
            activity_type=activity_type,
            activity_detail=activity_detail,
            metadata=metadata,
            resource_type=resource_type,
            resource_id=resource_id,
            duration_ms=duration_ms,
            success=success,
        )

        self.db.add(activity)
        await self.db.commit()
        await self.db.refresh(activity)

        return activity

    async def get_user_activity(
        self,
        user_id: UUID,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        activity_type: Optional[str] = None,
        limit: int = 100,
    ) -> list[UserActivity]:
        """
        Get user activity history.

        Args:
            user_id: User UUID
            start_date: Optional start filter
            end_date: Optional end filter
            activity_type: Optional type filter
            limit: Maximum records to return

        Returns:
            List of UserActivity records
        """
        query = (
            select(UserActivity)
            .where(UserActivity.user_id == user_id)
            .order_by(UserActivity.created_at.desc())
            .limit(limit)
        )

        if start_date:
            query = query.where(
                UserActivity.created_at >= datetime.combine(start_date, datetime.min.time())
            )

        if end_date:
            query = query.where(
                UserActivity.created_at <= datetime.combine(end_date, datetime.max.time())
            )

        if activity_type:
            query = query.where(UserActivity.activity_type == activity_type)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def record_feature_usage(
        self,
        feature_name: str,
        institution_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        success: bool = True,
        latency_ms: Optional[int] = None,
        tokens: int = 0,
    ) -> FeatureUsageMetric:
        """
        Record feature usage metric.

        Args:
            feature_name: Name of the feature
            institution_id: Optional institution
            user_id: Optional user
            success: Whether operation succeeded
            latency_ms: Operation latency
            tokens: Tokens used

        Returns:
            FeatureUsageMetric record
        """
        now = datetime.utcnow()
        period_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        period_end = period_start + timedelta(days=1)

        # Check for existing record for this period
        result = await self.db.execute(
            select(FeatureUsageMetric)
            .where(
                FeatureUsageMetric.feature_name == feature_name,
                FeatureUsageMetric.institution_id == institution_id,
                FeatureUsageMetric.period_start == period_start,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.invocation_count += 1
            if success:
                existing.success_count += 1
            else:
                existing.error_count += 1
            existing.total_tokens += tokens
            if latency_ms:
                # Running average
                if existing.avg_latency_ms:
                    existing.avg_latency_ms = (
                        existing.avg_latency_ms * (existing.invocation_count - 1) + latency_ms
                    ) // existing.invocation_count
                else:
                    existing.avg_latency_ms = latency_ms

            await self.db.commit()
            await self.db.refresh(existing)
            return existing
        else:
            metric = FeatureUsageMetric(
                id=uuid4(),
                institution_id=institution_id,
                user_id=user_id,
                feature_name=feature_name,
                invocation_count=1,
                success_count=1 if success else 0,
                error_count=0 if success else 1,
                avg_latency_ms=latency_ms,
                total_tokens=tokens,
                period_start=period_start,
                period_end=period_end,
            )
            self.db.add(metric)
            await self.db.commit()
            await self.db.refresh(metric)
            return metric

    async def get_top_features(
        self,
        institution_id: Optional[UUID] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 10,
    ) -> list[dict]:
        """
        Get top features by usage.

        Args:
            institution_id: Optional filter by institution
            start_date: Optional start filter
            end_date: Optional end filter
            limit: Maximum features to return

        Returns:
            List of feature usage summaries
        """
        query = select(
            FeatureUsageMetric.feature_name,
            func.sum(FeatureUsageMetric.invocation_count).label("total_invocations"),
            func.sum(FeatureUsageMetric.success_count).label("total_success"),
            func.avg(FeatureUsageMetric.avg_latency_ms).label("avg_latency"),
            func.sum(FeatureUsageMetric.total_tokens).label("total_tokens"),
        ).group_by(FeatureUsageMetric.feature_name)

        if institution_id:
            query = query.where(FeatureUsageMetric.institution_id == institution_id)

        if start_date:
            query = query.where(
                FeatureUsageMetric.period_start >= datetime.combine(
                    start_date, datetime.min.time()
                )
            )

        if end_date:
            query = query.where(
                FeatureUsageMetric.period_end <= datetime.combine(
                    end_date, datetime.max.time()
                )
            )

        query = query.order_by(func.sum(FeatureUsageMetric.invocation_count).desc())
        query = query.limit(limit)

        result = await self.db.execute(query)

        return [
            {
                "feature": row[0],
                "invocations": row[1],
                "success_count": row[2],
                "success_rate": row[2] / row[1] if row[1] > 0 else 0,
                "avg_latency_ms": int(row[3] or 0),
                "total_tokens": row[4],
            }
            for row in result.all()
        ]
