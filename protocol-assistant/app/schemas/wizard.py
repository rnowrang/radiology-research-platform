"""Pydantic schemas for the guided wizard functionality."""

from pydantic import BaseModel
from typing import Optional, List
from enum import Enum


class AnswerSource(str, Enum):
    """Source of an answer to a wizard question."""
    SUGGESTED = "suggested"
    FREETEXT = "freetext"
    EXTRACTED = "extracted"


class FormFieldInfo(BaseModel):
    """Information about a form field that a question maps to."""
    form_type: str  # "irb_initial", "irb_amendment", etc.
    section: str  # "methodology", "risks", etc.
    field_name: str
    field_label: str


class SuggestedAnswer(BaseModel):
    """A suggested answer for a wizard question."""
    id: str
    text: str
    source: str  # 'document', 'ai', 'common'
    confidence: Optional[float] = None


class EnhancedGapQuestion(BaseModel):
    """Enhanced gap question with suggestions and form mappings."""
    id: str
    question: str
    section: str  # "methodology", "risks", "population", etc.
    priority: str  # "high", "medium", "low"
    rationale: Optional[str] = None

    # Smart suggestions
    suggested_answers: List[SuggestedAnswer] = []

    # Extraction info
    extracted_value: Optional[str] = None
    extracted_confidence: Optional[float] = None

    # Form mapping
    form_field: Optional[FormFieldInfo] = None

    # Meta
    average_time_seconds: int = 60
    answered: bool = False
    skipped: bool = False


class SectionInfo(BaseModel):
    """Information about a section of wizard questions."""
    key: str  # Original section key (e.g., "study_info", "methodology")
    name: str  # Display name (e.g., "Study Information", "Methodology")
    icon: str
    question_count: int


class WizardQuestionsResponse(BaseModel):
    """Response containing wizard questions and metadata."""
    questions: List[EnhancedGapQuestion]
    sections: List[SectionInfo]
    total_estimated_minutes: int


class AnswerRequest(BaseModel):
    """Request to submit an answer to a wizard question."""
    answer: str
    source: AnswerSource


class WizardProgress(BaseModel):
    """Current progress through the wizard."""
    total_questions: int
    answered_count: int
    skipped_count: int
    current_index: int
    sections_progress: dict  # section_name -> {total, answered}
    estimated_remaining_minutes: int
    percent_complete: float


class AnswerResponse(BaseModel):
    """Response after submitting an answer."""
    success: bool
    updated_protocol: Optional[dict] = None
    next_question_id: Optional[str] = None
    progress: WizardProgress


class SkipResponse(BaseModel):
    """Response after skipping a question."""
    success: bool
    next_question_id: Optional[str] = None
    progress: WizardProgress


class SuggestionsResponse(BaseModel):
    """Response containing suggestions for a question."""
    suggestions: List[SuggestedAnswer]
