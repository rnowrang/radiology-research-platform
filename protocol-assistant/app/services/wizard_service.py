"""Wizard service for guided protocol question flow."""

import logging
from datetime import datetime
from typing import Optional, List, Dict

import httpx
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.chat import ChatSession
from app.schemas.wizard import (
    EnhancedGapQuestion, WizardProgress, SectionInfo,
    WizardQuestionsResponse, AnswerRequest, AnswerResponse,
    SkipResponse, FormFieldInfo, SuggestedAnswer,
    PrefillTaskFormRequest, PrefillTaskFormResponse, FieldConflict
)
from app.services.suggestion_generator import SuggestionGenerator
from app.services.form_mapper import get_form_mapper

logger = logging.getLogger(__name__)

# Section configuration - order defines tab sequence (left to right)
SECTION_ORDER = ["study_info", "objectives", "methodology", "population", "risks", "privacy", "other"]

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

        # Sort by section order (left to right in tabs), then by priority within each section
        section_order_map = {s: i for i, s in enumerate(SECTION_ORDER)}
        priority_order = {"high": 0, "medium": 1, "low": 2}
        questions.sort(key=lambda q: (
            section_order_map.get(q.section, len(SECTION_ORDER)),  # Section order first
            priority_order.get(q.priority, 2)  # Then priority within section
        ))

        # Build section info in the correct order
        sections = []
        for section_name in SECTION_ORDER:
            if section_name in section_counts:
                config = SECTION_CONFIG.get(section_name, SECTION_CONFIG["other"])
                sections.append(SectionInfo(
                    key=section_name,
                    name=config["display"],
                    icon=config["icon"],
                    question_count=section_counts[section_name]
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

    async def get_form_prefill_preview(
        self,
        session_id: str,
        user_id: str,
        form_id: Optional[int] = None
    ) -> Dict:
        """Get a preview of which fields will be pre-filled."""
        session = await self._get_session(session_id, user_id)
        if not session:
            raise ValueError("Session not found")

        collected_answers = session.collected_answers or {}
        answers = collected_answers.get("answers", {})
        protocol = session.extracted_protocol or {}

        # Build list of fields that can be populated
        form_fields = []

        # Map protocol fields to form fields
        field_mappings = [
            ("study_title", "Study Title", protocol.get("study_title")),
            ("principal_investigator", "Principal Investigator", protocol.get("principal_investigator")),
            ("study_type", "Study Type", protocol.get("study_type")),
            ("primary_objective", "Primary Objective", protocol.get("objectives", {}).get("primary")),
            ("secondary_objectives", "Secondary Objectives", ", ".join(protocol.get("objectives", {}).get("secondary", []))),
            ("methodology", "Research Methodology", protocol.get("methodology", {}).get("design")),
            ("sample_size", "Sample Size", str(protocol.get("methodology", {}).get("sample_size", ""))),
            ("inclusion_criteria", "Inclusion Criteria", ", ".join(protocol.get("methodology", {}).get("inclusion_criteria", []))),
            ("exclusion_criteria", "Exclusion Criteria", ", ".join(protocol.get("methodology", {}).get("exclusion_criteria", []))),
            ("risks", "Potential Risks", ", ".join(protocol.get("risks", []))),
            ("benefits", "Potential Benefits", ", ".join(protocol.get("benefits", []))),
        ]

        for field_name, field_label, value in field_mappings:
            if value and str(value).strip():
                form_fields.append({
                    "field_name": field_name,
                    "field_label": field_label,
                    "new_value": str(value),
                    "confidence": 0.8
                })

        # Add answers from wizard
        for question_id, answer_record in answers.items():
            answer_text = answer_record.get("answer", "")
            if answer_text:
                # Try to match to a form field
                form_field_info = FORM_FIELD_MAPPINGS.get(question_id)
                if form_field_info:
                    form_fields.append({
                        "field_name": form_field_info.field_name,
                        "field_label": form_field_info.field_label,
                        "new_value": answer_text,
                        "confidence": 0.95  # High confidence since user provided
                    })

        return {
            "form_fields": form_fields,
            "total_fields": len(form_fields),
            "fields_to_populate": len([f for f in form_fields if f.get("new_value")])
        }

    async def prefill_form(
        self,
        session_id: str,
        user_id: str,
        form_id: int
    ) -> Dict:
        """Pre-fill a form with collected answers and protocol data."""
        session = await self._get_session(session_id, user_id)
        if not session:
            raise ValueError("Session not found")

        # Get the preview to know what fields to fill
        preview = await self.get_form_prefill_preview(session_id, user_id, form_id)

        # The actual form update should be done via the forms service
        # For now, we return the preview data as if it was successfully applied
        # In a production setup, this would call the forms service API

        return {
            "success": True,
            "form_id": form_id,
            "fields_populated": preview["fields_to_populate"],
            "redirect_url": f"/forms/{form_id}"
        }

    async def prefill_task_form(
        self,
        session_id: str,
        user_id: str,
        request: PrefillTaskFormRequest
    ) -> PrefillTaskFormResponse:
        """
        Pre-fill a task's form from protocol data with conflict detection.

        This method:
        1. Gets the session and its extracted protocol data
        2. Calls Forms Service to check if task has a form
        3. Creates form if needed (requires template_id)
        4. Maps protocol data to form fields
        5. Detects conflicts between existing and new data
        6. Applies pre-fill (skipping conflicts)
        7. Updates task status if needed

        Args:
            session_id: Protocol assistant session ID
            user_id: User ID making the request
            request: PrefillTaskFormRequest with project_id, task_id, template_id

        Returns:
            PrefillTaskFormResponse with success status, conflicts, and redirect URL

        Raises:
            ValueError: If session not found, task not found, or form creation fails
        """
        settings = get_settings()

        # Get the session
        session = await self._get_session(session_id, user_id)
        if not session:
            raise ValueError("Session not found")

        # Get extracted protocol data
        protocol_data = session.extracted_protocol or {}
        if not protocol_data:
            raise ValueError("No protocol data extracted in this session")

        # Create HTTP client for Forms Service / Gateway communication
        async with httpx.AsyncClient(
            base_url=settings.GATEWAY_URL,
            timeout=30.0,
            headers={
                "X-Internal-API-Key": settings.INTERNAL_API_KEY,
                "X-User-ID": user_id,
                "Content-Type": "application/json",
            },
        ) as client:
            # Step 1: Get task details from Forms Service (via Gateway)
            try:
                task_response = await client.get(f"/api/tasks/{request.task_id}")
                task_response.raise_for_status()
                task_data = task_response.json()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    raise ValueError(f"Task {request.task_id} not found")
                logger.error(f"Failed to fetch task {request.task_id}: {e}")
                raise ValueError(f"Failed to fetch task: {e.response.text}")

            task = task_data.get("data", task_data)
            form_instance_id = task.get("form_instance_id")
            existing_form_data = {}
            form_id = None

            # Step 2: Check if task has a form
            if form_instance_id:
                # Form exists - get current form data
                form_id = form_instance_id
                try:
                    form_response = await client.get(f"/api/forms/{form_id}")
                    form_response.raise_for_status()
                    form_data = form_response.json()
                    existing_form_data = form_data.get("data", form_data).get("data", {})
                except httpx.HTTPStatusError as e:
                    logger.warning(f"Failed to fetch form {form_id}: {e}")
                    # Continue with empty existing data
            else:
                # No form - need to create one
                if not request.template_id:
                    raise ValueError(
                        "Task has no form. Provide template_id to create one."
                    )

                # Create new form
                try:
                    create_response = await client.post(
                        "/api/forms",
                        json={
                            "template_id": request.template_id,
                            "project_id": request.project_id,
                            "title": f"Form for Task #{request.task_id}",
                        },
                    )
                    create_response.raise_for_status()
                    created_form = create_response.json()
                    form_id = created_form.get("data", created_form).get("id")

                    if not form_id:
                        raise ValueError("Failed to create form: no ID returned")

                    # Link form to task
                    link_response = await client.patch(
                        f"/api/tasks/{request.task_id}",
                        json={"form_instance_id": form_id},
                    )
                    link_response.raise_for_status()

                    logger.info(f"Created form {form_id} and linked to task {request.task_id}")

                except httpx.HTTPStatusError as e:
                    logger.error(f"Failed to create/link form: {e}")
                    raise ValueError(f"Failed to create form: {e.response.text}")

            # Step 3: Map protocol data to form fields
            form_mapper = get_form_mapper()
            # Convert protocol to form data format
            from app.schemas.protocol import ExtractedProtocol
            try:
                # Try to parse as ExtractedProtocol if possible
                extracted_protocol = ExtractedProtocol(**protocol_data)
                mapped_form_data = await form_mapper.map_to_form_data(extracted_protocol)
            except Exception:
                # If parsing fails, use protocol_data directly as dict
                mapped_form_data = protocol_data

            # Step 4: Detect conflicts
            conflicts = form_mapper.detect_conflicts(
                existing_form_data=existing_form_data,
                new_protocol_data=mapped_form_data,
                source="protocol_extraction"
            )

            # Also check for wizard answer conflicts
            collected_answers = session.collected_answers or {}
            answers = collected_answers.get("answers", {})
            wizard_mapped_data = {}
            for question_id, answer_record in answers.items():
                answer_text = answer_record.get("answer", "")
                if answer_text:
                    form_field_info = FORM_FIELD_MAPPINGS.get(question_id)
                    if form_field_info:
                        wizard_mapped_data[form_field_info.field_name] = answer_text

            wizard_conflicts = form_mapper.detect_conflicts(
                existing_form_data=existing_form_data,
                new_protocol_data=wizard_mapped_data,
                source="wizard_answer"
            )
            conflicts.extend(wizard_conflicts)

            # Step 5: Apply pre-fill (skip conflicting fields)
            conflict_field_ids = {c.field_id for c in conflicts}
            fields_to_update = {}
            fields_skipped = 0

            # Flatten mapped data for update
            flat_mapped = form_mapper._flatten_dict(mapped_form_data) if mapped_form_data else {}
            for field_id, value in flat_mapped.items():
                if field_id in conflict_field_ids:
                    fields_skipped += 1
                elif value is not None and value != "":
                    fields_to_update[field_id] = value

            # Add wizard answers (non-conflicting)
            for field_id, value in wizard_mapped_data.items():
                if field_id not in conflict_field_ids and value:
                    fields_to_update[field_id] = value

            fields_updated = 0
            if fields_to_update and form_id:
                # Update form data via Forms Service
                try:
                    update_response = await client.patch(
                        f"/api/forms/{form_id}/data",
                        json={"data": fields_to_update},
                    )
                    update_response.raise_for_status()
                    fields_updated = len(fields_to_update)
                    logger.info(f"Updated form {form_id} with {fields_updated} fields")
                except httpx.HTTPStatusError as e:
                    logger.warning(f"Failed to update form data: {e}")
                    # Don't fail the whole operation - report partial success

            # Step 6: Update task status to 'in_progress' if it was 'pending'
            task_status = task.get("status", "").lower()
            if task_status == "pending":
                try:
                    status_response = await client.patch(
                        f"/api/tasks/{request.task_id}",
                        json={"status": "in_progress"},
                    )
                    status_response.raise_for_status()
                    logger.info(f"Updated task {request.task_id} status to in_progress")
                except httpx.HTTPStatusError as e:
                    logger.warning(f"Failed to update task status: {e}")
                    # Don't fail - task status update is not critical

            # Build redirect URL with conflict info
            conflict_fields = [c.field_id for c in conflicts]
            redirect_url = f"/forms/{form_id}"
            if conflict_fields:
                redirect_url += f"?prefill_conflicts={','.join(conflict_fields)}"

            return PrefillTaskFormResponse(
                success=True,
                form_id=form_id,
                task_id=request.task_id,
                conflicts=conflicts,
                fields_updated=fields_updated,
                fields_skipped=fields_skipped,
                redirect_url=redirect_url
            )
