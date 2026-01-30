"""Pydantic schemas for LLM-based form filling.

This module provides schemas for:
- LLM form fill request/response structures
- Field fill results with reasoning
- Chain-of-thought extraction phases
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class LLMFieldFill(BaseModel):
    """Result of filling a single field via LLM reasoning."""

    field_id: str = Field(..., description="Form field identifier")
    value: Optional[Any] = Field(
        default=None,
        description="The filled value (null if cannot fill confidently)"
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence score: 0.9-1.0=direct match, 0.7-0.9=clear inference, 0.5-0.7=uncertain"
    )
    reasoning: str = Field(
        ...,
        description="Brief explanation of how value was determined"
    )
    evidence_keys: List[str] = Field(
        default_factory=list,
        description="KB keys used as evidence (e.g., 'wizard_answers.q_pi_name')"
    )


class LLMFormFillResponse(BaseModel):
    """Complete response from LLM form filling."""

    filled_fields: List[LLMFieldFill] = Field(
        default_factory=list,
        description="List of filled fields with confidence and reasoning"
    )


class FormFieldContext(BaseModel):
    """Simplified field definition for LLM context."""

    id: str = Field(..., description="Field identifier")
    label: str = Field(..., description="Human-readable field label")
    type: str = Field(..., description="Field type (text, select, radio, etc.)")
    required: bool = Field(default=False, description="Whether field is required")
    description: Optional[str] = Field(default=None, description="Field description/help text")
    options: Optional[List[Dict[str, str]]] = Field(
        default=None,
        description="Available options for select/radio/checkbox fields"
    )


class FormContext(BaseModel):
    """Form template context for LLM."""

    fields: List[FormFieldContext] = Field(
        default_factory=list,
        description="All fields in the form"
    )


class KnowledgeFact(BaseModel):
    """Simplified KB fact for LLM context."""

    key: str = Field(..., description="Fact identifier")
    value: Any = Field(..., description="Fact value")
    source: str = Field(..., description="Where this fact came from")


class KnowledgeContext(BaseModel):
    """Knowledge base context for LLM."""

    protocol_data: Dict[str, Any] = Field(
        default_factory=dict,
        description="Structured protocol information"
    )
    facts: List[KnowledgeFact] = Field(
        default_factory=list,
        description="Extracted facts from documents and inputs"
    )
    wizard_answers: Dict[str, Any] = Field(
        default_factory=dict,
        description="Answers from the questionnaire wizard"
    )
