"""AI-powered Question Generator for natural language questionnaire questions.

This service uses LLMs to:
1. Generate natural, conversational questions
2. Provide contextual suggestions from knowledge base
3. Create follow-up questions based on answers
"""

import logging
from typing import Any, Dict, List, Optional
from uuid import UUID

from app.config import get_settings
from app.schemas.knowledge import (
    WizardQuestion,
    AnswerType,
    QuestionPriority,
    ContentType,
)
from app.services.llm.router import get_llm_router

logger = logging.getLogger(__name__)


# Prompt templates for question generation
QUESTION_GENERATION_PROMPT = """You are helping a researcher complete their IRB (Institutional Review Board) application.

Generate a clear, natural, conversational question to gather this information:

Field: {field_name}
Field description: {field_description}
Project type: {project_type}
Current context: {context}

Requirements:
- The question should be friendly and professional
- Avoid jargon unless necessary
- Be specific about what information is needed
- If this is a complex topic, break it down

Provide:
1. A natural language question (1-2 sentences)
2. Brief explanation of why this is needed (1 sentence)
3. An example answer if helpful

Format your response as:
QUESTION: [Your question here]
WHY: [Why this is needed]
EXAMPLE: [Optional example answer]
"""


SUGGESTION_EXTRACTION_PROMPT = """Given this research context and a specific question, suggest an answer if one can be reasonably inferred.

Context from documents:
{context}

Question: {question}
Field: {field_name}

If you can suggest an answer based on the context:
1. Provide the suggested answer
2. Quote the exact text you're basing it on
3. Rate your confidence (low/medium/high)

If you cannot suggest an answer, respond with: NO_SUGGESTION

Format:
SUGGESTION: [Your suggested answer]
EVIDENCE: [Exact quote from context]
CONFIDENCE: [low/medium/high]
"""


class QuestionGenerator:
    """Service for generating natural language questions using AI."""

    def __init__(self):
        """Initialize the question generator."""
        self.settings = get_settings()
        self._llm_router = None

    @property
    def llm_router(self):
        """Get LLM router lazily."""
        if self._llm_router is None:
            self._llm_router = get_llm_router()
        return self._llm_router

    async def generate_question(
        self,
        field_name: str,
        field_description: str,
        project_type: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        use_ai: bool = True
    ) -> WizardQuestion:
        """Generate a natural language question for a protocol field.

        Args:
            field_name: Name of the field (e.g., 'sample_size.total')
            field_description: Description of what information is needed
            project_type: Optional study type for context
            context: Optional context from knowledge base
            use_ai: Whether to use AI for question generation

        Returns:
            WizardQuestion with generated text
        """
        # Default question text from field name
        default_question = self._generate_default_question(field_name)
        default_why = self._generate_default_why(field_name)

        if not use_ai:
            return WizardQuestion(
                id=f"q_{field_name.replace('.', '_')}",
                question=default_question,
                why_needed=default_why,
                used_in_forms=["IRB Application"],
                answer_type=self._infer_answer_type(field_name),
                priority=self._infer_priority(field_name),
                section=self._infer_section(field_name),
                protocol_field=field_name,
            )

        # Use AI for more natural questions
        try:
            prompt = QUESTION_GENERATION_PROMPT.format(
                field_name=field_name,
                field_description=field_description,
                project_type=project_type or "general research",
                context=_summarize_context(context) if context else "No additional context",
            )

            response = await self.llm_router.generate(
                prompt=prompt,
                max_tokens=300,
                temperature=0.7,
            )

            question_text, why_needed, example = self._parse_question_response(response)

            return WizardQuestion(
                id=f"q_{field_name.replace('.', '_')}",
                question=question_text or default_question,
                why_needed=why_needed or default_why,
                used_in_forms=["IRB Application"],
                answer_type=self._infer_answer_type(field_name),
                priority=self._infer_priority(field_name),
                section=self._infer_section(field_name),
                protocol_field=field_name,
            )

        except Exception as e:
            logger.warning(f"AI question generation failed: {e}, using default")
            return WizardQuestion(
                id=f"q_{field_name.replace('.', '_')}",
                question=default_question,
                why_needed=default_why,
                used_in_forms=["IRB Application"],
                answer_type=self._infer_answer_type(field_name),
                priority=self._infer_priority(field_name),
                section=self._infer_section(field_name),
                protocol_field=field_name,
            )

    async def generate_suggestion(
        self,
        question: WizardQuestion,
        context_text: str
    ) -> Optional[Dict[str, Any]]:
        """Generate a suggested answer from context.

        Args:
            question: The question to suggest an answer for
            context_text: Context text from documents/knowledge base

        Returns:
            Dict with suggestion, evidence, confidence, or None
        """
        if not context_text or len(context_text.strip()) < 50:
            return None

        try:
            prompt = SUGGESTION_EXTRACTION_PROMPT.format(
                context=context_text[:3000],  # Limit context length
                question=question.question,
                field_name=question.protocol_field,
            )

            response = await self.llm_router.generate(
                prompt=prompt,
                max_tokens=200,
                temperature=0.3,  # Lower temperature for factual extraction
            )

            return self._parse_suggestion_response(response)

        except Exception as e:
            logger.warning(f"Suggestion generation failed: {e}")
            return None

    async def generate_batch(
        self,
        requirements: List[Dict[str, Any]],
        project_type: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
        use_ai: bool = False  # Default to non-AI for batch (faster)
    ) -> List[WizardQuestion]:
        """Generate questions for multiple requirements.

        Args:
            requirements: List of requirement dicts
            project_type: Optional study type
            context: Optional context
            use_ai: Whether to use AI (slower but better quality)

        Returns:
            List of WizardQuestion objects
        """
        questions = []

        for req in requirements:
            field_name = req.get("field", "")
            field_description = req.get("description", "")

            question = await self.generate_question(
                field_name=field_name,
                field_description=field_description,
                project_type=project_type,
                context=context,
                use_ai=use_ai,
            )

            # Apply requirement overrides
            if "answer_type" in req:
                question.answer_type = req["answer_type"]
            if "options" in req:
                question.options = req["options"]
            if "priority" in req:
                question.priority = req["priority"]
            if "forms" in req:
                question.used_in_forms = req["forms"]

            questions.append(question)

        return questions

    def _generate_default_question(self, field_name: str) -> str:
        """Generate default question from field name.

        Args:
            field_name: Protocol field name

        Returns:
            Question text
        """
        # Predefined questions for common fields
        default_questions = {
            "study_title": "What is the title of your research study?",
            "short_title": "What is a short title or acronym for your study?",
            "study_type": "What type of research study is this?",
            "principal_investigator.name": "Who is the Principal Investigator for this study?",
            "principal_investigator.email": "What is the PI's email address?",
            "principal_investigator.department": "What department is the PI in?",
            "primary_objective": "What is the primary objective of your study?",
            "secondary_objectives": "What are the secondary objectives?",
            "study_design": "Describe your study design.",
            "methodology_description": "Describe your research methodology.",
            "target_population": "Who is your target study population?",
            "sample_size.total": "What is your target sample size?",
            "sample_size.justification": "How did you determine this sample size?",
            "inclusion_criteria": "What are your inclusion criteria?",
            "exclusion_criteria": "What are your exclusion criteria?",
            "recruitment_methods": "How will you recruit participants?",
            "data_sources": "What are your data sources?",
            "confidentiality_measures": "How will you protect participant confidentiality?",
            "risks": "What are the potential risks to participants?",
            "benefits_to_subjects": "What are the potential benefits to participants?",
            "consent_type": "What type of consent will you obtain?",
        }

        if field_name in default_questions:
            return default_questions[field_name]

        # Generate from field name
        words = field_name.replace(".", " ").replace("_", " ")
        return f"What is the {words} for your study?"

    def _generate_default_why(self, field_name: str) -> str:
        """Generate default explanation of why info is needed.

        Args:
            field_name: Protocol field name

        Returns:
            Explanation text
        """
        section = self._infer_section(field_name)

        section_explanations = {
            "study_info": "Required for IRB application identification",
            "personnel": "Required for IRB reviewer contact",
            "objectives": "Helps IRB assess scientific merit",
            "methodology": "Required for IRB to evaluate study design",
            "population": "Required to assess participant protections",
            "recruitment": "Required to evaluate recruitment ethics",
            "procedures": "Required to assess participant burden",
            "risks": "Critical for IRB risk assessment",
            "privacy": "Required for data protection evaluation",
            "consent": "Required to ensure informed consent process",
            "regulatory": "Required for compliance verification",
            "funding": "Required for conflict of interest review",
        }

        return section_explanations.get(section, "Required for IRB application")

    def _infer_answer_type(self, field_name: str) -> AnswerType:
        """Infer answer type from field name.

        Args:
            field_name: Protocol field name

        Returns:
            Appropriate AnswerType
        """
        field_lower = field_name.lower()

        if "date" in field_lower:
            return AnswerType.DATE
        if "email" in field_lower:
            return AnswerType.TEXT
        if any(kw in field_lower for kw in ["size", "count", "number", "total"]):
            return AnswerType.NUMBER
        if any(kw in field_lower for kw in ["type", "phase"]):
            return AnswerType.SELECT
        if any(kw in field_lower for kw in ["populations", "methods", "sources"]):
            return AnswerType.MULTISELECT
        if any(kw in field_lower for kw in ["regulated", "applies", "radiation"]):
            return AnswerType.BOOLEAN
        if any(kw in field_lower for kw in [
            "description", "criteria", "measures", "process",
            "objective", "risks", "benefits", "procedures"
        ]):
            return AnswerType.TEXTAREA

        return AnswerType.TEXT

    def _infer_priority(self, field_name: str) -> QuestionPriority:
        """Infer priority from field name.

        Args:
            field_name: Protocol field name

        Returns:
            Appropriate QuestionPriority
        """
        required_fields = {
            "study_title", "study_type", "principal_investigator.name",
            "primary_objective", "study_design", "target_population",
            "sample_size.total", "inclusion_criteria", "exclusion_criteria",
            "risks", "benefits_to_subjects", "confidentiality_measures",
        }

        optional_fields = {
            "short_title", "hypotheses", "funding_type", "secondary_objectives",
        }

        if field_name in required_fields:
            return QuestionPriority.REQUIRED
        if field_name in optional_fields:
            return QuestionPriority.OPTIONAL
        return QuestionPriority.RECOMMENDED

    def _infer_section(self, field_name: str) -> str:
        """Infer section from field name.

        Args:
            field_name: Protocol field name

        Returns:
            Section key
        """
        field_lower = field_name.lower()

        if "investigator" in field_lower or "department" in field_lower:
            return "personnel"
        if "objective" in field_lower or "aim" in field_lower or "hypothesis" in field_lower:
            return "objectives"
        if "design" in field_lower or "methodology" in field_lower:
            return "methodology"
        if any(kw in field_lower for kw in ["population", "sample", "criteria", "vulnerable"]):
            return "population"
        if "recruitment" in field_lower:
            return "recruitment"
        if "procedure" in field_lower or "duration" in field_lower:
            return "procedures"
        if any(kw in field_lower for kw in ["risk", "benefit", "mitigation"]):
            return "risks"
        if any(kw in field_lower for kw in ["data", "privacy", "confidential", "hipaa", "storage"]):
            return "privacy"
        if "consent" in field_lower:
            return "consent"
        if any(kw in field_lower for kw in ["fda", "regulated", "radiation", "ind", "ide"]):
            return "regulatory"
        if "funding" in field_lower:
            return "funding"
        if any(kw in field_lower for kw in ["title", "date", "type"]):
            return "study_info"

        return "other"

    def _parse_question_response(self, response: str) -> tuple[Optional[str], Optional[str], Optional[str]]:
        """Parse AI response for question generation.

        Args:
            response: AI response text

        Returns:
            Tuple of (question, why_needed, example)
        """
        question = None
        why = None
        example = None

        lines = response.strip().split("\n")
        for line in lines:
            if line.startswith("QUESTION:"):
                question = line.replace("QUESTION:", "").strip()
            elif line.startswith("WHY:"):
                why = line.replace("WHY:", "").strip()
            elif line.startswith("EXAMPLE:"):
                example = line.replace("EXAMPLE:", "").strip()

        return question, why, example

    def _parse_suggestion_response(self, response: str) -> Optional[Dict[str, Any]]:
        """Parse AI response for suggestion extraction.

        Args:
            response: AI response text

        Returns:
            Dict with suggestion info or None
        """
        if "NO_SUGGESTION" in response.upper():
            return None

        suggestion = None
        evidence = None
        confidence = "medium"

        lines = response.strip().split("\n")
        for line in lines:
            if line.startswith("SUGGESTION:"):
                suggestion = line.replace("SUGGESTION:", "").strip()
            elif line.startswith("EVIDENCE:"):
                evidence = line.replace("EVIDENCE:", "").strip()
            elif line.startswith("CONFIDENCE:"):
                conf_str = line.replace("CONFIDENCE:", "").strip().lower()
                if conf_str in ["low", "medium", "high"]:
                    confidence = conf_str

        if suggestion:
            confidence_scores = {"low": 0.5, "medium": 0.7, "high": 0.9}
            return {
                "suggestion": suggestion,
                "evidence": evidence,
                "confidence": confidence_scores.get(confidence, 0.7),
            }

        return None


def _summarize_context(context: Dict[str, Any]) -> str:
    """Summarize context dict to string for prompt.

    Args:
        context: Context dictionary

    Returns:
        Summary string
    """
    parts = []

    if "study_title" in context:
        parts.append(f"Study: {context['study_title']}")
    if "study_type" in context:
        parts.append(f"Type: {context['study_type']}")
    if "primary_objective" in context:
        parts.append(f"Objective: {context['primary_objective']}")

    return "; ".join(parts) if parts else "No additional context"


def get_question_generator() -> QuestionGenerator:
    """Get a QuestionGenerator instance.

    Returns:
        QuestionGenerator instance
    """
    return QuestionGenerator()
