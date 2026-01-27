"""Rule Engine for Coherence Service.

The rule engine is responsible for:
- Loading and managing coherence rules
- Evaluating rules against project data
- Generating rule evaluation results
"""

import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

import yaml

from app.config import get_settings
from app.models.rules import (
    CheckType,
    CoherenceRule,
    RuleEvaluation,
    RuleSeverity,
    get_builtin_rules,
)

logger = logging.getLogger(__name__)


class RuleEngine:
    """Engine for evaluating coherence rules.

    Manages a registry of rules and provides methods to evaluate
    them against project knowledge base data.
    """

    def __init__(self):
        """Initialize the rule engine."""
        self.settings = get_settings()
        self.rules: Dict[str, CoherenceRule] = {}
        self._load_builtin_rules()

    def _load_builtin_rules(self) -> None:
        """Load built-in rules into the registry."""
        for rule in get_builtin_rules():
            self.rules[rule.rule_id] = rule
        logger.info("Loaded %d built-in rules", len(self.rules))

    def load_rules_from_yaml(self, yaml_content: str) -> int:
        """Load rules from YAML content.

        Args:
            yaml_content: YAML string containing rule definitions

        Returns:
            Number of rules loaded
        """
        try:
            data = yaml.safe_load(yaml_content)
            if not data or "rules" not in data:
                return 0

            count = 0
            for rule_data in data["rules"]:
                try:
                    rule = CoherenceRule(**rule_data)
                    self.rules[rule.rule_id] = rule
                    count += 1
                except Exception as e:
                    logger.warning("Failed to load rule: %s", e)

            return count
        except yaml.YAMLError as e:
            logger.error("Failed to parse YAML: %s", e)
            return 0

    def get_rule(self, rule_id: str) -> Optional[CoherenceRule]:
        """Get a rule by ID.

        Args:
            rule_id: Rule identifier

        Returns:
            CoherenceRule or None if not found
        """
        return self.rules.get(rule_id)

    def get_all_rules(self, enabled_only: bool = True) -> List[CoherenceRule]:
        """Get all registered rules.

        Args:
            enabled_only: Only return enabled rules

        Returns:
            List of CoherenceRule objects
        """
        rules = list(self.rules.values())
        if enabled_only:
            rules = [r for r in rules if r.enabled]
        return rules

    def get_rules_by_category(self, category: str) -> List[CoherenceRule]:
        """Get rules by category.

        Args:
            category: Rule category

        Returns:
            List of matching rules
        """
        return [r for r in self.rules.values() if r.category == category and r.enabled]

    def evaluate_rule(
        self,
        rule: CoherenceRule,
        knowledge_base: Dict[str, Any],
        form_data: Optional[Dict[str, Any]] = None,
    ) -> RuleEvaluation:
        """Evaluate a single rule against project data.

        Args:
            rule: Rule to evaluate
            knowledge_base: Project knowledge base data
            form_data: Optional form data to check against

        Returns:
            RuleEvaluation result
        """
        start_time = time.time()

        try:
            if rule.check_type == CheckType.CROSS_DOCUMENT_EQUALITY:
                return self._check_cross_document_equality(rule, knowledge_base, form_data, start_time)
            elif rule.check_type == CheckType.REQUIRED_FIELD:
                return self._check_required_field(rule, knowledge_base, start_time)
            elif rule.check_type == CheckType.TIMELINE_CONSISTENCY:
                return self._check_timeline_consistency(rule, knowledge_base, start_time)
            elif rule.check_type == CheckType.VALUE_RANGE:
                return self._check_value_range(rule, knowledge_base, start_time)
            elif rule.check_type == CheckType.CONDITIONAL_REQUIREMENT:
                return self._check_conditional_requirement(rule, knowledge_base, start_time)
            else:
                return RuleEvaluation(
                    rule_id=rule.rule_id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    passed=True,
                    message=f"Check type {rule.check_type} not implemented",
                    evaluation_time_ms=(time.time() - start_time) * 1000,
                )
        except Exception as e:
            logger.error("Rule evaluation error for %s: %s", rule.rule_id, e)
            return RuleEvaluation(
                rule_id=rule.rule_id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=True,  # Don't fail on errors
                message=f"Evaluation error: {str(e)}",
                evaluation_time_ms=(time.time() - start_time) * 1000,
            )

    def _check_cross_document_equality(
        self,
        rule: CoherenceRule,
        knowledge_base: Dict[str, Any],
        form_data: Optional[Dict[str, Any]],
        start_time: float,
    ) -> RuleEvaluation:
        """Check that values match across documents."""
        facts = knowledge_base.get("facts", [])
        protocol_data = knowledge_base.get("protocol_data", {})

        # Collect values for each fact key
        values: Dict[str, Any] = {}

        # Check facts
        for fact in facts:
            if fact.get("key") in rule.fact_keys:
                source = fact.get("source", "unknown")
                values[f"kb_{source}"] = fact.get("value")

        # Check protocol data
        for key in rule.fact_keys:
            if key in protocol_data:
                values["protocol"] = protocol_data[key]

        # Check form data if provided
        if form_data:
            for key in rule.fact_keys:
                if key in form_data:
                    values["form"] = form_data[key]

        # If we have less than 2 values, nothing to compare
        if len(values) < 2:
            return RuleEvaluation(
                rule_id=rule.rule_id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=True,
                message="Not enough data to compare",
                evaluation_time_ms=(time.time() - start_time) * 1000,
            )

        # Check if all values are equal
        unique_values = set(str(v) for v in values.values() if v is not None)
        if len(unique_values) <= 1:
            return RuleEvaluation(
                rule_id=rule.rule_id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=True,
                message="Values are consistent",
                evaluation_time_ms=(time.time() - start_time) * 1000,
            )

        # Conflict detected
        return RuleEvaluation(
            rule_id=rule.rule_id,
            rule_name=rule.name,
            severity=rule.severity,
            passed=False,
            message=f"Conflicting values found for {rule.fact_keys[0]}",
            fact_key=rule.fact_keys[0],
            actual_values=values,
            conflicting_sources=list(values.keys()),
            evaluation_time_ms=(time.time() - start_time) * 1000,
        )

    def _check_required_field(
        self,
        rule: CoherenceRule,
        knowledge_base: Dict[str, Any],
        start_time: float,
    ) -> RuleEvaluation:
        """Check that required fields are present."""
        facts = knowledge_base.get("facts", [])
        protocol_data = knowledge_base.get("protocol_data", {})

        # Check if any of the fact keys have a value
        for key in rule.fact_keys:
            # Check facts
            for fact in facts:
                if fact.get("key") == key and fact.get("value"):
                    return RuleEvaluation(
                        rule_id=rule.rule_id,
                        rule_name=rule.name,
                        severity=rule.severity,
                        passed=True,
                        message=f"Required field '{key}' is present",
                        evaluation_time_ms=(time.time() - start_time) * 1000,
                    )

            # Check protocol data
            if key in protocol_data and protocol_data[key]:
                return RuleEvaluation(
                    rule_id=rule.rule_id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    passed=True,
                    message=f"Required field '{key}' is present",
                    evaluation_time_ms=(time.time() - start_time) * 1000,
                )

        # Not found
        return RuleEvaluation(
            rule_id=rule.rule_id,
            rule_name=rule.name,
            severity=rule.severity,
            passed=False,
            message=f"Required field missing: {rule.fact_keys}",
            fact_key=rule.fact_keys[0] if rule.fact_keys else None,
            evaluation_time_ms=(time.time() - start_time) * 1000,
        )

    def _check_timeline_consistency(
        self,
        rule: CoherenceRule,
        knowledge_base: Dict[str, Any],
        start_time: float,
    ) -> RuleEvaluation:
        """Check that dates are logically consistent."""
        from datetime import datetime as dt

        facts = knowledge_base.get("facts", [])
        protocol_data = knowledge_base.get("protocol_data", {})

        # Find start and end dates
        start_date = None
        end_date = None

        for key in rule.fact_keys:
            value = None
            # Check facts
            for fact in facts:
                if fact.get("key") == key:
                    value = fact.get("value")
                    break
            # Check protocol data
            if not value and key in protocol_data:
                value = protocol_data[key]

            if value:
                try:
                    parsed_date = dt.fromisoformat(str(value).replace("Z", "+00:00"))
                    if "start" in key.lower():
                        start_date = parsed_date
                    elif "end" in key.lower():
                        end_date = parsed_date
                except (ValueError, TypeError):
                    pass

        if not start_date or not end_date:
            return RuleEvaluation(
                rule_id=rule.rule_id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=True,
                message="Dates not found or not parseable",
                evaluation_time_ms=(time.time() - start_time) * 1000,
            )

        # Check start < end
        if start_date >= end_date:
            return RuleEvaluation(
                rule_id=rule.rule_id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=False,
                message="Start date must be before end date",
                actual_values={
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                },
                evaluation_time_ms=(time.time() - start_time) * 1000,
            )

        return RuleEvaluation(
            rule_id=rule.rule_id,
            rule_name=rule.name,
            severity=rule.severity,
            passed=True,
            message="Dates are consistent",
            evaluation_time_ms=(time.time() - start_time) * 1000,
        )

    def _check_value_range(
        self,
        rule: CoherenceRule,
        knowledge_base: Dict[str, Any],
        start_time: float,
    ) -> RuleEvaluation:
        """Check that a value is within expected range."""
        facts = knowledge_base.get("facts", [])
        protocol_data = knowledge_base.get("protocol_data", {})
        params = rule.parameters

        min_val = params.get("min_value")
        max_val = params.get("max_value")

        # Find value
        value = None
        for key in rule.fact_keys:
            for fact in facts:
                if fact.get("key") == key:
                    value = fact.get("value")
                    break
            if not value and key in protocol_data:
                value = protocol_data[key]
            if value:
                break

        if value is None:
            return RuleEvaluation(
                rule_id=rule.rule_id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=True,
                message="Value not found",
                evaluation_time_ms=(time.time() - start_time) * 1000,
            )

        try:
            num_value = float(value)
            if min_val is not None and num_value < min_val:
                return RuleEvaluation(
                    rule_id=rule.rule_id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    passed=False,
                    message=f"Value {num_value} is below minimum {min_val}",
                    actual_values={"value": num_value, "min": min_val},
                    evaluation_time_ms=(time.time() - start_time) * 1000,
                )
            if max_val is not None and num_value > max_val:
                return RuleEvaluation(
                    rule_id=rule.rule_id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    passed=False,
                    message=f"Value {num_value} is above maximum {max_val}",
                    actual_values={"value": num_value, "max": max_val},
                    evaluation_time_ms=(time.time() - start_time) * 1000,
                )
        except (ValueError, TypeError):
            pass

        return RuleEvaluation(
            rule_id=rule.rule_id,
            rule_name=rule.name,
            severity=rule.severity,
            passed=True,
            message="Value is within range",
            evaluation_time_ms=(time.time() - start_time) * 1000,
        )

    def _check_conditional_requirement(
        self,
        rule: CoherenceRule,
        knowledge_base: Dict[str, Any],
        start_time: float,
    ) -> RuleEvaluation:
        """Check conditional requirements based on study type."""
        # Get study type
        study_type = None
        facts = knowledge_base.get("facts", [])
        protocol_data = knowledge_base.get("protocol_data", {})

        for fact in facts:
            if fact.get("key") in rule.fact_keys:
                study_type = fact.get("value")
                break
        if not study_type:
            study_type = protocol_data.get("study_type")

        if not study_type:
            return RuleEvaluation(
                rule_id=rule.rule_id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=True,
                message="Study type not specified",
                evaluation_time_ms=(time.time() - start_time) * 1000,
            )

        # Get required documents for this study type
        required_docs = rule.parameters.get(study_type.lower(), [])
        if not required_docs:
            return RuleEvaluation(
                rule_id=rule.rule_id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=True,
                message=f"No specific requirements for study type: {study_type}",
                evaluation_time_ms=(time.time() - start_time) * 1000,
            )

        # Check if required documents exist
        documents = knowledge_base.get("documents", [])
        doc_types = [d.get("doc_type", d.get("type", "")) for d in documents]

        missing = [req for req in required_docs if req not in doc_types]

        if missing:
            return RuleEvaluation(
                rule_id=rule.rule_id,
                rule_name=rule.name,
                severity=rule.severity,
                passed=False,
                message=f"Missing required documents for {study_type}: {missing}",
                actual_values={"study_type": study_type, "missing": missing},
                evaluation_time_ms=(time.time() - start_time) * 1000,
            )

        return RuleEvaluation(
            rule_id=rule.rule_id,
            rule_name=rule.name,
            severity=rule.severity,
            passed=True,
            message="All required documents present",
            evaluation_time_ms=(time.time() - start_time) * 1000,
        )

    def evaluate_all_rules(
        self,
        knowledge_base: Dict[str, Any],
        form_data: Optional[Dict[str, Any]] = None,
    ) -> List[RuleEvaluation]:
        """Evaluate all enabled rules against project data.

        Args:
            knowledge_base: Project knowledge base data
            form_data: Optional form data

        Returns:
            List of RuleEvaluation results
        """
        results = []
        for rule in self.get_all_rules(enabled_only=True):
            result = self.evaluate_rule(rule, knowledge_base, form_data)
            results.append(result)
        return results


# Module-level singleton
_rule_engine: Optional[RuleEngine] = None


def get_rule_engine() -> RuleEngine:
    """Get the rule engine singleton.

    Returns:
        RuleEngine instance
    """
    global _rule_engine
    if _rule_engine is None:
        _rule_engine = RuleEngine()
    return _rule_engine
