"""Suggestion generator service for the Protocol Assistant wizard.

This service provides AI-powered answer suggestions for wizard questions,
using document context, common answers, and AI generation.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from anthropic import AsyncAnthropic
import os

from app.schemas.wizard import SuggestedAnswer

logger = logging.getLogger(__name__)

# Common answers by question category/type
COMMON_ANSWERS = {
    "sample_size": [
        SuggestedAnswer(id="common_1", text="30 participants", source="common"),
        SuggestedAnswer(id="common_2", text="50 participants", source="common"),
        SuggestedAnswer(id="common_3", text="100 participants", source="common"),
    ],
    "study_duration": [
        SuggestedAnswer(id="common_1", text="6 months", source="common"),
        SuggestedAnswer(id="common_2", text="12 months", source="common"),
        SuggestedAnswer(id="common_3", text="24 months", source="common"),
    ],
    "data_collection": [
        SuggestedAnswer(id="common_1", text="Electronic health records review", source="common"),
        SuggestedAnswer(id="common_2", text="Surveys and questionnaires", source="common"),
        SuggestedAnswer(id="common_3", text="Clinical assessments and imaging", source="common"),
    ],
    "confidentiality": [
        SuggestedAnswer(id="common_1", text="Data will be de-identified and stored in secure, encrypted databases with restricted access", source="common"),
        SuggestedAnswer(id="common_2", text="All identifiers will be removed and replaced with study codes; linking key stored separately", source="common"),
    ],
    "minimal_risk": [
        SuggestedAnswer(id="common_1", text="This study poses minimal risk to participants, no greater than those encountered in daily life", source="common"),
        SuggestedAnswer(id="common_2", text="Risks include potential discomfort from standard clinical procedures and possible breach of confidentiality, both mitigated by established protocols", source="common"),
    ],
}


class SuggestionGenerator:
    """Generator for AI-powered answer suggestions."""

    def __init__(self):
        """Initialize the suggestion generator with Anthropic client."""
        self.client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    async def generate(
        self,
        question_id: str,
        question_text: str,
        section: str,
        protocol: Optional[Dict[str, Any]],
        document_text: Optional[str],
    ) -> List[SuggestedAnswer]:
        """
        Generate answer suggestions for a wizard question.

        Args:
            question_id: Unique identifier for the question
            question_text: The question text to generate suggestions for
            section: Protocol section the question relates to
            protocol: Extracted protocol data if available
            document_text: Raw document text if available

        Returns:
            List of suggested answers, max 5
        """
        suggestions: List[SuggestedAnswer] = []

        # 1. Try to extract from document context
        if document_text:
            doc_suggestions = await self._extract_from_document(
                question_text, document_text
            )
            suggestions.extend(doc_suggestions)

        # 2. Get common answers for question type
        common = self._get_common_answers(question_text, section)
        suggestions.extend(common)

        # 3. Generate AI suggestions if we don't have enough
        if len(suggestions) < 3 and protocol:
            ai_suggestions = await self._generate_ai_suggestions(
                question_text, section, protocol
            )
            suggestions.extend(ai_suggestions)

        # Deduplicate by text content
        seen_texts = set()
        unique_suggestions = []
        for s in suggestions:
            text_normalized = s.text.lower().strip()
            if text_normalized not in seen_texts:
                seen_texts.add(text_normalized)
                unique_suggestions.append(s)

        return unique_suggestions[:5]  # Max 5 suggestions

    async def _extract_from_document(
        self,
        question: str,
        document_text: str
    ) -> List[SuggestedAnswer]:
        """
        Extract potential answers from document context.

        Args:
            question: The question to find answers for
            document_text: The document text to search

        Returns:
            List of suggested answers extracted from the document
        """
        suggestions = []

        # Use a focused prompt to find relevant excerpts
        try:
            # Limit document text to avoid token limits
            doc_excerpt = document_text[:8000] if len(document_text) > 8000 else document_text

            response = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=500,
                messages=[{
                    "role": "user",
                    "content": f"""Find specific text from this document that answers the question. Return only direct quotes or close paraphrases.

Question: {question}

Document excerpt:
{doc_excerpt}

Return a JSON array of up to 2 relevant excerpts, each under 200 characters. If nothing relevant found, return empty array [].
Format: [{{"text": "excerpt here", "confidence": 0.8}}]

Return ONLY the JSON array, no other text."""
                }]
            )

            content = response.content[0].text.strip()
            # Try to parse JSON
            if content.startswith("["):
                excerpts = json.loads(content)
                for i, excerpt in enumerate(excerpts[:2]):
                    if isinstance(excerpt, dict) and excerpt.get("text"):
                        suggestions.append(SuggestedAnswer(
                            id=f"doc_{i}",
                            text=excerpt["text"],
                            source="document",
                            confidence=excerpt.get("confidence", 0.7)
                        ))
        except Exception as e:
            # Log but don't fail
            logger.warning(f"Document extraction failed: {e}")

        return suggestions

    def _get_common_answers(
        self,
        question: str,
        section: str
    ) -> List[SuggestedAnswer]:
        """
        Get common pre-defined answers based on question type.

        Args:
            question: The question text
            section: The protocol section

        Returns:
            List of common suggested answers matching the question type
        """
        question_lower = question.lower()

        # Check for specific question patterns
        if "sample size" in question_lower or "how many" in question_lower:
            return COMMON_ANSWERS.get("sample_size", [])[:2]

        if "duration" in question_lower or "how long" in question_lower:
            return COMMON_ANSWERS.get("study_duration", [])[:2]

        if "data collection" in question_lower or "collect data" in question_lower:
            return COMMON_ANSWERS.get("data_collection", [])[:2]

        if "confidential" in question_lower or "privacy" in question_lower:
            return COMMON_ANSWERS.get("confidentiality", [])[:2]

        if "risk" in question_lower and section == "risks":
            return COMMON_ANSWERS.get("minimal_risk", [])[:2]

        return []

    async def _generate_ai_suggestions(
        self,
        question: str,
        section: str,
        protocol: Dict[str, Any]
    ) -> List[SuggestedAnswer]:
        """
        Generate AI-powered suggestions based on protocol context.

        Args:
            question: The question to generate suggestions for
            section: The protocol section
            protocol: The extracted protocol data

        Returns:
            List of AI-generated suggested answers
        """
        suggestions = []

        try:
            # Build context from protocol
            protocol_context = self._build_protocol_context(protocol)

            response = await self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=400,
                messages=[{
                    "role": "user",
                    "content": f"""Based on this research protocol context, suggest 2 possible answers to the question.

Protocol context:
{protocol_context}

Question: {question}

Provide concise, professional answers appropriate for an IRB submission. Each answer should be self-contained and under 200 characters.

Return a JSON array: [{{"text": "answer 1"}}, {{"text": "answer 2"}}]
Return ONLY the JSON array."""
                }]
            )

            content = response.content[0].text.strip()
            if content.startswith("["):
                answers = json.loads(content)
                for i, ans in enumerate(answers[:2]):
                    if isinstance(ans, dict) and ans.get("text"):
                        suggestions.append(SuggestedAnswer(
                            id=f"ai_{i}",
                            text=ans["text"],
                            source="ai",
                            confidence=0.6
                        ))
        except Exception as e:
            logger.warning(f"AI suggestion generation failed: {e}")

        return suggestions

    def _build_protocol_context(self, protocol: Dict[str, Any]) -> str:
        """
        Build a concise context string from protocol data.

        Args:
            protocol: The extracted protocol dictionary

        Returns:
            A formatted string summarizing the protocol context
        """
        parts = []

        if protocol.get("title") or protocol.get("study_title"):
            title = protocol.get("title") or protocol.get("study_title")
            parts.append(f"Study: {title}")

        if protocol.get("study_type"):
            parts.append(f"Type: {protocol['study_type']}")

        if protocol.get("primary_objective"):
            parts.append(f"Objective: {protocol['primary_objective']}")
        elif protocol.get("objectives", {}).get("primary"):
            parts.append(f"Objective: {protocol['objectives']['primary']}")

        if protocol.get("methodology", {}).get("design"):
            parts.append(f"Design: {protocol['methodology']['design']}")

        if protocol.get("population", {}).get("description"):
            parts.append(f"Population: {protocol['population']['description']}")
        elif protocol.get("methodology", {}).get("population"):
            parts.append(f"Population: {protocol['methodology']['population']}")

        return "\n".join(parts) if parts else "No protocol context available"
