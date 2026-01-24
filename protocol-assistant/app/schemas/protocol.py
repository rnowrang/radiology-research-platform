"""Pydantic schemas for protocol extraction and analysis."""

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class StudyType(str, Enum):
    """Types of research studies."""

    RETROSPECTIVE = "retrospective"
    PROSPECTIVE = "prospective"
    CLINICAL_TRIAL = "clinical_trial"
    QUALITY_IMPROVEMENT = "quality_improvement"
    EDUCATIONAL = "educational"
    OTHER = "other"


class ExtractedObjectives(BaseModel):
    """Extracted study objectives from protocol."""

    primary: str = Field(..., min_length=10, description="Primary study objective")
    secondary: list[str] = Field(
        default_factory=list, description="Secondary study objectives"
    )


class ExtractedMethodology(BaseModel):
    """Extracted methodology information from protocol."""

    design: str = Field(..., description="Study design description")
    population: str = Field(..., description="Target population description")
    sample_size: Optional[str] = Field(default=None, description="Sample size or estimation")
    inclusion_criteria: list[str] = Field(
        default_factory=list, description="Subject inclusion criteria"
    )
    exclusion_criteria: list[str] = Field(
        default_factory=list, description="Subject exclusion criteria"
    )


class ExtractedDataCollection(BaseModel):
    """Extracted data collection information from protocol."""

    sources: list[str] = Field(default_factory=list, description="Data sources")
    variables: list[str] = Field(default_factory=list, description="Variables to be collected")
    timeline: Optional[str] = Field(default=None, description="Data collection timeline")


class ExtractedRisksBenefits(BaseModel):
    """Extracted risks and benefits information from protocol."""

    risks: list[str] = Field(default_factory=list, description="Identified risks")
    benefits: list[str] = Field(default_factory=list, description="Potential benefits")
    mitigation: list[str] = Field(default_factory=list, description="Risk mitigation strategies")


class ExtractedProtocol(BaseModel):
    """Complete extracted protocol information."""

    study_title: str = Field(..., min_length=5, description="Study title")
    principal_investigator: Optional[str] = Field(
        default=None, description="Principal investigator name"
    )
    study_type: StudyType = Field(..., description="Type of study")
    objectives: ExtractedObjectives = Field(..., description="Study objectives")
    methodology: ExtractedMethodology = Field(..., description="Study methodology")
    data_collection: Optional[ExtractedDataCollection] = Field(
        default=None, description="Data collection details"
    )
    risks_benefits: ExtractedRisksBenefits = Field(..., description="Risks and benefits")
    confidentiality_measures: Optional[str] = Field(
        default=None, description="Data confidentiality measures"
    )
    missing_sections: list[str] = Field(
        default_factory=list, description="Sections that appear to be missing or incomplete"
    )
    quality_score: int = Field(
        ge=0, le=100, description="Overall quality/completeness score (0-100)"
    )
    recommendations: list[str] = Field(
        default_factory=list, description="Recommendations for improvement"
    )


class GapQuestion(BaseModel):
    """A gap question to gather missing information."""

    question: str = Field(..., min_length=10, description="The question to ask")
    section: str = Field(..., description="Which protocol section this relates to")
    priority: str = Field(
        ..., pattern="^(high|medium|low)$", description="Priority level"
    )
    field_mapping: Optional[str] = Field(
        default=None, description="Form field this maps to"
    )
    rationale: Optional[str] = Field(
        default=None, description="Why this information is needed"
    )


class GapAnalysisResult(BaseModel):
    """Result of protocol gap analysis."""

    questions: list[GapQuestion] = Field(
        default_factory=list, description="List of gap questions"
    )
    completeness_score: int = Field(
        ge=0, le=100, description="How complete the protocol is (0-100)"
    )
    critical_gaps: list[str] = Field(
        default_factory=list, description="Critical information gaps"
    )
    summary: str = Field(..., description="Summary of the gap analysis")


class ProtocolExtractionRequest(BaseModel):
    """Request to extract protocol information."""

    filename: str = Field(..., description="Document filename")
    include_gap_analysis: bool = Field(
        default=True, description="Whether to include gap analysis"
    )


class ProtocolExtractionResponse(BaseModel):
    """Response from protocol extraction."""

    success: bool = Field(..., description="Whether extraction was successful")
    protocol: Optional[ExtractedProtocol] = Field(
        default=None, description="Extracted protocol information"
    )
    gap_analysis: Optional[GapAnalysisResult] = Field(
        default=None, description="Gap analysis results"
    )
    error: Optional[str] = Field(default=None, description="Error message if extraction failed")


class ProtocolQualityAssessment(BaseModel):
    """Assessment of protocol quality and completeness."""

    overall_score: int = Field(ge=0, le=100, description="Overall quality score")
    section_scores: dict[str, int] = Field(
        default_factory=dict, description="Scores by section"
    )
    strengths: list[str] = Field(default_factory=list, description="Protocol strengths")
    weaknesses: list[str] = Field(default_factory=list, description="Protocol weaknesses")
    irb_readiness: str = Field(
        ..., description="Assessment of IRB submission readiness"
    )
    estimated_completion: int = Field(
        ge=0, le=100, description="Estimated completion percentage"
    )
