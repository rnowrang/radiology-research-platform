"""Universal Protocol and Knowledge Base schemas for intelligent form filling.

This module provides comprehensive schemas for:
- Universal Protocol data covering all possible research information
- Project Knowledge Base facts and embeddings
- Questionnaire questions and responses
- Form fill results with confidence scoring
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field


# ============================================================================
# Enums
# ============================================================================

class StudyType(str, Enum):
    """Types of research studies."""
    RETROSPECTIVE = "retrospective"
    PROSPECTIVE = "prospective"
    CLINICAL_TRIAL = "clinical_trial"
    QUALITY_IMPROVEMENT = "quality_improvement"
    EDUCATIONAL = "educational"
    REGISTRY = "registry"
    COHORT = "cohort"
    CASE_CONTROL = "case_control"
    CROSS_SECTIONAL = "cross_sectional"
    OTHER = "other"


class StudyPhase(str, Enum):
    """Clinical trial phases."""
    PHASE_1 = "phase_1"
    PHASE_2 = "phase_2"
    PHASE_3 = "phase_3"
    PHASE_4 = "phase_4"
    NOT_APPLICABLE = "not_applicable"


class RiskSeverity(str, Enum):
    """Risk severity levels."""
    MINIMAL = "minimal"
    MODERATE = "moderate"
    SERIOUS = "serious"


class RiskLikelihood(str, Enum):
    """Risk likelihood levels."""
    RARE = "rare"
    POSSIBLE = "possible"
    LIKELY = "likely"


class ConsentType(str, Enum):
    """Types of informed consent."""
    WRITTEN = "written"
    VERBAL = "verbal"
    WAIVER = "waiver"
    ASSENT = "assent"


class FundingType(str, Enum):
    """Types of research funding."""
    INTRAMURAL = "intramural"
    EXTRAMURAL = "extramural"
    FEDERAL = "federal"
    INDUSTRY = "industry"
    FOUNDATION = "foundation"
    UNFUNDED = "unfunded"


class AnswerType(str, Enum):
    """Types of question answers."""
    TEXT = "text"
    NUMBER = "number"
    SELECT = "select"
    MULTISELECT = "multiselect"
    DATE = "date"
    DATE_RANGE = "date_range"
    BOOLEAN = "boolean"
    TEXTAREA = "textarea"


class QuestionPriority(str, Enum):
    """Question priority levels."""
    REQUIRED = "required"
    RECOMMENDED = "recommended"
    OPTIONAL = "optional"


class ConfidenceLevel(str, Enum):
    """Confidence levels for form filling."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class FactSource(str, Enum):
    """Sources of knowledge facts."""
    DOCUMENT = "document"
    WIZARD = "wizard"
    USER_INPUT = "user_input"
    LEARNED = "learned"
    EXTRACTED = "extracted"


class ContentType(str, Enum):
    """Types of embedded content."""
    FACT = "fact"
    DOCUMENT_CHUNK = "document_chunk"
    WIZARD_ANSWER = "wizard_answer"
    PROTOCOL_FIELD = "protocol_field"


# ============================================================================
# Sub-models for Universal Protocol
# ============================================================================

class PersonInfo(BaseModel):
    """Information about a person involved in the study."""
    name: Optional[str] = None
    title: Optional[str] = None
    department: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    institution: Optional[str] = None
    credentials: Optional[str] = None


class SampleSizeInfo(BaseModel):
    """Information about study sample size."""
    total: Optional[int] = None
    healthy_volunteers: Optional[int] = None
    patients: Optional[int] = None
    local_site: Optional[int] = None
    studywide: Optional[int] = None
    justification: Optional[str] = None
    power_analysis: Optional[str] = None


class RiskInfo(BaseModel):
    """Information about a study risk."""
    description: str
    severity: Optional[RiskSeverity] = None
    likelihood: Optional[RiskLikelihood] = None
    mitigation: Optional[str] = None
    category: Optional[str] = None


class ProcedureInfo(BaseModel):
    """Information about a study procedure."""
    name: str
    description: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    is_standard_of_care: Optional[bool] = None
    risks: List[str] = Field(default_factory=list)


class DrugInfo(BaseModel):
    """Information about a drug used in the study."""
    name: str
    dose: Optional[str] = None
    route: Optional[str] = None
    frequency: Optional[str] = None
    duration: Optional[str] = None
    is_investigational: Optional[bool] = None
    ind_number: Optional[str] = None


class DeviceInfo(BaseModel):
    """Information about a medical device used in the study."""
    name: str
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    is_investigational: Optional[bool] = None
    ide_number: Optional[str] = None
    description: Optional[str] = None


# ============================================================================
# Universal Protocol Schema
# ============================================================================

class UniversalProtocol(BaseModel):
    """Comprehensive schema capturing all possible research information.

    This schema is designed to be a superset of all information needed
    across different IRB forms, grant applications, and research documents.
    Fields are optional to allow partial population from various sources.
    """

    # Study Identification
    study_title: Optional[str] = None
    short_title: Optional[str] = None
    protocol_number: Optional[str] = None
    version: Optional[str] = None
    version_date: Optional[date] = None
    irb_number: Optional[str] = None
    nct_number: Optional[str] = None  # ClinicalTrials.gov

    # Personnel
    principal_investigator: Optional[PersonInfo] = None
    co_investigators: List[PersonInfo] = Field(default_factory=list)
    research_staff: List[PersonInfo] = Field(default_factory=list)
    department: Optional[str] = None
    institution: Optional[str] = None
    sponsor: Optional[str] = None

    # Study Classification
    study_type: Optional[StudyType] = None
    study_phase: Optional[StudyPhase] = None
    is_multi_site: Optional[bool] = None
    is_student_project: Optional[bool] = None
    is_minimal_risk: Optional[bool] = None

    # Objectives
    primary_objective: Optional[str] = None
    secondary_objectives: List[str] = Field(default_factory=list)
    specific_aims: List[str] = Field(default_factory=list)
    hypotheses: List[str] = Field(default_factory=list)
    research_questions: List[str] = Field(default_factory=list)

    # Background
    background_summary: Optional[str] = None
    scientific_rationale: Optional[str] = None
    preliminary_data: Optional[str] = None

    # Methodology
    study_design: Optional[str] = None
    methodology_description: Optional[str] = None
    statistical_methods: Optional[str] = None

    # Population
    target_population: Optional[str] = None
    sample_size: Optional[SampleSizeInfo] = None
    inclusion_criteria: List[str] = Field(default_factory=list)
    exclusion_criteria: List[str] = Field(default_factory=list)
    vulnerable_populations: List[str] = Field(default_factory=list)
    age_range_min: Optional[int] = None
    age_range_max: Optional[int] = None

    # Recruitment
    recruitment_methods: List[str] = Field(default_factory=list)
    recruitment_locations: List[str] = Field(default_factory=list)
    recruitment_materials: Optional[str] = None
    recruitment_timeline: Optional[str] = None

    # Procedures
    study_procedures: List[ProcedureInfo] = Field(default_factory=list)
    visit_schedule: Optional[str] = None
    duration_per_subject: Optional[str] = None
    total_visits: Optional[int] = None

    # Interventions (if applicable)
    drugs: List[DrugInfo] = Field(default_factory=list)
    devices: List[DeviceInfo] = Field(default_factory=list)
    other_interventions: List[str] = Field(default_factory=list)

    # Regulatory
    fda_regulated: Optional[bool] = None
    ind_number: Optional[str] = None
    ide_number: Optional[str] = None
    ionizing_radiation: Optional[bool] = None
    radiation_exposure: Optional[str] = None

    # Risks and Benefits
    risks: List[RiskInfo] = Field(default_factory=list)
    benefits_to_subjects: List[str] = Field(default_factory=list)
    benefits_to_society: List[str] = Field(default_factory=list)
    risk_mitigation: List[str] = Field(default_factory=list)
    risk_benefit_ratio: Optional[str] = None

    # Data
    data_sources: List[str] = Field(default_factory=list)
    data_variables: List[str] = Field(default_factory=list)
    data_collection_timeline: Optional[str] = None
    outcomes_primary: List[str] = Field(default_factory=list)
    outcomes_secondary: List[str] = Field(default_factory=list)

    # Privacy
    confidentiality_measures: List[str] = Field(default_factory=list)
    data_storage: Optional[str] = None
    data_sharing: Optional[str] = None
    data_retention: Optional[str] = None
    hipaa_applies: Optional[bool] = None
    hipaa_authorization: Optional[str] = None
    phi_elements: List[str] = Field(default_factory=list)

    # Consent
    consent_process: Optional[str] = None
    consent_type: Optional[ConsentType] = None
    consent_language: Optional[str] = None
    consent_comprehension: Optional[str] = None

    # Timeline
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    duration: Optional[str] = None
    enrollment_period: Optional[str] = None

    # Funding
    funding_source: Optional[str] = None
    funding_type: Optional[FundingType] = None
    grant_number: Optional[str] = None
    budget_total: Optional[Decimal] = None

    # Additional metadata
    keywords: List[str] = Field(default_factory=list)
    therapeutic_area: Optional[str] = None

    class Config:
        """Pydantic configuration."""
        use_enum_values = True


# ============================================================================
# Knowledge Base Schemas
# ============================================================================

class Fact(BaseModel):
    """A single fact stored in the knowledge base."""
    key: str = Field(..., description="Unique identifier for this fact")
    value: Any = Field(..., description="The fact value (can be any type)")
    source: FactSource = Field(..., description="Where this fact came from")
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence score (0-1)"
    )
    extracted_at: datetime = Field(default_factory=datetime.utcnow)
    source_reference: Optional[str] = Field(
        default=None,
        description="Reference to source (e.g., 'Protocol.pdf, page 3')"
    )


class DocumentInfo(BaseModel):
    """Information about a document in the knowledge base."""
    doc_id: UUID
    filename: str
    doc_type: str  # protocol, consent, budget, etc.
    extracted_at: datetime = Field(default_factory=datetime.utcnow)
    page_count: Optional[int] = None
    extracted_facts_count: Optional[int] = None


class EmbeddingMatch(BaseModel):
    """Result of a semantic search query."""
    content: str = Field(..., description="The matched text content")
    content_type: ContentType = Field(..., description="Type of content")
    source_key: str = Field(..., description="Reference to source")
    score: float = Field(..., ge=0.0, le=1.0, description="Similarity score")
    metadata: Optional[Dict[str, Any]] = None


class ProjectKnowledgeBaseResponse(BaseModel):
    """Response schema for project knowledge base."""
    id: UUID
    project_id: UUID
    protocol_data: Dict[str, Any] = Field(default_factory=dict)
    facts: List[Fact] = Field(default_factory=list)
    documents: List[DocumentInfo] = Field(default_factory=list)
    wizard_answers: Dict[str, Any] = Field(default_factory=dict)
    questionnaire_complete: bool = False
    completion_percentage: float = 0.0
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Questionnaire Schemas
# ============================================================================

class WizardQuestion(BaseModel):
    """A question in the unified questionnaire."""
    id: str = Field(..., description="Unique question identifier")
    question: str = Field(..., description="Natural language question")

    # Context
    why_needed: str = Field(
        ...,
        description="Explanation of why this info is needed"
    )
    used_in_forms: List[str] = Field(
        default_factory=list,
        description="Form names that use this information"
    )

    # Answer configuration
    answer_type: AnswerType = Field(default=AnswerType.TEXT)
    options: Optional[List[str]] = Field(
        default=None,
        description="Options for select/multiselect types"
    )
    validation_pattern: Optional[str] = Field(
        default=None,
        description="Regex pattern for validation"
    )

    # Pre-fill from documents if available
    suggested_answer: Optional[str] = None
    suggestion_source: Optional[str] = Field(
        default=None,
        description="Where suggestion came from (e.g., 'Extracted from Protocol.pdf, page 3')"
    )
    suggestion_confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0
    )

    # Metadata
    priority: QuestionPriority = Field(default=QuestionPriority.RECOMMENDED)
    section: str = Field(..., description="Section for grouping in UI")
    protocol_field: str = Field(
        ...,
        description="Maps to UniversalProtocol field path"
    )
    estimated_time_seconds: int = Field(default=60)


class QuestionnaireSection(BaseModel):
    """A section of the questionnaire."""
    key: str
    name: str
    icon: str
    questions: List[WizardQuestion] = Field(default_factory=list)
    completed_count: int = 0
    total_count: int = 0


class QuestionnaireSpec(BaseModel):
    """Specification for a project questionnaire."""
    project_id: UUID
    project_type: Optional[StudyType] = None
    sections: List[QuestionnaireSection] = Field(default_factory=list)
    total_questions: int = 0
    estimated_minutes: int = 0
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class QuestionnaireProgress(BaseModel):
    """Progress through the questionnaire."""
    project_id: UUID
    total_questions: int
    answered_count: int
    skipped_count: int
    completion_percentage: float
    sections_progress: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    estimated_remaining_minutes: int


class AnswerSubmission(BaseModel):
    """Submission of an answer to a questionnaire question."""
    question_id: str
    answer: Any
    source: FactSource = Field(default=FactSource.WIZARD)


class AnswerSubmissionResponse(BaseModel):
    """Response after submitting an answer."""
    success: bool
    question_id: str
    next_question_id: Optional[str] = None
    progress: QuestionnaireProgress


# ============================================================================
# Form Fill Schemas
# ============================================================================

class FieldFillResult(BaseModel):
    """Result of filling a single form field."""
    field_id: str
    field_label: str
    field_type: Optional[str] = None
    value: Optional[Any] = None
    confidence: float = Field(ge=0.0, le=1.0)
    confidence_level: ConfidenceLevel
    source: Optional[FactSource] = None
    evidence: Optional[str] = Field(
        default=None,
        description="Evidence/reasoning for this value"
    )
    needs_review: bool = False


class FormFillResult(BaseModel):
    """Result of filling a form."""
    template_id: int
    template_name: Optional[str] = None
    filled_fields: List[FieldFillResult] = Field(default_factory=list)
    unfilled_fields: List[str] = Field(default_factory=list)

    # Statistics
    fill_rate: float = Field(ge=0.0, le=100.0)
    high_confidence_count: int = 0
    medium_confidence_count: int = 0
    low_confidence_count: int = 0

    # For user action
    needs_review_count: int = 0
    suggested_wizard_questions: List[str] = Field(default_factory=list)


class FormFillPreview(BaseModel):
    """Preview of what form filling would produce."""
    template_id: int
    template_name: Optional[str] = None
    fields: List[FieldFillResult] = Field(default_factory=list)

    fill_rate: float
    high_confidence_count: int
    medium_confidence_count: int
    low_confidence_count: int

    recommendation: str = Field(
        default="",
        description="Recommendation for user (e.g., 'Complete wizard first')"
    )


class FillFormRequest(BaseModel):
    """Request to fill a form."""
    template_id: int
    fill_mode: str = Field(
        default="all",
        description="'all', 'high_confidence_only', or 'preview'"
    )
    overwrite_existing: bool = False


# ============================================================================
# Learning Schemas
# ============================================================================

class CorrectionRecord(BaseModel):
    """Record of a user correction for learning."""
    field_id: str
    field_label: Optional[str] = None
    field_type: Optional[str] = None
    original_value: Any
    corrected_value: Any
    source_evidence: Optional[str] = None
    knowledge_base_keys: List[str] = Field(default_factory=list)


class CorrectionRequest(BaseModel):
    """Request to record a form correction."""
    form_id: int
    corrections: List[CorrectionRecord]


class LearnedPattern(BaseModel):
    """A learned pattern from corrections."""
    pattern_type: str  # 'pi_info', 'procedure', 'department', etc.
    pattern_key: str
    pattern_value: Dict[str, Any]
    usage_count: int = 1
    confidence: float = Field(ge=0.0, le=1.0)
    last_used_at: datetime


class LearnedValue(BaseModel):
    """A learned value suggestion."""
    value: Any
    confidence: float = Field(ge=0.0, le=1.0)
    source_level: str  # 'user', 'project', 'institution'
    usage_count: int


# ============================================================================
# API Request/Response Schemas
# ============================================================================

class UploadDocumentRequest(BaseModel):
    """Request metadata for document upload."""
    doc_type: str = Field(default="protocol")
    extract_facts: bool = Field(default=True)


class UploadDocumentResponse(BaseModel):
    """Response after uploading a document."""
    success: bool
    document: DocumentInfo
    facts_extracted: int
    message: str


class SemanticSearchRequest(BaseModel):
    """Request for semantic search."""
    query: str
    top_k: int = Field(default=5, ge=1, le=50)
    content_types: Optional[List[ContentType]] = None


class SemanticSearchResponse(BaseModel):
    """Response from semantic search."""
    matches: List[EmbeddingMatch]
    query: str
    total_results: int


class KnowledgeBaseStatsResponse(BaseModel):
    """Statistics about a project's knowledge base."""
    project_id: UUID
    total_facts: int
    total_documents: int
    total_embeddings: int
    completion_percentage: float
    last_updated: datetime
