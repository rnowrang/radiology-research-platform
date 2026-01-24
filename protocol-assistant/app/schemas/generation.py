"""Pydantic schemas for document generation and form pre-filling."""

from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentType(str, Enum):
    """Types of documents that can be generated."""

    ABSTRACT = "abstract"
    CONSENT_FORM = "consent_form"
    PROTOCOL = "protocol"
    RECRUITMENT = "recruitment_materials"
    DATA_MANAGEMENT = "data_management_plan"
    BUDGET = "budget_justification"


class GenerateRequest(BaseModel):
    """Request to generate a document."""

    session_id: UUID = Field(..., description="Session ID containing protocol data")
    doc_type: DocumentType = Field(..., description="Type of document to generate")
    options: dict = Field(
        default_factory=dict,
        description="Generation options (e.g., word_limit, style, format)",
    )


class AbstractSchema(BaseModel):
    """Schema for generated abstracts."""

    background: str = Field(
        ...,
        min_length=50,
        description="Background and significance of the research",
    )
    objectives: str = Field(
        ...,
        min_length=30,
        description="Primary and secondary study objectives",
    )
    methods: str = Field(
        ...,
        min_length=50,
        description="Study design, population, and key procedures",
    )
    expected_outcomes: str = Field(
        ...,
        min_length=30,
        description="Anticipated results and findings",
    )
    significance: str = Field(
        ...,
        min_length=30,
        description="Impact and implications of the research",
    )
    word_count: int = Field(
        ge=100,
        le=500,
        description="Total word count of the abstract",
    )


class ConsentFormSchema(BaseModel):
    """Schema for generated informed consent forms."""

    study_title: str = Field(..., description="Full study title")
    purpose_of_study: str = Field(
        ...,
        description="Clear explanation of why the study is being conducted",
    )
    procedures: str = Field(
        ...,
        description="Description of what participants will be asked to do",
    )
    risks: str = Field(
        ...,
        description="Potential risks and discomforts",
    )
    benefits: str = Field(
        ...,
        description="Potential benefits to participants and society",
    )
    confidentiality: str = Field(
        ...,
        description="How participant data will be protected",
    )
    voluntary_participation: str = Field(
        ...,
        description="Statement about voluntary nature and right to withdraw",
    )
    contact_information: str = Field(
        ...,
        description="Contact information for questions and concerns",
    )
    consent_statement: str = Field(
        ...,
        description="Final consent statement with signature fields",
    )


class ProtocolDocumentSchema(BaseModel):
    """Schema for generated protocol documents."""

    title: str = Field(..., description="Protocol title")
    background: str = Field(
        ...,
        description="Scientific background and rationale",
    )
    objectives: str = Field(
        ...,
        description="Primary and secondary objectives",
    )
    study_design: str = Field(
        ...,
        description="Detailed study design description",
    )
    participants: str = Field(
        ...,
        description="Eligibility criteria and recruitment strategy",
    )
    procedures: str = Field(
        ...,
        description="Study procedures and interventions",
    )
    data_analysis: str = Field(
        ...,
        description="Statistical methods and analysis plan",
    )
    ethical_considerations: str = Field(
        ...,
        description="Ethical considerations and safeguards",
    )
    timeline: str = Field(
        ...,
        description="Study timeline and milestones",
    )
    references: list[str] = Field(
        default_factory=list,
        description="Cited references",
    )


class RecruitmentMaterialsSchema(BaseModel):
    """Schema for generated recruitment materials."""

    study_title: str = Field(..., description="Study title for recruitment")
    headline: str = Field(
        ...,
        description="Attention-grabbing headline",
    )
    eligibility_summary: str = Field(
        ...,
        description="Brief eligibility criteria",
    )
    what_to_expect: str = Field(
        ...,
        description="Overview of participation requirements",
    )
    benefits_compensation: str = Field(
        ...,
        description="Benefits and/or compensation details",
    )
    contact_info: str = Field(
        ...,
        description="How to learn more or sign up",
    )


class DataManagementPlanSchema(BaseModel):
    """Schema for generated data management plans."""

    data_types: str = Field(
        ...,
        description="Types of data to be collected",
    )
    data_collection: str = Field(
        ...,
        description="Data collection methods and tools",
    )
    data_storage: str = Field(
        ...,
        description="Storage location and security measures",
    )
    data_access: str = Field(
        ...,
        description="Access controls and sharing policies",
    )
    data_retention: str = Field(
        ...,
        description="Retention period and disposal procedures",
    )
    backup_procedures: str = Field(
        ...,
        description="Backup and recovery procedures",
    )


class GeneratedDocument(BaseModel):
    """Response schema for a generated document."""

    doc_type: str = Field(..., description="Type of document generated")
    content: dict = Field(
        ...,
        description="Schema-validated document content",
    )
    word_count: int = Field(
        ...,
        description="Total word count of the document",
    )
    quality_score: int = Field(
        ge=0,
        le=100,
        description="AI-assessed quality score (0-100)",
    )
    suggestions: list[str] = Field(
        default_factory=list,
        description="Suggestions for improving the document",
    )
    generation_metadata: dict = Field(
        default_factory=dict,
        description="Metadata about the generation process",
    )


class GeneratedFormInstance(BaseModel):
    """Response schema for a generated/pre-filled form instance."""

    form_id: Optional[int] = Field(
        default=None,
        description="ID of the form instance if created",
    )
    doc_type: str = Field(..., description="Type of form generated")
    status: str = Field(
        ...,
        description="Status of the form (draft, error)",
    )
    completion_percentage: float = Field(
        default=0.0,
        description="Percentage of form fields filled",
    )
    editable_url: Optional[str] = Field(
        default=None,
        description="URL to edit the form in the frontend",
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message if generation failed",
    )


class PrefillRequest(BaseModel):
    """Request to pre-fill an existing form with protocol data."""

    session_id: UUID = Field(..., description="Session ID containing protocol data")
    form_id: int = Field(..., description="ID of the form to pre-fill")


class PrefillResponse(BaseModel):
    """Response from form pre-fill operation."""

    form_id: int = Field(..., description="ID of the pre-filled form")
    updated_fields: list[str] = Field(
        ...,
        description="List of field IDs that were updated",
    )
    skipped_fields: list[str] = Field(
        default_factory=list,
        description="List of field IDs that were skipped (no matching data)",
    )
    message: str = Field(..., description="Summary of the pre-fill operation")


class BulkGenerationRequest(BaseModel):
    """Request to generate multiple documents at once."""

    session_id: UUID = Field(..., description="Session ID containing protocol data")
    doc_types: list[DocumentType] = Field(
        ...,
        description="List of document types to generate",
    )
    options: dict = Field(
        default_factory=dict,
        description="Shared generation options",
    )


class BulkGenerationResponse(BaseModel):
    """Response from bulk document generation."""

    session_id: UUID = Field(..., description="Session ID")
    total_requested: int = Field(..., description="Number of documents requested")
    successful: int = Field(..., description="Number of documents successfully generated")
    failed: int = Field(..., description="Number of documents that failed to generate")
    documents: list[GeneratedDocument] = Field(
        ...,
        description="List of generated documents",
    )


class GenerationStatus(str, Enum):
    """Status of a generation job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class GenerationJobStatus(BaseModel):
    """Status of an async generation job."""

    job_id: UUID = Field(..., description="Job ID for tracking")
    status: GenerationStatus = Field(..., description="Current status")
    progress: int = Field(
        ge=0,
        le=100,
        description="Progress percentage",
    )
    doc_type: DocumentType = Field(..., description="Type of document being generated")
    result: Optional[GeneratedDocument] = Field(
        default=None,
        description="Result if completed",
    )
    error: Optional[str] = Field(
        default=None,
        description="Error message if failed",
    )
    created_at: str = Field(..., description="When the job was created")
    completed_at: Optional[str] = Field(
        default=None,
        description="When the job was completed",
    )
