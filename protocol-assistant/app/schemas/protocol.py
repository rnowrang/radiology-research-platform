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


class ExtractedRecruitment(BaseModel):
    """Recruitment plan extracted from protocol."""

    sources: list[str] = Field(default_factory=list, description="Recruitment sources (clinic, ads, registry, etc.)")
    uses_flyers: Optional[bool] = Field(default=None, description="Whether recruitment flyers are used")
    uses_verbal: Optional[bool] = Field(default=None, description="Whether verbal recruitment is used")
    uses_electronic: Optional[bool] = Field(default=None, description="Whether electronic recruitment (email, web) is used")
    electronic_description: Optional[str] = Field(default=None, description="Description of electronic recruitment methods")
    description: Optional[str] = Field(default=None, description="Overall recruitment plan description")


class ExtractedConsent(BaseModel):
    """Consent process extracted from protocol."""

    plan_description: Optional[str] = Field(default=None, description="Description of the consent process")
    location: Optional[str] = Field(default=None, description="Where consent will be obtained")
    timing: Optional[str] = Field(default=None, description="When consent will be obtained (before enrollment, at visit, etc.)")
    documents_required: list[str] = Field(default_factory=list, description="Required consent documents (ICF, HIPAA, etc.)")
    waiver_requested: Optional[bool] = Field(default=None, description="Whether consent waiver is requested")
    waiver_type: Optional[str] = Field(default=None, description="Type of waiver if requested (full, partial, documentation)")
    inducement: Optional[str] = Field(default=None, description="Subject compensation or inducement description")


class ExtractedPopulationDetails(BaseModel):
    """Detailed population breakdown extracted from protocol."""

    healthy_count: Optional[int] = Field(default=None, description="Number of healthy volunteers")
    patient_count: Optional[int] = Field(default=None, description="Number of patients")
    total_count: Optional[int] = Field(default=None, description="Total number of subjects")
    healthy_age_range: Optional[str] = Field(default=None, description="Age range for healthy volunteers")
    patient_age_range: Optional[str] = Field(default=None, description="Age range for patients")
    overall_age_range: Optional[str] = Field(default=None, description="Overall age range")
    vulnerable_populations: list[str] = Field(default_factory=list, description="Vulnerable populations (children, prisoners, pregnant, etc.)")
    special_populations: list[str] = Field(default_factory=list, description="Special populations (employees, students, etc.)")


class ExtractedProcedures(BaseModel):
    """Study procedures extracted from protocol."""

    location: Optional[str] = Field(default=None, description="Where study procedures will be performed")
    minimal_risk: list[str] = Field(default_factory=list, description="Minimal risk procedures (surveys, blood draw, etc.)")
    greater_risk: list[str] = Field(default_factory=list, description="Greater than minimal risk procedures")
    safety_monitoring: Optional[str] = Field(default=None, description="Safety monitoring plan (DSMB, PI, sponsor, etc.)")


class ExtractedDataSecurity(BaseModel):
    """Data security details extracted from protocol."""

    electronic_collection: Optional[bool] = Field(default=None, description="Whether data is collected electronically")
    electronic_protections: list[str] = Field(default_factory=list, description="Electronic data protections (encryption, passwords, etc.)")
    hardcopy_stored: Optional[bool] = Field(default=None, description="Whether hardcopy data is stored")
    hardcopy_storage: list[str] = Field(default_factory=list, description="Hardcopy storage methods (locked cabinet, etc.)")
    collecting_health_info: Optional[bool] = Field(default=None, description="Whether PHI/health information is collected")
    phi_shared_externally: Optional[bool] = Field(default=None, description="Whether PHI is shared with external parties")
    phi_shared_with: list[str] = Field(default_factory=list, description="Entities PHI is shared with (sponsor, FDA, etc.)")


class ExtractedRegulatory(BaseModel):
    """Regulatory status extracted from protocol."""

    fda_regulated: Optional[bool] = Field(default=None, description="Whether FDA regulations apply")
    ind_number: Optional[str] = Field(default=None, description="IND number if applicable")
    ide_number: Optional[str] = Field(default=None, description="IDE number if applicable")
    uses_ionizing_radiation: Optional[bool] = Field(default=None, description="Whether ionizing radiation is used")
    involves_infectious_agents: Optional[bool] = Field(default=None, description="Whether infectious agents are used")
    involves_recombinant_dna: Optional[bool] = Field(default=None, description="Whether recombinant DNA is used")
    involves_hazardous_materials: Optional[bool] = Field(default=None, description="Whether hazardous materials are used")
    is_student_project: Optional[bool] = Field(default=None, description="Whether this is a student research project")


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
    # New enhanced extraction fields
    recruitment: Optional[ExtractedRecruitment] = Field(
        default=None, description="Recruitment plan details"
    )
    consent: Optional[ExtractedConsent] = Field(
        default=None, description="Consent process details"
    )
    population_details: Optional[ExtractedPopulationDetails] = Field(
        default=None, description="Detailed population breakdown"
    )
    procedures: Optional[ExtractedProcedures] = Field(
        default=None, description="Study procedures details"
    )
    data_security: Optional[ExtractedDataSecurity] = Field(
        default=None, description="Data security details"
    )
    regulatory: Optional[ExtractedRegulatory] = Field(
        default=None, description="Regulatory status details"
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
