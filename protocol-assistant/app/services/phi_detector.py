"""PHI (Protected Health Information) detection and redaction service."""

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class PHIMatch:
    """Represents a detected PHI instance in text."""

    type: str  # Type of PHI (e.g., 'mrn', 'ssn', 'phone')
    start: int  # Start index in original text
    end: int  # End index in original text
    text: str  # The matched text


class PHIDetector:
    """
    Detects and redacts Protected Health Information (PHI) from text.

    HIPAA defines 18 types of identifiers as PHI. This detector focuses on
    the most common patterns found in research protocols and documents:
    - Medical Record Numbers (MRN)
    - Social Security Numbers (SSN)
    - Phone numbers
    - Email addresses
    - Dates of birth
    - Names (limited pattern matching)
    - IP addresses
    - Account/ID numbers

    Note: This is a pattern-based detector and may not catch all PHI.
    Human review is recommended for documents containing sensitive information.
    """

    # Regular expression patterns for PHI detection
    PATTERNS = {
        # Medical Record Number - typically 7-10 digit numbers
        "mrn": r"\b(?:MRN|Medical Record(?:\s+Number)?|Patient(?:\s+ID)?)\s*[:#]?\s*(\d{7,10})\b",
        # Also catch standalone 7-10 digit numbers in certain contexts
        # Note: Can't use variable-width lookbehind in Python, so we match the prefix and extract the number
        "mrn_standalone": r"\b(?:[Pp]atient|[Ss]ubject|[Rr]ecord)\s*(?:#|ID|:)?\s*(\d{7,10})\b",
        # Social Security Number - XXX-XX-XXXX format
        "ssn": r"\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b",
        # Phone numbers - various formats
        "phone": r"\b(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b",
        # Email addresses
        "email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
        # Dates of birth - various formats
        "dob": r"\b(?:DOB|Date\s*of\s*Birth|Birth\s*Date)\s*[:#]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b",
        # Standalone dates that might be DOB (MM/DD/YYYY or similar)
        "date": r"\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)?\d{2}\b",
        # IP addresses
        "ip_address": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
        # US Zip codes (5 digits or 5+4)
        "zip_code": r"\b\d{5}(?:-\d{4})?\b",
        # Account/ID numbers following common patterns
        "account_number": r"\b(?:Account|Acct|ID)\s*[#:]?\s*([A-Z0-9]{6,12})\b",
        # Names following "Dr.", "Mr.", "Mrs.", "Ms." patterns
        "name_title": r"\b(?:Dr\.|Mr\.|Mrs\.|Ms\.)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b",
        # Names in "Last, First" format
        "name_formal": r"\b[A-Z][a-z]+,\s*[A-Z][a-z]+(?:\s+[A-Z]\.?)?\b",
    }

    # Redaction placeholder for each type
    REDACTION_PLACEHOLDERS = {
        "mrn": "[REDACTED-MRN]",
        "mrn_standalone": "[REDACTED-MRN]",
        "ssn": "[REDACTED-SSN]",
        "phone": "[REDACTED-PHONE]",
        "email": "[REDACTED-EMAIL]",
        "dob": "[REDACTED-DOB]",
        "date": "[REDACTED-DATE]",
        "ip_address": "[REDACTED-IP]",
        "zip_code": "[REDACTED-ZIP]",
        "account_number": "[REDACTED-ACCOUNT]",
        "name_title": "[REDACTED-NAME]",
        "name_formal": "[REDACTED-NAME]",
    }

    # Patterns that should be excluded (false positives)
    EXCLUSION_PATTERNS = [
        # Common statistical patterns
        r"p\s*[<>=]\s*0\.\d+",
        r"n\s*=\s*\d+",
        # Years (4-digit numbers starting with 19 or 20)
        r"\b(?:19|20)\d{2}\b",
        # Common research identifiers that aren't PHI
        r"(?:IRB|Protocol|Study|Form)\s*#?\s*\d+",
        # Reference numbers
        r"(?:Ref|Reference|Ver|Version)\s*[:#]?\s*[\d.]+",
    ]

    def __init__(self, sensitivity: str = "medium"):
        """
        Initialize the PHI detector.

        Args:
            sensitivity: Detection sensitivity level
                - 'low': Only detect clear PHI patterns (SSN, MRN with labels)
                - 'medium': Detect most PHI patterns (default)
                - 'high': Aggressive detection, may have more false positives
        """
        self.sensitivity = sensitivity
        self._compile_patterns()

    def _compile_patterns(self) -> None:
        """Compile regex patterns for better performance."""
        self._compiled_patterns = {
            name: re.compile(pattern, re.IGNORECASE)
            for name, pattern in self.PATTERNS.items()
        }
        self._compiled_exclusions = [
            re.compile(pattern, re.IGNORECASE) for pattern in self.EXCLUSION_PATTERNS
        ]

    def scan(self, text: str) -> list[PHIMatch]:
        """
        Scan text for potential PHI.

        Args:
            text: Text to scan

        Returns:
            List of PHIMatch objects for detected PHI
        """
        matches = []
        seen_ranges = set()

        # Collect all potential exclusion ranges
        exclusion_ranges = []
        for exclusion_pattern in self._compiled_exclusions:
            for match in exclusion_pattern.finditer(text):
                exclusion_ranges.append((match.start(), match.end()))

        # Search for each PHI pattern
        for phi_type, pattern in self._compiled_patterns.items():
            # Skip some patterns in low sensitivity mode
            if self.sensitivity == "low" and phi_type in [
                "date",
                "zip_code",
                "name_title",
                "name_formal",
            ]:
                continue

            for match in pattern.finditer(text):
                start, end = match.start(), match.end()

                # Check if this match overlaps with an exclusion
                is_excluded = any(
                    ex_start <= start < ex_end or ex_start < end <= ex_end
                    for ex_start, ex_end in exclusion_ranges
                )
                if is_excluded:
                    continue

                # Check for overlapping matches (prefer longer matches)
                range_key = (start, end)
                is_subsumed = any(
                    seen_start <= start and end <= seen_end
                    for seen_start, seen_end in seen_ranges
                )
                if is_subsumed:
                    continue

                # Remove any smaller matches that this one subsumes
                seen_ranges = {
                    (s, e)
                    for s, e in seen_ranges
                    if not (start <= s and e <= end)
                }

                seen_ranges.add(range_key)
                matches.append(
                    PHIMatch(
                        type=phi_type.replace("_standalone", ""),
                        start=start,
                        end=end,
                        text=match.group(),
                    )
                )

        # Sort by position in text
        matches.sort(key=lambda m: m.start)

        logger.debug(f"PHI scan found {len(matches)} potential matches")
        return matches

    def redact(self, text: str, matches: Optional[list[PHIMatch]] = None) -> str:
        """
        Redact PHI from text.

        Args:
            text: Text to redact
            matches: Optional pre-computed matches (will scan if not provided)

        Returns:
            Text with PHI replaced by redaction placeholders
        """
        if matches is None:
            matches = self.scan(text)

        if not matches:
            return text

        # Sort matches by position (descending) to preserve indices during replacement
        sorted_matches = sorted(matches, key=lambda m: m.start, reverse=True)

        result = text
        for match in sorted_matches:
            placeholder = self.REDACTION_PLACEHOLDERS.get(
                match.type, f"[REDACTED-{match.type.upper()}]"
            )
            result = result[: match.start] + placeholder + result[match.end:]

        return result

    def has_phi(self, text: str) -> bool:
        """
        Check if text contains any potential PHI.

        Args:
            text: Text to check

        Returns:
            True if PHI is detected, False otherwise
        """
        matches = self.scan(text)
        return len(matches) > 0

    def get_phi_summary(self, text: str) -> dict:
        """
        Get a summary of PHI found in text.

        Args:
            text: Text to analyze

        Returns:
            Dictionary with PHI summary by type
        """
        matches = self.scan(text)

        summary = {
            "total_count": len(matches),
            "has_phi": len(matches) > 0,
            "by_type": {},
        }

        for match in matches:
            phi_type = match.type
            if phi_type not in summary["by_type"]:
                summary["by_type"][phi_type] = {"count": 0, "samples": []}
            summary["by_type"][phi_type]["count"] += 1
            # Only keep first 3 samples per type (with partial redaction)
            if len(summary["by_type"][phi_type]["samples"]) < 3:
                # Partially redact the sample for security
                sample = self._partial_redact(match.text)
                summary["by_type"][phi_type]["samples"].append(sample)

        return summary

    def _partial_redact(self, text: str) -> str:
        """
        Partially redact text for display purposes.

        Shows first and last characters but redacts the middle.

        Args:
            text: Text to partially redact

        Returns:
            Partially redacted text
        """
        if len(text) <= 4:
            return "*" * len(text)
        return text[0:2] + "*" * (len(text) - 4) + text[-2:]


# Global instance for dependency injection
_phi_detector: Optional[PHIDetector] = None


def get_phi_detector(sensitivity: str = "medium") -> PHIDetector:
    """Get the global PHI detector instance."""
    global _phi_detector
    if _phi_detector is None or _phi_detector.sensitivity != sensitivity:
        _phi_detector = PHIDetector(sensitivity=sensitivity)
    return _phi_detector
