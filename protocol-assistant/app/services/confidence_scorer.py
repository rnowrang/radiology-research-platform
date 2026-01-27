"""Confidence Scorer for form filling.

Determines confidence based on:
- Semantic match quality
- Source reliability
- Field type characteristics
- Correction history (learning signal)
"""

import logging
from typing import Any, List, Optional

logger = logging.getLogger(__name__)


class ConfidenceScorer:
    """Scorer for determining form fill confidence levels."""

    # Source reliability weights
    SOURCE_WEIGHTS = {
        "wizard": 1.15,      # User-provided answers are most reliable
        "learned": 1.10,     # Learned patterns from corrections
        "fact": 1.05,        # Direct facts from knowledge base
        "embedding": 1.0,    # Semantic matches (baseline)
        "document": 0.95,    # Raw document extraction
    }

    # Field type reliability weights
    FIELD_TYPE_WEIGHTS = {
        "radio": 1.05,       # Constrained options easier to verify
        "select": 1.05,
        "checkbox": 1.05,
        "boolean": 1.05,
        "date": 1.0,
        "number": 1.0,
        "text": 0.95,        # Free text slightly less certain
        "textarea": 0.90,    # Long text hardest to verify
    }

    def score(
        self,
        semantic_score: float,
        source: str,
        field_type: str,
        correction_history: Optional[List[Any]] = None,
    ) -> float:
        """Calculate confidence score for a form fill.

        Args:
            semantic_score: Base similarity/match score (0-1)
            source: Source type ('wizard', 'fact', 'embedding', etc.)
            field_type: Form field type ('text', 'radio', etc.)
            correction_history: Optional list of past corrections for this field

        Returns:
            Final confidence score (0-1)
        """
        base_score = semantic_score

        # Apply source weight
        source_weight = self.SOURCE_WEIGHTS.get(source, 1.0)
        base_score *= source_weight

        # Apply field type weight
        field_weight = self.FIELD_TYPE_WEIGHTS.get(field_type, 1.0)
        base_score *= field_weight

        # Apply correction history penalty
        if correction_history:
            correction_rate = self._calculate_correction_rate(correction_history)
            # Reduce confidence based on how often this field gets corrected
            base_score *= (1 - correction_rate * 0.3)

        # Clamp to valid range
        return max(0.0, min(1.0, base_score))

    def score_batch(
        self,
        items: List[dict],
    ) -> List[float]:
        """Score multiple items in batch.

        Args:
            items: List of dicts with keys: semantic_score, source, field_type, correction_history

        Returns:
            List of confidence scores
        """
        return [
            self.score(
                semantic_score=item.get("semantic_score", 0.5),
                source=item.get("source", "embedding"),
                field_type=item.get("field_type", "text"),
                correction_history=item.get("correction_history"),
            )
            for item in items
        ]

    def _calculate_correction_rate(self, correction_history: List[Any]) -> float:
        """Calculate correction rate from history.

        Args:
            correction_history: List of correction records

        Returns:
            Correction rate (0-1)
        """
        if not correction_history:
            return 0.0

        total = len(correction_history)
        corrected = sum(1 for c in correction_history if self._was_corrected(c))

        return corrected / total if total > 0 else 0.0

    def _was_corrected(self, correction: Any) -> bool:
        """Check if a correction record represents an actual correction.

        Args:
            correction: Correction record (dict or object)

        Returns:
            True if the AI value was changed
        """
        if isinstance(correction, dict):
            original = correction.get("original_value")
            corrected = correction.get("corrected_value")
            return original != corrected
        if hasattr(correction, "original_value") and hasattr(correction, "corrected_value"):
            return correction.original_value != correction.corrected_value
        return False

    def get_confidence_level(self, score: float) -> str:
        """Convert score to confidence level string.

        Args:
            score: Confidence score (0-1)

        Returns:
            'high', 'medium', or 'low'
        """
        if score >= 0.85:
            return "high"
        elif score >= 0.60:
            return "medium"
        return "low"

    def should_review(self, score: float) -> bool:
        """Determine if a fill should be flagged for human review.

        Args:
            score: Confidence score (0-1)

        Returns:
            True if should be reviewed
        """
        return score < 0.7

    def explain_score(
        self,
        semantic_score: float,
        source: str,
        field_type: str,
        correction_history: Optional[List[Any]] = None,
    ) -> dict:
        """Explain how a confidence score was calculated.

        Args:
            semantic_score: Base similarity score
            source: Source type
            field_type: Field type
            correction_history: Optional correction history

        Returns:
            Dict with breakdown of score calculation
        """
        source_weight = self.SOURCE_WEIGHTS.get(source, 1.0)
        field_weight = self.FIELD_TYPE_WEIGHTS.get(field_type, 1.0)

        correction_penalty = 0.0
        correction_rate = 0.0
        if correction_history:
            correction_rate = self._calculate_correction_rate(correction_history)
            correction_penalty = correction_rate * 0.3

        final_score = self.score(semantic_score, source, field_type, correction_history)

        return {
            "base_score": semantic_score,
            "source": source,
            "source_weight": source_weight,
            "after_source": semantic_score * source_weight,
            "field_type": field_type,
            "field_weight": field_weight,
            "after_field": semantic_score * source_weight * field_weight,
            "correction_rate": correction_rate,
            "correction_penalty": correction_penalty,
            "final_score": final_score,
            "confidence_level": self.get_confidence_level(final_score),
            "needs_review": self.should_review(final_score),
        }
