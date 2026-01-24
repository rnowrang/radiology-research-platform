"""
Analytics module for Protocol Assistant.

This module provides:
- Usage analytics tracking and reporting
- Cost analysis and projections
- Performance metrics aggregation
- Quality metrics collection
"""

from app.analytics.service import (
    AnalyticsService,
    UsageSummary,
    QualityMetrics,
    CostAnalysis,
)

__all__ = [
    "AnalyticsService",
    "UsageSummary",
    "QualityMetrics",
    "CostAnalysis",
]
