"""Wizard service for guided protocol question flow."""

import json
import logging
from datetime import datetime
from typing import Optional, List, Dict
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatSession
from app.schemas.wizard import (
    EnhancedGapQuestion, WizardProgress, SectionInfo,
    WizardQuestionsResponse, AnswerRequest, AnswerResponse,
    SkipResponse, FormFieldInfo, SuggestedAnswer
)
from app.services.suggestion_generator import SuggestionGenerator

logger = logging.getLogger(__name__)

# Section configuration
SECTION_CONFIG = {
    "study_info": {"icon": "clipboard", "display": "Study Information"},
    "objectives": {"icon": "target", "display": "Objectives"},
    "methodology": {"icon": "flask", "display": "Methodology"},
    "population": {"icon": "users", "display": "Study Population"},
    "risks": {"icon": "alert-triangle", "display": "Risks & Benefits"},
    "privacy": {"icon": "lock", "display": "Privacy & Data"},
    "other": {"icon": "file-text", "display": "Other"}
}

# Form field mappings - maps gap questions to IRB form fields
FORM_FIELD_MAPPINGS = {
    "sample_size": FormFieldInfo(
        form_type="irb_initial",
        section="methodology",
        field_name="sample_size",
        field_label="Sample Size"
    ),
    "inclusion_criteria": FormFieldInfo(
        form_type="irb_initial",
        section="population",
        field_name="inclusion_criteria",
        field_label="Inclusion Criteria"
    ),
    "exclusion_criteria": FormFieldInfo(
        form_type="irb_initial",
        section="population",
        field_name="exclusion_criteria",
        field_label="Exclusion Criteria"
    ),
    "primary_objective": FormFieldInfo(
        form_type="irb_initial",
        section="objectives",
        field_name="primary_objective",
        field_label="Primary Objective"
    ),
    "data_collection": FormFieldInfo(
        form_type="irb_initial",
        section="methodology",
        field_name="data_collection_methods",
        field_label="Data Collection Methods"
    ),
    "risks": FormFieldInfo(
        form_type="irb_initial",
        section="risks",
        field_name="potential_risks",
        field_label="Potential Risks"
    ),
    "benefits": FormFieldInfo(
        form_type="irb_initial",
        section="risks",
        field_name="potential_benefits",
        field_label="Potential Benefits"
    ),
    "confidentiality": FormFieldInfo(
        form_type="irb_initial",
        section="privacy",
        field_name="confidentiality_measures",
        field_label="Confidentiality Measures"
    ),
}


class WizardService:
    """Service for managing the guided wizard question flow."""

    def __init__(self, db: AsyncSession):
        """
        Initialize the wizard service.

        Args:
            db: Async database session
        """
        self.db = db

    def _categorize_question(self, question: str, field: Optional[str] = None) -> str:
        """Categorize a question into a section based on keywords."""
        question_lower = question.lower()

        if any(kw in question_lower for kw in ["sample size", "participants", "subjects", "enrollment"]):
            return "population"
        if any(kw in question_lower for kw in ["inclusion", "exclusion", "eligibility", "criteria"]):
            return "population"
        if any(kw in question_lower for kw in ["objective", "aim", "goal", "purpose", "hypothesis"]):
            return "objectives"
        if any(kw in question_lower for kw in ["method", "procedure", "design", "protocol", "intervention"]):
            return "methodology"
        if any(kw in question_lower for kw in ["risk", "harm", "adverse", "safety"]):
            return "risks"
        if any(kw in question_lower for kw in ["benefit", "advantage"]):
            return "risks"
        if any(kw in question_lower for kw in ["privacy", "confidential", "data", "storage", "security"]):
            return "privacy"
        if any(kw in question_lower for kw in ["title", "investigator", "sponsor", "funding"]):
            return "study_info"

        return "other"

    def _determine_priority(self, question: str, section: str) -> str:
        """Determine question priority."""
        question_lower = question.lower()

        # High priority questions
        if any(kw in question_lower for kw in ["sample size", "primary", "main risk", "inclusion criteria"]):
            return "high"

        # Section-based priority
        if section in ["methodology", "risks"]:
            return "high"
        if section in ["population", "objectives"]:
            return "medium"

        return "low"

    def _generate_rationale(self, question: str, section: str) -> str:
        """Generate rationale for why this question is needed."""
        rationales = {
            "population": "IRB requires clear definition of who can participate in your study.",
            "methodology": "Understanding your methods helps ensure the study design is sound and ethical.",
            "risks": "IRB must assess potential risks to participants for approval.",
            "objectives": "Clear objectives help IRB understand the scientific value of your research.",
            "privacy": "Data protection measures are required for regulatory compliance.",
            "study_info": "Basic study information is required for all IRB submissions.",
            "other": "This information helps complete your protocol documentation."
        }
        return rationales.get(section, rationales["other"])

    def _get_form_field_mapping(self, question: str) -> Optional[FormFieldInfo]:
        """Get the IRB form field that this question maps to."""
        question_lower = question.lower()

        for key, field_info in FORM_FIELD_MAPPINGS.items():
            if key.replace("_", " ") in question_lower:
                return field_info

        return None

    async def _get_session(self, session_id: str, user_id: str) -> Optional[ChatSession]:
        """Get a session by ID and verify user access."""
        from sqlalchemy import select

        try:
            session_uuid = UUID(session_id)
            user_uuid = UUID(user_id)
        except ValueError:
            return None

        result = await self.db.execute(
            select(ChatSession).where(
                ChatSession.id == session_uuid,
                ChatSession.user_id == user_uuid
            )
        )
        return result.scalar_one_or_none()

    async def _update_session_answers(
        self,
        session_id: str,
        user_id: str,
        collected_answers: dict
    ) -> bool:
        """Update the collected_answers for a session."""
        try:
            session_uuid = UUID(session_id)
            user_uuid = UUID(user_id)
        except ValueError:
            return False

        result = await self.db.execute(
            update(ChatSession)
            .where(
                ChatSession.id == session_uuid,
                ChatSession.user_id == user_uuid
            )
            .values(
                collected_answers=collected_answers,
                updated_at=datetime.utcnow()
            )
        )
        await self.db.commit()
        return result.rowcount > 0

    async def get_wizard_questions(
        self,
        session_id: str,
        user_id: str
    ) -> WizardQuestionsResponse:
        """Get enhanced gap questions for the wizard."""
        # Get the session
        session = await self._get_session(session_id, user_id)
        if not session:
            raise ValueError("Session not found")

        # Get gap analysis from session
        gaps = session.current_gaps or []
        collected_answers = session.collected_answers or {}

        # Transform gaps to enhanced questions
        questions: List[EnhancedGapQuestion] = []
        section_counts: Dict[str, int] = {}

        for i, gap in enumerate(gaps):
            gap_id = gap.get("id", f"gap_{i}")
            question_text = gap.get("question", gap.get("description", ""))

            # Categorize and prioritize
            section = self._categorize_question(question_text, gap.get("field"))
            priority = self._determine_priority(question_text, section)

            # Check if already answered
            answers_dict = collected_answers.get("answers", {})
            answer_record = answers_dict.get(gap_id)
            skipped_list = collected_answers.get("skipped", [])

            enhanced = EnhancedGapQuestion(
                id=gap_id,
                question=question_text,
                section=section,
                priority=priority,
                rationale=self._generate_rationale(question_text, section),
                suggested_answers=[],  # Will be populated by suggestion generator
                extracted_value=gap.get("current_value"),
                extracted_confidence=gap.get("confidence"),
                form_field=self._get_form_field_mapping(question_text),
                average_time_seconds=90 if priority == "high" else 60,
                answered=answer_record is not None,
                skipped=gap_id in skipped_list
            )
            questions.append(enhanced)

            # Count by section
            section_counts[section] = section_counts.get(section, 0) + 1

        # Sort by priority (high first) then by section
        priority_order = {"high": 0, "medium": 1, "low": 2}
        questions.sort(key=lambda q: (priority_order.get(q.priority, 2), q.section))

        # Build section info
        sections = []
        for section_name, count in section_counts.items():
            config = SECTION_CONFIG.get(section_name, SECTION_CONFIG["other"])
            sections.append(SectionInfo(
                name=config["display"],
                icon=config["icon"],
                question_count=count
            ))

        # Calculate estimated time
        total_seconds = sum(q.average_time_seconds for q in questions if not q.answered and not q.skipped)
        total_minutes = max(1, total_seconds // 60)

        return WizardQuestionsResponse(
            questions=questions,
            sections=sections,
            total_estimated_minutes=total_minutes
        )

    async def submit_answer(
        self,
        session_id: str,
        user_id: str,
        question_id: str,
        answer: AnswerRequest
    ) -> AnswerResponse:
        """Submit an answer to a wizard question."""
        # Get current session
        session = await self._get_session(session_id, user_id)
        if not session:
            raise ValueError("Session not found")

        # Update collected answers
        collected_answers = session.collected_answers or {}
        if "_wizard" not in collected_answers:
            collected_answers["_wizard"] = {
                "active": True,
                "started_at": datetime.utcnow().isoformat(),
                "current_index": 0
            }
        if "answers" not in collected_answers:
            collected_answers["answers"] = {}

        # Record the answer
        collected_answers["answers"][question_id] = {
            "answer": answer.answer,
            "source": answer.source.value,
            "timestamp": datetime.utcnow().isoformat()
        }

        # Remove from skipped if it was skipped before
        if "skipped" in collected_answers and question_id in collected_answers["skipped"]:
            collected_answers["skipped"].remove(question_id)

        # Update last activity
        collected_answers["_wizard"]["last_activity_at"] = datetime.utcnow().isoformat()

        # Save to session
        await self._update_session_answers(session_id, user_id, collected_answers)

        # Get progress
        progress = await self.get_progress(session_id, user_id)

        # Get next question
        questions_response = await self.get_wizard_questions(session_id, user_id)
        current_idx = collected_answers["_wizard"].get("current_index", 0)
        next_idx = current_idx + 1
        next_question_id = None

        if next_idx < len(questions_response.questions):
            collected_answers["_wizard"]["current_index"] = next_idx
            await self._update_session_answers(session_id, user_id, collected_answers)
            next_question_id = questions_response.questions[next_idx].id

        return AnswerResponse(
            success=True,
            updated_protocol=session.extracted_protocol,
            next_question_id=next_question_id,
            progress=progress
        )

    async def skip_question(
        self,
        session_id: str,
        user_id: str,
        question_id: str
    ) -> SkipResponse:
        """Skip a wizard question."""
        session = await self._get_session(session_id, user_id)
        if not session:
            raise ValueError("Session not found")

        collected_answers = session.collected_answers or {}
        if "_wizard" not in collected_answers:
            collected_answers["_wizard"] = {
                "active": True,
                "started_at": datetime.utcnow().isoformat(),
                "current_index": 0
            }
        if "skipped" not in collected_answers:
            collected_answers["skipped"] = []

        # Add to skipped list
        if question_id not in collected_answers["skipped"]:
            collected_answers["skipped"].append(question_id)

        # Update last activity
        collected_answers["_wizard"]["last_activity_at"] = datetime.utcnow().isoformat()

        # Save to session
        await self._update_session_answers(session_id, user_id, collected_answers)

        # Get progress
        progress = await self.get_progress(session_id, user_id)

        # Get next question
        questions_response = await self.get_wizard_questions(session_id, user_id)
        current_idx = collected_answers["_wizard"].get("current_index", 0)
        next_idx = current_idx + 1
        next_question_id = None

        if next_idx < len(questions_response.questions):
            collected_answers["_wizard"]["current_index"] = next_idx
            await self._update_session_answers(session_id, user_id, collected_answers)
            next_question_id = questions_response.questions[next_idx].id

        return SkipResponse(
            success=True,
            next_question_id=next_question_id,
            progress=progress
        )

    async def get_progress(
        self,
        session_id: str,
        user_id: str
    ) -> WizardProgress:
        """Get current wizard progress."""
        session = await self._get_session(session_id, user_id)
        if not session:
            raise ValueError("Session not found")

        collected_answers = session.collected_answers or {}
        answers = collected_answers.get("answers", {})
        skipped = collected_answers.get("skipped", [])
        wizard_state = collected_answers.get("_wizard", {})

        # Get questions to calculate totals
        questions_response = await self.get_wizard_questions(session_id, user_id)
        questions = questions_response.questions

        total = len(questions)
        answered = len(answers)
        skipped_count = len(skipped)
        current_index = wizard_state.get("current_index", 0)

        # Calculate section progress
        sections_progress = {}
        for q in questions:
            section = q.section
            if section not in sections_progress:
                sections_progress[section] = {"total": 0, "answered": 0}
            sections_progress[section]["total"] += 1
            if q.answered:
                sections_progress[section]["answered"] += 1

        # Calculate remaining time
        remaining_questions = [q for q in questions if not q.answered and not q.skipped]
        remaining_seconds = sum(q.average_time_seconds for q in remaining_questions)
        remaining_minutes = max(0, remaining_seconds // 60)

        # Calculate percent complete
        completed = answered + skipped_count
        percent = (completed / total * 100) if total > 0 else 0

        return WizardProgress(
            total_questions=total,
            answered_count=answered,
            skipped_count=skipped_count,
            current_index=current_index,
            sections_progress=sections_progress,
            estimated_remaining_minutes=remaining_minutes,
            percent_complete=round(percent, 1)
        )

    async def get_suggestions(
        self,
        session_id: str,
        user_id: str,
        question_id: str
    ) -> List[SuggestedAnswer]:
        """Get AI-generated suggestions for a specific question."""
        session = await self._get_session(session_id, user_id)
        if not session:
            raise ValueError("Session not found")

        # Get the specific question
        questions_response = await self.get_wizard_questions(session_id, user_id)
        question = None
        for q in questions_response.questions:
            if q.id == question_id:
                question = q
                break

        if not question:
            raise ValueError(f"Question not found: {question_id}")

        # Use suggestion generator
        generator = SuggestionGenerator()
        try:
            suggestions = await generator.generate(
                question_id=question_id,
                question_text=question.question,
                section=question.section,
                protocol=session.extracted_protocol,
                document_text=None  # Could fetch from session if needed
            )
            return suggestions
        except Exception as e:
            logger.error(f"Failed to generate suggestions: {e}")
            # Return empty list on error - don't fail the whole request
            return []
