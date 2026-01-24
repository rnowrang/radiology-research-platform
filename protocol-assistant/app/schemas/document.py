"""Pydantic schemas for document processing."""

from pydantic import BaseModel, Field
from typing import Optional


class DocumentSection(BaseModel):
    """Represents a section extracted from a document."""

    title: str = Field(..., description="Section title or heading")
    content: str = Field(..., description="Section content text")
    page_number: Optional[int] = Field(default=None, description="Page number where section starts")
    heading_level: Optional[int] = Field(default=None, ge=1, le=6, description="Heading level (1-6)")


class ParsedDocument(BaseModel):
    """Represents a fully parsed document with extracted structure."""

    full_text: str = Field(..., description="Complete extracted text from document")
    sections: list[DocumentSection] = Field(
        default_factory=list, description="Extracted document sections"
    )
    metadata: dict = Field(default_factory=dict, description="Document metadata")
    word_count: int = Field(default=0, ge=0, description="Total word count")
    page_count: int = Field(default=0, ge=0, description="Total page count")
    filename: Optional[str] = Field(default=None, description="Original filename")
    file_type: Optional[str] = Field(default=None, description="File extension type")


class DocumentParseRequest(BaseModel):
    """Request to parse a document."""

    filename: str = Field(..., description="Original filename")


class DocumentParseResponse(BaseModel):
    """Response from document parsing."""

    success: bool = Field(..., description="Whether parsing was successful")
    document: Optional[ParsedDocument] = Field(default=None, description="Parsed document")
    error: Optional[str] = Field(default=None, description="Error message if parsing failed")


class PHIDetectionResult(BaseModel):
    """Result of PHI detection scan."""

    has_phi: bool = Field(..., description="Whether PHI was detected")
    matches: list[dict] = Field(default_factory=list, description="List of PHI matches found")
    redacted_text: Optional[str] = Field(default=None, description="Text with PHI redacted")
    phi_count: int = Field(default=0, ge=0, description="Total number of PHI instances found")
