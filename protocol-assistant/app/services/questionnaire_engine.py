"""Questionnaire Engine for unified project questionnaire generation.

This engine:
1. Analyzes all tasks/forms in a project
2. Identifies unique information requirements
3. Deduplicates across forms
4. Applies smart filtering by project type
5. Generates a unified questionnaire covering all project needs
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Set, Tuple
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas.knowledge import (
    StudyType,
    AnswerType,
    QuestionPriority,
    WizardQuestion,
    QuestionnaireSection,
    QuestionnaireSpec,
    QuestionnaireProgress,
)
from app.services.knowledge_base import get_knowledge_base_service

logger = logging.getLogger(__name__)


# Section configuration for questionnaire organization
SECTION_CONFIG = {
    "study_info": {
        "name": "Study Information",
        "icon": "clipboard",
        "order": 1,
    },
    "personnel": {
        "name": "Personnel",
        "icon": "users",
        "order": 2,
    },
    "objectives": {
        "name": "Objectives & Aims",
        "icon": "target",
        "order": 3,
    },
    "methodology": {
        "name": "Methodology",
        "icon": "flask",
        "order": 4,
    },
    "population": {
        "name": "Study Population",
        "icon": "user-check",
        "order": 5,
    },
    "recruitment": {
        "name": "Recruitment",
        "icon": "megaphone",
        "order": 6,
    },
    "procedures": {
        "name": "Procedures",
        "icon": "clipboard-list",
        "order": 7,
    },
    "risks": {
        "name": "Risks & Benefits",
        "icon": "alert-triangle",
        "order": 8,
    },
    "privacy": {
        "name": "Privacy & Data",
        "icon": "lock",
        "order": 9,
    },
    "consent": {
        "name": "Consent",
        "icon": "file-signature",
        "order": 10,
    },
    "regulatory": {
        "name": "Regulatory",
        "icon": "shield",
        "order": 11,
    },
    "funding": {
        "name": "Funding",
        "icon": "dollar-sign",
        "order": 12,
    },
    "other": {
        "name": "Additional Information",
        "icon": "file-text",
        "order": 99,
    },
}


# Project type filters - which sections to skip or auto-fill
PROJECT_TYPE_FILTERS = {
    StudyType.RETROSPECTIVE: {
        "skip_sections": ["recruitment", "consent", "procedures"],
        "auto_answers": {
            "consent_type": "waiver",
        },
        "notes": "Retrospective studies typically use consent waiver"
    },
    StudyType.PROSPECTIVE: {
        "required_sections": ["recruitment", "consent", "procedures"],
    },
    StudyType.CLINICAL_TRIAL: {
        "required_sections": ["regulatory", "procedures", "consent"],
        "required_fields": ["study_phase", "fda_regulated"],
    },
    StudyType.QUALITY_IMPROVEMENT: {
        "skip_sections": ["regulatory"],
        "notes": "QI projects may be exempt from full IRB review"
    },
}


# Universal requirements - maps protocol fields to form needs
UNIVERSAL_REQUIREMENTS = [
    # Study Information
    {
        "field": "study_title",
        "section": "study_info",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application", "Grant Application", "Abstract"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "short_title",
        "section": "study_info",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "study_type",
        "section": "study_info",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.SELECT,
        "options": [t.value for t in StudyType],
    },
    # Personnel
    {
        "field": "principal_investigator.name",
        "section": "personnel",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application", "Grant Application"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "principal_investigator.email",
        "section": "personnel",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
        "validation": r"^[\w\.-]+@[\w\.-]+\.\w+$",
    },
    {
        "field": "principal_investigator.department",
        "section": "personnel",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "department",
        "section": "personnel",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
    },
    # Objectives
    {
        "field": "primary_objective",
        "section": "objectives",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application", "Grant Application", "Abstract"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "secondary_objectives",
        "section": "objectives",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["Grant Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "specific_aims",
        "section": "objectives",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["Grant Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "hypotheses",
        "section": "objectives",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["Grant Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    # Methodology
    {
        "field": "study_design",
        "section": "methodology",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application", "Grant Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "methodology_description",
        "section": "methodology",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    # Population
    {
        "field": "target_population",
        "section": "population",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "sample_size.total",
        "section": "population",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application", "Grant Application"],
        "answer_type": AnswerType.NUMBER,
    },
    {
        "field": "sample_size.justification",
        "section": "population",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application", "Grant Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "inclusion_criteria",
        "section": "population",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "exclusion_criteria",
        "section": "population",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "vulnerable_populations",
        "section": "population",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.MULTISELECT,
        "options": ["Minors", "Pregnant Women", "Prisoners", "Cognitively Impaired", "Economically Disadvantaged", "None"],
    },
    # Recruitment (skip for retrospective)
    {
        "field": "recruitment_methods",
        "section": "recruitment",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "recruitment_locations",
        "section": "recruitment",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    # Procedures
    {
        "field": "study_procedures",
        "section": "procedures",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "duration_per_subject",
        "section": "procedures",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    # Data
    {
        "field": "data_sources",
        "section": "privacy",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "data_variables",
        "section": "privacy",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "confidentiality_measures",
        "section": "privacy",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "data_storage",
        "section": "privacy",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "hipaa_applies",
        "section": "privacy",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    # Risks & Benefits
    {
        "field": "risks",
        "section": "risks",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "benefits_to_subjects",
        "section": "risks",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "benefits_to_society",
        "section": "risks",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "risk_mitigation",
        "section": "risks",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    # Consent
    {
        "field": "consent_type",
        "section": "consent",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.SELECT,
        "options": ["written", "verbal", "waiver", "assent"],
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "consent_process",
        "section": "consent",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    # Regulatory
    {
        "field": "fda_regulated",
        "section": "regulatory",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    {
        "field": "ionizing_radiation",
        "section": "regulatory",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    # Funding
    {
        "field": "funding_source",
        "section": "funding",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application", "Grant Application"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "funding_type",
        "section": "funding",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.SELECT,
        "options": ["intramural", "extramural", "federal", "industry", "foundation", "unfunded"],
    },
    # Timeline
    {
        "field": "start_date",
        "section": "study_info",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.DATE,
    },
    {
        "field": "end_date",
        "section": "study_info",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.DATE,
    },
    # =========================================================================
    # HIGH-IMPACT QUESTIONS - Added to improve form fill rate
    # =========================================================================
    # Contact Person Information (fills 5 form fields)
    {
        "field": "contact_person.name",
        "section": "personnel",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "contact_person.building_room",
        "section": "personnel",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "contact_person.phone_ext",
        "section": "personnel",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "contact_person.fax",
        "section": "personnel",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "contact_person.email",
        "section": "personnel",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
        "validation": r"^[\w\.-]+@[\w\.-]+\.\w+$",
    },
    # Research Personnel (fills 2 form fields)
    {
        "field": "research_personnel",
        "section": "personnel",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    {
        "field": "other_personnel",
        "section": "personnel",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
    },
    # Study Initiation (fills 2 form fields)
    {
        "field": "study_initiated_by",
        "section": "study_info",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.SELECT,
        "options": ["local", "industry", "cooperative_group", "federal", "other"],
    },
    # Recruitment Methods (fills 6 form fields)
    {
        "field": "recruitment_source",
        "section": "recruitment",
        "priority": QuestionPriority.REQUIRED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.MULTISELECT,
        "options": ["medical_records", "clinic_patients", "referrals", "advertisements", "community", "other"],
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "recruitment_uses_flyers",
        "section": "recruitment",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "recruitment_uses_phone",
        "section": "recruitment",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "recruitment_uses_electronic",
        "section": "recruitment",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "recruitment_electronic_description",
        "section": "recruitment",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    # Consent Logistics (fills 4 form fields)
    {
        "field": "consent_location",
        "section": "consent",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "consent_timing",
        "section": "consent",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.SELECT,
        "options": ["before_procedures", "same_day", "during_procedures"],
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "subject_payment",
        "section": "consent",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXTAREA,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
    {
        "field": "consent_waiver_requested",
        "section": "consent",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    # Student Project (fills 3 form fields)
    {
        "field": "is_student_project",
        "section": "study_info",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    {
        "field": "student_name",
        "section": "study_info",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
    },
    {
        "field": "student_program",
        "section": "study_info",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
    },
    # Regulatory - Schedule Drugs (fills 2 form fields)
    {
        "field": "schedule_drugs",
        "section": "regulatory",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    # Regulatory - Biosafety/IBC (fills 3 form fields)
    {
        "field": "ibc_infectious_agents",
        "section": "regulatory",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    {
        "field": "ibc_recombinant_dna",
        "section": "regulatory",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    {
        "field": "ibc_hazardous_materials",
        "section": "regulatory",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    # Regulatory - SCRO (fills 1 form field)
    {
        "field": "scro_stem_cells",
        "section": "regulatory",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    # Privacy - PHI Sharing (fills 3 form fields)
    {
        "field": "phi_shared_externally",
        "section": "privacy",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.BOOLEAN,
    },
    {
        "field": "phi_shared_with",
        "section": "privacy",
        "priority": QuestionPriority.OPTIONAL,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.MULTISELECT,
        "options": ["sponsor", "other_institutions", "government", "data_repository", "other"],
    },
    # Methods - Study Location (fills 1 form field)
    {
        "field": "study_location",
        "section": "procedures",
        "priority": QuestionPriority.RECOMMENDED,
        "forms": ["IRB Application"],
        "answer_type": AnswerType.TEXT,
        "skip_for": [StudyType.RETROSPECTIVE],
    },
]


class QuestionnaireEngine:
    """Engine for generating unified project questionnaires."""

    def __init__(self, db: AsyncSession):
        """Initialize the questionnaire engine.

        Args:
            db: Async database session
        """
        self.db = db
        self.settings = get_settings()
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client for gateway communication."""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(
                base_url=self.settings.GATEWAY_URL,
                timeout=30.0,
                headers={
                    "X-Internal-API-Key": self.settings.INTERNAL_API_KEY,
                },
            )
        return self._http_client

    async def close(self):
        """Close HTTP client."""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()

    async def analyze_project(
        self,
        project_id: UUID,
        project_type: Optional[StudyType] = None
    ) -> QuestionnaireSpec:
        """Analyze a project and generate questionnaire specification.

        This method:
        1. Gets all tasks for the project
        2. Identifies associated form templates
        3. Extracts unique information requirements
        4. Applies project type filtering
        5. Returns organized questionnaire spec

        Args:
            project_id: UUID of the project
            project_type: Optional study type for filtering

        Returns:
            QuestionnaireSpec with sections and questions
        """
        # Get project tasks and their form templates
        form_fields = await self._get_project_form_fields(project_id)

        logger.debug(f"Analyzing project with study type: {project_type}")

        # Get unique requirements from universal list
        requirements = self._get_filtered_requirements(project_type)

        # Build sections with questions
        sections_dict: Dict[str, List[WizardQuestion]] = {}

        for req in requirements:
            section_key = req["section"]
            if section_key not in sections_dict:
                sections_dict[section_key] = []

            question = WizardQuestion(
                id=f"q_{req['field'].replace('.', '_')}",
                question=self._generate_question_text(req),
                why_needed=self._generate_why_needed(req),
                used_in_forms=req.get("forms", []),
                answer_type=req.get("answer_type", AnswerType.TEXT),
                options=req.get("options"),
                validation_pattern=req.get("validation"),
                priority=req.get("priority", QuestionPriority.RECOMMENDED),
                section=section_key,
                protocol_field=req["field"],
                estimated_time_seconds=self._estimate_time(req),
            )
            sections_dict[section_key].append(question)

        # Build ordered sections
        sections = []
        for section_key, questions in sections_dict.items():
            config = SECTION_CONFIG.get(section_key, SECTION_CONFIG["other"])
            sections.append(QuestionnaireSection(
                key=section_key,
                name=config["name"],
                icon=config["icon"],
                questions=questions,
                total_count=len(questions),
            ))

        # Sort sections by order
        sections.sort(key=lambda s: SECTION_CONFIG.get(s.key, {}).get("order", 99))

        total_questions = sum(len(s.questions) for s in sections)
        estimated_minutes = max(1, total_questions * 60 // 60)  # ~60 seconds per question

        return QuestionnaireSpec(
            project_id=project_id,
            project_type=project_type,
            sections=sections,
            total_questions=total_questions,
            estimated_minutes=estimated_minutes,
        )

    async def get_questionnaire(
        self,
        project_id: UUID,
        user_id: str
    ) -> QuestionnaireSpec:
        """Get questionnaire for a project, applying knowledge base data.

        Args:
            project_id: UUID of the project
            user_id: User ID for context

        Returns:
            QuestionnaireSpec with suggestions from knowledge base
        """
        # Get or create knowledge base
        kb_service = get_knowledge_base_service(self.db)
        kb = await kb_service.get_or_create(project_id)
        kb_id = kb["id"]

        # Always try to seed from project data - will only add facts that don't exist
        await self._seed_kb_from_project(kb_id, project_id, user_id, kb_service)

        # Detect project type from knowledge base (check facts and wizard answers)
        project_type = None
        study_type_value = await kb_service.get_fact_value(kb_id, "study_type")

        # Also check wizard answers if fact not found
        if not study_type_value:
            wizard_answers = await kb_service.get_wizard_answers(kb_id)
            study_type_answer = wizard_answers.get("q_study_type", {})
            if isinstance(study_type_answer, dict):
                study_type_value = study_type_answer.get("answer")
            elif isinstance(study_type_answer, str):
                study_type_value = study_type_answer

        if study_type_value:
            try:
                project_type = StudyType(study_type_value)
                logger.info(f"Detected study type: {project_type} for project {project_id}")
            except ValueError:
                logger.warning(f"Unknown study type value: {study_type_value}")

        # Generate base questionnaire
        spec = await self.analyze_project(project_id, project_type)

        # Apply suggestions from knowledge base
        facts = await kb_service.get_facts(kb_id)
        fact_dict = {f.key: f for f in facts}

        wizard_answers = await kb_service.get_wizard_answers(kb_id)

        # Fallback key mappings for legacy/alternative fact keys
        # Maps protocol_field -> list of alternative fact keys to try
        field_fallbacks = {
            "principal_investigator.name": ["principal_investigator", "pi_name"],
            "sample_size.total": ["sample_size", "total_sample_size", "n_subjects"],
            "sample_size.justification": ["sample_size_justification"],
            "benefits_to_subjects": ["benefits", "subject_benefits"],
            "benefits_to_society": ["benefits", "societal_benefits"],
            "duration_per_subject": ["data_collection_timeline", "study_duration"],
            "methodology_description": ["study_design", "methods"],
        }

        def find_fact(field: str) -> Optional[any]:
            """Find a fact by field name, trying fallbacks if needed."""
            if field in fact_dict:
                return fact_dict[field]
            # Try fallback keys
            for alt_key in field_fallbacks.get(field, []):
                if alt_key in fact_dict:
                    return fact_dict[alt_key]
            return None

        # Update questions with suggestions and answered status
        for section in spec.sections:
            completed = 0
            for question in section.questions:
                # Check if already answered
                if question.protocol_field in wizard_answers:
                    answer_record = wizard_answers[question.protocol_field]
                    question.suggested_answer = str(answer_record.get("answer", ""))
                    question.suggestion_source = "Previously answered"
                    question.suggestion_confidence = 0.95
                    completed += 1
                # Check if fact exists (with fallback support)
                else:
                    fact = find_fact(question.protocol_field)
                    if fact:
                        question.suggested_answer = str(fact.value)
                        question.suggestion_source = f"Extracted ({fact.source_reference or fact.source.value})"
                        question.suggestion_confidence = fact.confidence

            section.completed_count = completed

        return spec

    async def get_progress(
        self,
        project_id: UUID
    ) -> QuestionnaireProgress:
        """Get questionnaire progress for a project.

        Args:
            project_id: UUID of the project

        Returns:
            QuestionnaireProgress with counts and percentages
        """
        # Get knowledge base
        kb_service = get_knowledge_base_service(self.db)
        kb = await kb_service.get_by_project(project_id)

        if not kb:
            # No knowledge base yet - return empty progress
            return QuestionnaireProgress(
                project_id=project_id,
                total_questions=len(UNIVERSAL_REQUIREMENTS),
                answered_count=0,
                skipped_count=0,
                completion_percentage=0.0,
                sections_progress={},
                estimated_remaining_minutes=len(UNIVERSAL_REQUIREMENTS),
            )

        # Get questionnaire spec
        spec = await self.get_questionnaire(project_id, "")

        # Calculate progress
        total = spec.total_questions
        answered = 0
        skipped = 0
        sections_progress = {}

        wizard_answers = kb.get("wizard_answers", {})
        skipped_questions = wizard_answers.get("_skipped", [])

        for section in spec.sections:
            section_answered = section.completed_count
            section_skipped = sum(1 for q in section.questions if q.id in skipped_questions)
            sections_progress[section.key] = {
                "total": section.total_count,
                "answered": section_answered,
                "skipped": section_skipped,
            }
            answered += section_answered
            skipped += section_skipped

        remaining = total - answered - skipped
        completion_percentage = ((answered + skipped) / total * 100) if total > 0 else 0

        return QuestionnaireProgress(
            project_id=project_id,
            total_questions=total,
            answered_count=answered,
            skipped_count=skipped,
            completion_percentage=round(completion_percentage, 1),
            sections_progress=sections_progress,
            estimated_remaining_minutes=max(0, remaining),
        )

    async def _get_project_form_fields(
        self,
        project_id: UUID
    ) -> List[Dict[str, Any]]:
        """Get all form fields from project tasks.

        Args:
            project_id: UUID of the project

        Returns:
            List of field definitions from form templates
        """
        try:
            client = await self._get_client()
            response = await client.get(f"/api/projects/{project_id}/tasks")
            response.raise_for_status()
            tasks_data = response.json()

            tasks = tasks_data.get("data", [])
            all_fields = []

            for task in tasks:
                template_id = task.get("form_template_id")
                if template_id:
                    try:
                        tmpl_response = await client.get(f"/api/forms/templates/{template_id}")
                        tmpl_response.raise_for_status()
                        template = tmpl_response.json()
                        schema = template.get("data", {}).get("schema", {})

                        # Extract fields from sections
                        for section in schema.get("sections", []):
                            for field in section.get("fields", []):
                                field["_template_name"] = template.get("data", {}).get("name", "Unknown")
                                all_fields.append(field)
                    except Exception as e:
                        logger.warning(f"Failed to fetch template {template_id}: {e}")

            return all_fields

        except Exception as e:
            logger.error(f"Failed to get project form fields: {e}")
            return []

    def _get_filtered_requirements(
        self,
        project_type: Optional[StudyType]
    ) -> List[Dict[str, Any]]:
        """Get requirements filtered by project type.

        Args:
            project_type: Optional study type for filtering

        Returns:
            Filtered list of requirements
        """
        requirements = []
        skipped_count = 0

        logger.debug(f"Filtering requirements for study type: {project_type}")

        for req in UNIVERSAL_REQUIREMENTS:
            # Check if should skip for this project type
            skip_for = req.get("skip_for", [])
            if project_type and skip_for:
                # Compare by value since skip_for contains enum members
                should_skip = any(
                    (isinstance(s, StudyType) and s == project_type) or
                    (isinstance(s, str) and s == project_type.value if isinstance(project_type, StudyType) else s == project_type)
                    for s in skip_for
                )
                if should_skip:
                    skipped_count += 1
                    continue

            requirements.append(req)

        if skipped_count > 0:
            logger.info(f"Filtered out {skipped_count} questions for study type {project_type}, returning {len(requirements)} questions")

        return requirements

    def _generate_question_text(self, req: Dict[str, Any]) -> str:
        """Generate natural language question from requirement.

        Args:
            req: Requirement dict

        Returns:
            Natural language question
        """
        field = req["field"]

        # Field-specific question templates
        question_templates = {
            "study_title": "What is the title of your research study?",
            "short_title": "What is a short title or acronym for your study (if any)?",
            "study_type": "What type of research study is this?",
            "principal_investigator.name": "Who is the Principal Investigator (PI) for this study?",
            "principal_investigator.email": "What is the PI's email address?",
            "principal_investigator.department": "What department is the PI affiliated with?",
            "department": "Which department is conducting this research?",
            "primary_objective": "What is the primary objective of your study?",
            "secondary_objectives": "What are the secondary objectives (if any)?",
            "specific_aims": "What are the specific aims of your research?",
            "hypotheses": "What hypotheses will your study test?",
            "study_design": "Describe your study design (e.g., randomized controlled trial, cohort study, case series).",
            "methodology_description": "Describe the research methodology you will use.",
            "target_population": "Describe your target study population.",
            "sample_size.total": "What is your total target sample size?",
            "sample_size.justification": "How did you determine this sample size?",
            "inclusion_criteria": "What are your inclusion criteria for study participants?",
            "exclusion_criteria": "What are your exclusion criteria?",
            "vulnerable_populations": "Will your study include any vulnerable populations?",
            "recruitment_methods": "How will you recruit participants?",
            "recruitment_locations": "Where will recruitment take place?",
            "study_procedures": "Describe the study procedures participants will undergo.",
            "duration_per_subject": "How long will each participant be involved in the study?",
            "data_sources": "What are your data sources?",
            "data_variables": "What variables will you collect?",
            "confidentiality_measures": "How will you protect participant confidentiality?",
            "data_storage": "Where and how will study data be stored?",
            "hipaa_applies": "Does HIPAA apply to your study?",
            "risks": "What are the potential risks to participants?",
            "benefits_to_subjects": "What are the potential benefits to participants?",
            "benefits_to_society": "What are the potential benefits to society?",
            "risk_mitigation": "How will you minimize risks to participants?",
            "consent_type": "What type of consent will you obtain?",
            "consent_process": "Describe your consent process.",
            "fda_regulated": "Is this study FDA-regulated?",
            "ionizing_radiation": "Does this study involve ionizing radiation?",
            "funding_source": "What is the funding source for this study?",
            "funding_type": "What type of funding is this?",
            "start_date": "When do you plan to start the study?",
            "end_date": "When do you expect the study to end?",
            # High-impact questions for better form fill rate
            "contact_person.name": "Who should the IRB contact about this study (if different from PI)?",
            "contact_person.building_room": "What is the contact person's building and room number?",
            "contact_person.phone_ext": "What is the contact person's phone extension?",
            "contact_person.fax": "What is the contact person's fax number (if any)?",
            "contact_person.email": "What is the contact person's email address?",
            "research_personnel": "List all persons who will conduct human subjects research (name, degree, role).",
            "other_personnel": "List other personnel involved in design, conduct, or reporting (if any).",
            "study_initiated_by": "Is this study initiated by a local investigator, industry sponsor, cooperative group, or other?",
            "recruitment_source": "What are your sources for recruiting subjects?",
            "recruitment_uses_flyers": "Will recruitment require use of flyers, posters, or other advertising?",
            "recruitment_uses_phone": "Will recruitment involve telephone contact?",
            "recruitment_uses_electronic": "Will recruitment involve electronic (web or email) methods?",
            "recruitment_electronic_description": "Describe your electronic recruitment method.",
            "consent_location": "Where will subjects sign the consent form?",
            "consent_timing": "When will consent be obtained relative to study procedures?",
            "subject_payment": "What payment or compensation will subjects receive (if any)?",
            "consent_waiver_requested": "Are you requesting a waiver of consent?",
            "is_student_project": "Is this a student project (includes fellows, residents, graduate students)?",
            "student_name": "What is the student's name?",
            "student_program": "What is the student's program or department?",
            "schedule_drugs": "Will any Schedule I or II controlled substances be investigated?",
            "ibc_infectious_agents": "Does this study involve infectious agents (bacteria, viruses, etc.)?",
            "ibc_recombinant_dna": "Will recombinant or synthetic nucleic acids be used?",
            "ibc_hazardous_materials": "Will carcinogens, mutagens, or other hazardous materials be used?",
            "scro_stem_cells": "Does this project involve human embryonic stem cells or iPSCs?",
            "phi_shared_externally": "Will Protected Health Information (PHI) be shared outside your institution?",
            "phi_shared_with": "With whom will PHI be shared?",
            "study_location": "Where will study procedures take place?",
        }

        if field in question_templates:
            return question_templates[field]

        # Generate from field name
        words = field.replace(".", " ").replace("_", " ")
        return f"What is the {words} for your study?"

    def _generate_why_needed(self, req: Dict[str, Any]) -> str:
        """Generate explanation of why this information is needed.

        Args:
            req: Requirement dict

        Returns:
            Explanation string
        """
        forms = req.get("forms", [])
        priority = req.get("priority", QuestionPriority.RECOMMENDED)

        if priority == QuestionPriority.REQUIRED:
            prefix = "Required for"
        else:
            prefix = "Used in"

        if forms:
            return f"{prefix} {', '.join(forms[:3])}"

        return "Needed for research documentation"

    def _estimate_time(self, req: Dict[str, Any]) -> int:
        """Estimate time in seconds to answer a question.

        Args:
            req: Requirement dict

        Returns:
            Estimated seconds
        """
        answer_type = req.get("answer_type", AnswerType.TEXT)

        time_estimates = {
            AnswerType.TEXT: 30,
            AnswerType.TEXTAREA: 90,
            AnswerType.NUMBER: 15,
            AnswerType.SELECT: 10,
            AnswerType.MULTISELECT: 20,
            AnswerType.DATE: 10,
            AnswerType.BOOLEAN: 5,
        }

        return time_estimates.get(answer_type, 60)

    async def _get_project_details(self, project_id: UUID, user_id: str) -> Optional[Dict[str, Any]]:
        """Fetch project details from the gateway.

        Args:
            project_id: UUID of the project
            user_id: User ID for internal auth

        Returns:
            Project data dict or None if not found
        """
        try:
            # Create client with user ID header for internal auth
            async with httpx.AsyncClient(
                base_url=self.settings.GATEWAY_URL,
                timeout=30.0,
                headers={
                    "X-Internal-API-Key": self.settings.INTERNAL_API_KEY,
                    "X-User-ID": user_id,
                },
            ) as client:
                response = await client.get(f"/api/projects/{project_id}")
                logger.info(f"Fetching project {project_id}: status={response.status_code}")
                response.raise_for_status()
                data = response.json()
                project_data = data.get("data", {})
                logger.info(f"Project data keys: {list(project_data.keys()) if project_data else 'None'}")
                return project_data
        except Exception as e:
            logger.error(f"Failed to fetch project details for {project_id}: {e}")
            return None

    async def _seed_kb_from_project(
        self,
        kb_id: UUID,
        project_id: UUID,
        user_id: str,
        kb_service
    ) -> int:
        """Seed knowledge base with data from the project record.

        This pre-populates the KB with information already collected
        during project creation, so the questionnaire doesn't ask
        redundant questions.

        Args:
            kb_id: Knowledge base UUID
            project_id: Project UUID
            kb_service: KnowledgeBaseService instance

        Returns:
            Number of facts added
        """
        from app.schemas.knowledge import FactSource

        logger.info(f"Seeding KB {kb_id} from project {project_id}")
        project = await self._get_project_details(project_id, user_id)
        if not project:
            logger.warning(f"No project data returned for {project_id}")
            return 0

        logger.info(f"Project data: title={project.get('title')}, type={project.get('project_type')}")

        # Get existing facts to avoid overriding
        existing_facts = await kb_service.get_facts(kb_id)
        existing_keys = {f.key for f in existing_facts}
        logger.info(f"Existing fact keys: {existing_keys}")

        facts_added = 0

        # Map project fields to knowledge base facts
        field_mappings = [
            ("title", "study_title", "Project title"),
            ("description", "primary_objective", "Project description"),
            ("project_type", "study_type", "Study type"),
            ("department", "department", "Department"),
            ("start_date", "start_date", "Project start date"),
            ("end_date", "end_date", "Project end date"),
        ]

        for project_field, kb_field, description in field_mappings:
            # Only add if fact doesn't already exist
            if kb_field in existing_keys:
                logger.debug(f"Skipping {kb_field} - already exists")
                continue

            value = project.get(project_field)
            if value:
                try:
                    await kb_service.add_fact(
                        kb_id=kb_id,
                        key=kb_field,
                        value=str(value),
                        source=FactSource.EXTRACTED,
                        confidence=1.0,
                        source_reference="From project creation form",
                    )
                    facts_added += 1
                    logger.info(f"Seeded KB with {kb_field}={value}")
                except Exception as e:
                    logger.warning(f"Failed to seed fact {kb_field}: {e}")

        # Handle PI information - gateway returns flat fields
        pi_mappings = [
            ("principal_investigator_name", "principal_investigator.name"),
            ("principal_investigator_email", "principal_investigator.email"),
            ("department", "principal_investigator.department"),  # PI dept is usually same as project dept
        ]
        for project_field, kb_field in pi_mappings:
            # Only add if fact doesn't already exist
            if kb_field in existing_keys:
                logger.debug(f"Skipping PI {kb_field} - already exists")
                continue

            value = project.get(project_field)
            if value:
                try:
                    await kb_service.add_fact(
                        kb_id=kb_id,
                        key=kb_field,
                        value=str(value),
                        source=FactSource.EXTRACTED,
                        confidence=1.0,
                        source_reference="From project creation form",
                    )
                    facts_added += 1
                    logger.info(f"Seeded PI {kb_field}={value}")
                except Exception as e:
                    logger.warning(f"Failed to seed PI fact {kb_field}: {e}")

        logger.info(f"Seeded knowledge base with {facts_added} facts from project {project_id}")
        return facts_added


def get_questionnaire_engine(db: AsyncSession) -> QuestionnaireEngine:
    """Get a QuestionnaireEngine instance.

    Args:
        db: Async database session

    Returns:
        QuestionnaireEngine instance
    """
    return QuestionnaireEngine(db)
