"""
Quality Monitoring Service for Protocol Assistant.

This service provides real-time quality monitoring with:
- Automatic quality degradation detection
- Prompt auto-rollback when quality drops
- Cost threshold alerts
- Quality trend analysis
- Admin notifications for issues
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from uuid import UUID
from enum import Enum
from dataclasses import dataclass

from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.learning import AIFeedback, PromptVersion
from app.learning.prompt_management import PromptManager
from app.services.feature_flags import get_feature_flag_service

logger = logging.getLogger(__name__)


class QualityStatus(str, Enum):
    """Quality status levels."""
    HEALTHY = "healthy"
    WARNING = "warning"
    DEGRADED = "degraded"
    CRITICAL = "critical"


class AlertType(str, Enum):
    """Types of quality alerts."""
    QUALITY_DEGRADED = "quality_degraded"
    QUALITY_CRITICAL = "quality_critical"
    COST_WARNING = "cost_warning"
    COST_EXCEEDED = "cost_exceeded"
    PROMPT_ROLLBACK = "prompt_rollback"
    FEEDBACK_SPIKE = "feedback_spike"


@dataclass
class QualityMetrics:
    """Current quality metrics for a prompt or system."""
    avg_rating: float
    rating_count: int
    success_rate: float
    low_rating_count: int
    status: QualityStatus
    trend: str  # "improving", "stable", "declining"
    baseline_rating: float
    deviation_percentage: float


@dataclass
class Alert:
    """Quality or cost alert."""
    type: AlertType
    severity: str  # "info", "warning", "error", "critical"
    message: str
    details: Dict[str, Any]
    created_at: datetime
    prompt_key: Optional[str] = None
    institution_id: Optional[UUID] = None


class QualityMonitor:
    """
    Monitors quality metrics and triggers auto-rollback when needed.

    Features:
    - Continuous quality monitoring per prompt version
    - Automatic rollback to previous version if quality drops
    - Cost threshold monitoring with alerts
    - Trend analysis for proactive issue detection
    """

    # Quality thresholds
    QUALITY_WARNING_THRESHOLD = 0.9  # 90% of baseline
    QUALITY_DEGRADED_THRESHOLD = 0.8  # 80% of baseline
    QUALITY_CRITICAL_THRESHOLD = 0.7  # 70% of baseline

    # Minimum samples needed for reliable metrics
    MIN_SAMPLES_FOR_ANALYSIS = 10

    # Low rating threshold
    LOW_RATING_THRESHOLD = 2

    # Default baseline rating (if no historical data)
    DEFAULT_BASELINE_RATING = 3.5

    def __init__(self, db: AsyncSession):
        self.db = db
        self.prompt_manager = PromptManager(db)
        self._alerts: List[Alert] = []

    async def check_quality(
        self,
        prompt_key: Optional[str] = None,
        hours: int = 24,
        institution_id: Optional[UUID] = None,
    ) -> QualityMetrics:
        """
        Check current quality metrics.

        Args:
            prompt_key: Specific prompt to check (None for overall)
            hours: Time window for analysis
            institution_id: Optional institution filter

        Returns:
            QualityMetrics with current status
        """
        cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

        # Build query for recent feedback
        query = select(AIFeedback).where(AIFeedback.created_at >= cutoff)

        if prompt_key:
            # Get active prompt version
            versions = await self.prompt_manager.get_versions(prompt_key)
            active_ids = [v.id for v in versions if v.is_active]
            if active_ids:
                query = query.where(AIFeedback.prompt_version_id.in_(active_ids))

        if institution_id:
            query = query.where(AIFeedback.institution_id == institution_id)

        result = await self.db.execute(query)
        feedbacks = list(result.scalars().all())

        if not feedbacks:
            return QualityMetrics(
                avg_rating=0,
                rating_count=0,
                success_rate=0,
                low_rating_count=0,
                status=QualityStatus.HEALTHY,
                trend="stable",
                baseline_rating=self.DEFAULT_BASELINE_RATING,
                deviation_percentage=0,
            )

        # Calculate metrics
        ratings = [f.rating for f in feedbacks if f.rating is not None]
        avg_rating = sum(ratings) / len(ratings) if ratings else 0
        low_count = sum(1 for r in ratings if r <= self.LOW_RATING_THRESHOLD)
        success_count = sum(1 for f in feedbacks if f.rating and f.rating >= 3)
        success_rate = success_count / len(feedbacks) if feedbacks else 0

        # Get baseline (previous week's average)
        baseline = await self._get_baseline_rating(prompt_key, institution_id)

        # Determine status
        if len(ratings) < self.MIN_SAMPLES_FOR_ANALYSIS:
            status = QualityStatus.HEALTHY  # Not enough data
            deviation = 0
        else:
            ratio = avg_rating / baseline if baseline > 0 else 1
            deviation = (1 - ratio) * 100

            if ratio >= self.QUALITY_WARNING_THRESHOLD:
                status = QualityStatus.HEALTHY
            elif ratio >= self.QUALITY_DEGRADED_THRESHOLD:
                status = QualityStatus.WARNING
            elif ratio >= self.QUALITY_CRITICAL_THRESHOLD:
                status = QualityStatus.DEGRADED
            else:
                status = QualityStatus.CRITICAL

        # Determine trend
        trend = await self._calculate_trend(prompt_key, institution_id)

        return QualityMetrics(
            avg_rating=round(avg_rating, 2),
            rating_count=len(ratings),
            success_rate=round(success_rate * 100, 1),
            low_rating_count=low_count,
            status=status,
            trend=trend,
            baseline_rating=round(baseline, 2),
            deviation_percentage=round(deviation, 1),
        )

    async def check_and_auto_rollback(
        self,
        prompt_key: str,
        institution_id: Optional[UUID] = None,
    ) -> Optional[Alert]:
        """
        Check quality and automatically rollback if needed.

        This is the main entry point for quality monitoring.
        Should be called periodically or after receiving feedback.

        Args:
            prompt_key: The prompt key to check
            institution_id: Optional institution filter

        Returns:
            Alert if rollback was triggered, None otherwise
        """
        # Check if auto-rollback is enabled
        feature_service = get_feature_flag_service(self.db)
        if not await feature_service.is_enabled(
            "auto_rollback",
            institution_id=institution_id,
        ):
            return None

        metrics = await self.check_quality(prompt_key, hours=24, institution_id=institution_id)

        # Only consider rollback if we have enough samples
        if metrics.rating_count < self.MIN_SAMPLES_FOR_ANALYSIS:
            return None

        if metrics.status in (QualityStatus.DEGRADED, QualityStatus.CRITICAL):
            # Attempt rollback
            rollback_result = await self._execute_rollback(prompt_key, metrics)

            if rollback_result:
                alert = Alert(
                    type=AlertType.PROMPT_ROLLBACK,
                    severity="warning" if metrics.status == QualityStatus.DEGRADED else "error",
                    message=f"Prompt '{prompt_key}' automatically rolled back due to quality degradation",
                    details={
                        "prompt_key": prompt_key,
                        "avg_rating": metrics.avg_rating,
                        "baseline_rating": metrics.baseline_rating,
                        "deviation_percentage": metrics.deviation_percentage,
                        "sample_count": metrics.rating_count,
                        "rolled_back_from": rollback_result["from_version"],
                        "rolled_back_to": rollback_result["to_version"],
                    },
                    created_at=datetime.now(timezone.utc),
                    prompt_key=prompt_key,
                    institution_id=institution_id,
                )
                self._alerts.append(alert)

                # Log the rollback
                logger.warning(
                    f"Auto-rollback executed for '{prompt_key}': "
                    f"v{rollback_result['from_version']} -> v{rollback_result['to_version']} "
                    f"(rating: {metrics.avg_rating}/{metrics.baseline_rating})"
                )

                return alert

        return None

    async def check_cost_alerts(
        self,
        institution_id: UUID,
        monthly_threshold: float,
    ) -> List[Alert]:
        """
        Check if projected costs exceed thresholds.

        Args:
            institution_id: Institution to check
            monthly_threshold: Monthly cost limit in dollars

        Returns:
            List of cost alerts (if any)
        """
        from app.analytics.service import AnalyticsService

        alerts = []
        service = AnalyticsService(self.db)

        # Get current month's costs
        today = datetime.now(timezone.utc).date()
        month_start = today.replace(day=1)
        costs = await service.get_cost_analysis(institution_id, month_start, today)

        if not costs:
            return alerts

        current_cost = costs.get("total_cost", 0)
        days_in_month = 30  # Approximate
        days_elapsed = (today - month_start).days + 1
        projected_cost = (current_cost / days_elapsed) * days_in_month if days_elapsed > 0 else 0

        # Warning at 80% of threshold
        if projected_cost > monthly_threshold * 0.8:
            severity = "warning"
            alert_type = AlertType.COST_WARNING

            if projected_cost > monthly_threshold:
                severity = "error"
                alert_type = AlertType.COST_EXCEEDED

            alert = Alert(
                type=alert_type,
                severity=severity,
                message=f"Projected monthly cost ${projected_cost:.2f} exceeds threshold ${monthly_threshold:.2f}",
                details={
                    "current_cost": round(current_cost, 2),
                    "projected_cost": round(projected_cost, 2),
                    "threshold": monthly_threshold,
                    "days_elapsed": days_elapsed,
                },
                created_at=datetime.now(timezone.utc),
                institution_id=institution_id,
            )
            alerts.append(alert)
            self._alerts.append(alert)

        return alerts

    async def get_quality_trends(
        self,
        prompt_key: Optional[str] = None,
        days: int = 7,
        institution_id: Optional[UUID] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get daily quality trends.

        Args:
            prompt_key: Specific prompt to analyze
            days: Number of days of history
            institution_id: Optional institution filter

        Returns:
            List of daily metrics
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        query = (
            select(
                func.date(AIFeedback.created_at).label("date"),
                func.avg(AIFeedback.rating).label("avg_rating"),
                func.count(AIFeedback.id).label("count"),
                func.sum(
                    func.cast(AIFeedback.rating <= self.LOW_RATING_THRESHOLD, func.Integer)
                ).label("low_count"),
            )
            .where(AIFeedback.created_at >= cutoff)
            .group_by(func.date(AIFeedback.created_at))
            .order_by(func.date(AIFeedback.created_at))
        )

        if prompt_key:
            versions = await self.prompt_manager.get_versions(prompt_key)
            version_ids = [v.id for v in versions]
            if version_ids:
                query = query.where(AIFeedback.prompt_version_id.in_(version_ids))

        if institution_id:
            query = query.where(AIFeedback.institution_id == institution_id)

        result = await self.db.execute(query)
        rows = result.fetchall()

        return [
            {
                "date": str(row.date),
                "avg_rating": round(float(row.avg_rating or 0), 2),
                "feedback_count": row.count,
                "low_rating_count": row.low_count or 0,
            }
            for row in rows
        ]

    async def get_recent_alerts(
        self,
        institution_id: Optional[UUID] = None,
        limit: int = 20,
    ) -> List[Alert]:
        """Get recent alerts."""
        alerts = self._alerts
        if institution_id:
            alerts = [a for a in alerts if a.institution_id == institution_id]
        return sorted(alerts, key=lambda a: a.created_at, reverse=True)[:limit]

    async def _get_baseline_rating(
        self,
        prompt_key: Optional[str],
        institution_id: Optional[UUID],
    ) -> float:
        """Get baseline rating from historical data (previous week)."""
        now = datetime.now(timezone.utc)
        week_ago = now - timedelta(days=7)
        two_weeks_ago = now - timedelta(days=14)

        query = select(func.avg(AIFeedback.rating)).where(
            and_(
                AIFeedback.created_at >= two_weeks_ago,
                AIFeedback.created_at < week_ago,
            )
        )

        if prompt_key:
            versions = await self.prompt_manager.get_versions(prompt_key)
            version_ids = [v.id for v in versions]
            if version_ids:
                query = query.where(AIFeedback.prompt_version_id.in_(version_ids))

        if institution_id:
            query = query.where(AIFeedback.institution_id == institution_id)

        result = await self.db.execute(query)
        baseline = result.scalar()

        return float(baseline) if baseline else self.DEFAULT_BASELINE_RATING

    async def _calculate_trend(
        self,
        prompt_key: Optional[str],
        institution_id: Optional[UUID],
    ) -> str:
        """Calculate quality trend (improving/stable/declining)."""
        trends = await self.get_quality_trends(prompt_key, days=7, institution_id=institution_id)

        if len(trends) < 3:
            return "stable"

        # Compare recent days to earlier days
        recent = trends[-3:]
        earlier = trends[:-3]

        if not earlier:
            return "stable"

        recent_avg = sum(t["avg_rating"] for t in recent) / len(recent)
        earlier_avg = sum(t["avg_rating"] for t in earlier) / len(earlier)

        if recent_avg > earlier_avg * 1.05:
            return "improving"
        elif recent_avg < earlier_avg * 0.95:
            return "declining"
        return "stable"

    async def _execute_rollback(
        self,
        prompt_key: str,
        metrics: QualityMetrics,
    ) -> Optional[Dict[str, Any]]:
        """
        Execute a rollback to a previous prompt version.

        Returns:
            Dict with rollback details, or None if rollback failed
        """
        # Get all versions
        versions = await self.prompt_manager.get_versions(prompt_key)

        if len(versions) < 2:
            logger.warning(f"Cannot rollback '{prompt_key}': only one version exists")
            return None

        # Find current active version
        current = next((v for v in versions if v.is_active and v.traffic_percentage == 100), None)

        if not current:
            logger.warning(f"Cannot rollback '{prompt_key}': no fully active version found")
            return None

        # Find previous version to rollback to
        # Sort by version number descending, find the one before current
        sorted_versions = sorted(versions, key=lambda v: v.version, reverse=True)
        previous = None

        for v in sorted_versions:
            if v.version < current.version:
                # Check if previous version had good metrics
                if v.avg_quality_score and v.avg_quality_score >= self.DEFAULT_BASELINE_RATING * 0.9:
                    previous = v
                    break
                # If no good previous version, use the most recent one anyway
                if previous is None:
                    previous = v

        if not previous:
            logger.warning(f"Cannot rollback '{prompt_key}': no previous version available")
            return None

        # Deactivate current and activate previous
        # Using a placeholder admin_id since this is automated
        auto_admin_id = UUID("00000000-0000-0000-0000-000000000000")

        await self.prompt_manager.deactivate_version(current.id)
        await self.prompt_manager.activate_version(
            previous.id,
            activated_by=auto_admin_id,
            traffic_percentage=100,
        )

        return {
            "from_version": current.version,
            "to_version": previous.version,
            "reason": f"Quality degradation: {metrics.avg_rating:.2f} vs baseline {metrics.baseline_rating:.2f}",
        }


def get_quality_monitor(db: AsyncSession) -> QualityMonitor:
    """Get a quality monitor instance."""
    return QualityMonitor(db)
