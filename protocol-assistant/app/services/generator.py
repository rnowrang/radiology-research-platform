"""Document generation service for Protocol Assistant.

This module provides AI-powered document generation including:
- Research abstracts
- Informed consent forms
- Protocol documents
- Recruitment materials
- Data management plans
- Budget justifications
"""

import json
import logging
from typing import Optional, Type

from pydantic import BaseModel

from app.schemas.generation import (
    AbstractSchema,
    ConsentFormSchema,
    DataManagementPlanSchema,
    DocumentType,
    GeneratedDocument,
    ProtocolDocumentSchema,
    RecruitmentMaterialsSchema,
)
from app.schemas.protocol import ExtractedProtocol
from app.services.llm import LLMMessage, get_llm_orchestrator

logger = logging.getLogger(__name__)


# Document generation prompts

ABSTRACT_PROMPT = """You are an expert academic writer specializing in research abstracts for IRB submissions.

Based on the following protocol information, generate a clear, concise, and well-structured research abstract.

Protocol Information:
{protocol_json}

Additional context from user responses:
{collected_answers}

Generate an abstract with the following sections:
- Background: Why this research is important (context and significance)
- Objectives: Primary and secondary study objectives
- Methods: Study design, target population, and key procedures
- Expected Outcomes: What results are anticipated
- Significance: Impact and implications of the research

Requirements:
- Word limit: {word_limit} words (total, not per section)
- Use clear, accessible language
- Avoid jargon where possible
- Be specific about methodology
- Ensure scientific rigor is evident

Respond with a valid JSON object matching this structure:
{{
    "background": "string (min 50 chars)",
    "objectives": "string (min 30 chars)",
    "methods": "string (min 50 chars)",
    "expected_outcomes": "string (min 30 chars)",
    "significance": "string (min 30 chars)",
    "word_count": number (100-500)
}}"""

CONSENT_PROMPT = """You are an IRB specialist with expertise in creating informed consent documents that are both compliant and understandable.

Based on the following protocol information, generate a comprehensive informed consent form.

Protocol Information:
{protocol_json}

Additional context from user responses:
{collected_answers}

Generate an informed consent form with the following sections:
- Study Title: The full official study title
- Purpose of Study: Clear explanation of why the study is being conducted
- Procedures: What participants will be asked to do (in chronological order)
- Risks: All potential risks and discomforts, however minor
- Benefits: Potential benefits to participants and to society
- Confidentiality: How participant data will be protected and stored
- Voluntary Participation: Statement about voluntary nature and right to withdraw
- Contact Information: Who to contact for questions, concerns, and rights
- Consent Statement: Final consent statement with signature fields

Requirements:
- Write at an 8th-grade reading level
- Use clear, non-technical language
- Be comprehensive but not overwhelming
- Include all required regulatory elements

Respond with a valid JSON object matching this structure:
{{
    "study_title": "string",
    "purpose_of_study": "string",
    "procedures": "string",
    "risks": "string",
    "benefits": "string",
    "confidentiality": "string",
    "voluntary_participation": "string",
    "contact_information": "string",
    "consent_statement": "string"
}}"""

PROTOCOL_PROMPT = """You are a research protocol expert with deep knowledge of IRB requirements and scientific methodology.

Based on the following protocol information, generate a comprehensive research protocol document.

Protocol Information:
{protocol_json}

Additional context from user responses:
{collected_answers}

Generate a complete protocol document with the following sections:
- Title: Full protocol title
- Background: Scientific background, literature review, and rationale
- Objectives: Primary and secondary objectives (specific, measurable)
- Study Design: Detailed description of the study design
- Participants: Eligibility criteria and recruitment strategy
- Procedures: All study procedures and interventions
- Data Analysis: Statistical methods and analysis plan
- Ethical Considerations: Privacy, confidentiality, and ethical safeguards
- Timeline: Study timeline with key milestones
- References: Cited literature (if available from protocol)

Requirements:
- Be thorough and detailed
- Follow standard protocol format
- Include specific methodological details
- Address potential limitations

Respond with a valid JSON object matching this structure:
{{
    "title": "string",
    "background": "string",
    "objectives": "string",
    "study_design": "string",
    "participants": "string",
    "procedures": "string",
    "data_analysis": "string",
    "ethical_considerations": "string",
    "timeline": "string",
    "references": ["string", "string", ...]
}}"""

RECRUITMENT_PROMPT = """You are a clinical trial recruitment specialist creating materials to attract eligible participants.

Based on the following protocol information, generate recruitment materials.

Protocol Information:
{protocol_json}

Additional context from user responses:
{collected_answers}

Generate recruitment materials with:
- Study Title: Participant-friendly title
- Headline: Attention-grabbing headline for flyers/ads
- Eligibility Summary: Brief, clear eligibility criteria
- What to Expect: Overview of participation requirements
- Benefits/Compensation: What participants receive
- Contact Info: How to learn more or sign up

Requirements:
- Be engaging but not coercive
- Maintain IRB compliance standards
- Use clear, accessible language
- Avoid making promises or guarantees

Respond with a valid JSON object matching this structure:
{{
    "study_title": "string",
    "headline": "string",
    "eligibility_summary": "string",
    "what_to_expect": "string",
    "benefits_compensation": "string",
    "contact_info": "string"
}}"""

DATA_MANAGEMENT_PROMPT = """You are a research data management expert familiar with data governance and regulatory requirements.

Based on the following protocol information, generate a data management plan.

Protocol Information:
{protocol_json}

Additional context from user responses:
{collected_answers}

Generate a data management plan with:
- Data Types: All types of data to be collected
- Data Collection: Methods and tools for data collection
- Data Storage: Where and how data will be stored securely
- Data Access: Who has access and how it's controlled
- Data Retention: How long data will be kept and disposal procedures
- Backup Procedures: Backup and recovery procedures

Requirements:
- Address all regulatory requirements
- Be specific about security measures
- Include data lifecycle considerations
- Address both electronic and physical data

Respond with a valid JSON object matching this structure:
{{
    "data_types": "string",
    "data_collection": "string",
    "data_storage": "string",
    "data_access": "string",
    "data_retention": "string",
    "backup_procedures": "string"
}}"""

# Quality assessment prompt
QUALITY_ASSESSMENT_PROMPT = """Evaluate the quality of this generated {doc_type} document on a scale of 0-100.

Consider:
- Completeness: Are all required elements present?
- Clarity: Is the language clear and appropriate?
- Accuracy: Does it accurately reflect the protocol?
- Compliance: Does it meet regulatory requirements?
- Professionalism: Is it professionally written?

Document Content:
{document_content}

Original Protocol:
{protocol_json}

Respond with a JSON object:
{{
    "quality_score": number (0-100),
    "suggestions": ["improvement suggestion 1", "improvement suggestion 2", ...],
    "strengths": ["strength 1", "strength 2", ...],
    "weaknesses": ["weakness 1", "weakness 2", ...]
}}"""


class DocumentGenerator:
    """
    Service for generating research documents from extracted protocol data.

    Uses LLM orchestration with validation to generate:
    - Abstracts
    - Consent forms
    - Protocol documents
    - Recruitment materials
    - Data management plans

    All generated documents are validated against Pydantic schemas.
    """

    # Map document types to their generation prompts
    PROMPTS = {
        DocumentType.ABSTRACT: ABSTRACT_PROMPT,
        DocumentType.CONSENT_FORM: CONSENT_PROMPT,
        DocumentType.PROTOCOL: PROTOCOL_PROMPT,
        DocumentType.RECRUITMENT: RECRUITMENT_PROMPT,
        DocumentType.DATA_MANAGEMENT: DATA_MANAGEMENT_PROMPT,
    }

    # Map document types to their validation schemas
    SCHEMAS: dict[DocumentType, Type[BaseModel]] = {
        DocumentType.ABSTRACT: AbstractSchema,
        DocumentType.CONSENT_FORM: ConsentFormSchema,
        DocumentType.PROTOCOL: ProtocolDocumentSchema,
        DocumentType.RECRUITMENT: RecruitmentMaterialsSchema,
        DocumentType.DATA_MANAGEMENT: DataManagementPlanSchema,
    }

    def __init__(self):
        """Initialize the document generator with LLM orchestrator."""
        self.orchestrator = get_llm_orchestrator()

    def _count_words(self, content: dict) -> int:
        """Count total words in document content."""
        total = 0
        for value in content.values():
            if isinstance(value, str):
                total += len(value.split())
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, str):
                        total += len(item.split())
        return total

    def _format_protocol_for_prompt(self, protocol: ExtractedProtocol) -> str:
        """Format protocol data for inclusion in prompts."""
        return json.dumps(protocol.model_dump(), indent=2, default=str)

    def _format_answers_for_prompt(self, answers: Optional[dict]) -> str:
        """Format collected answers for inclusion in prompts."""
        if not answers:
            return "No additional context provided."
        return json.dumps(answers, indent=2, default=str)

    async def generate(
        self,
        doc_type: DocumentType,
        protocol: ExtractedProtocol,
        collected_answers: Optional[dict] = None,
        options: Optional[dict] = None,
    ) -> GeneratedDocument:
        """
        Generate a document of the specified type.

        Args:
            doc_type: Type of document to generate
            protocol: Extracted protocol data
            collected_answers: Additional answers from user
            options: Generation options (e.g., word_limit)

        Returns:
            GeneratedDocument with validated content

        Raises:
            ValueError: If document type is not supported
            LLMError: If generation fails
        """
        if doc_type not in self.PROMPTS:
            raise ValueError(f"Unsupported document type: {doc_type}")

        options = options or {}
        prompt_template = self.PROMPTS[doc_type]
        schema = self.SCHEMAS[doc_type]

        # Prepare prompt variables
        prompt_vars = {
            "protocol_json": self._format_protocol_for_prompt(protocol),
            "collected_answers": self._format_answers_for_prompt(collected_answers),
        }

        # Add document-specific options
        if doc_type == DocumentType.ABSTRACT:
            prompt_vars["word_limit"] = options.get("word_limit", 350)

        # Format the prompt
        formatted_prompt = prompt_template.format(**prompt_vars)

        # Create messages for LLM
        messages = [
            LLMMessage(role="user", content=formatted_prompt),
        ]

        system_prompt = (
            "You are an expert research document generator. "
            "Generate high-quality, compliant research documents. "
            "Always respond with valid JSON matching the specified schema."
        )

        logger.info(f"Generating {doc_type.value} document")

        # Generate with validation
        validated_content, response = await self.orchestrator.generate_validated(
            schema=schema,
            messages=messages,
            system_prompt=system_prompt,
            task_type="generation",
            max_tokens=4096,
            temperature=0.7,
        )

        content_dict = validated_content.model_dump()
        word_count = self._count_words(content_dict)

        # Assess quality
        quality_result = await self._assess_quality(
            doc_type=doc_type,
            content=content_dict,
            protocol=protocol,
        )

        return GeneratedDocument(
            doc_type=doc_type.value,
            content=content_dict,
            word_count=word_count,
            quality_score=quality_result.get("quality_score", 75),
            suggestions=quality_result.get("suggestions", []),
            generation_metadata={
                "provider": response.provider,
                "model": response.model,
                "tokens_used": response.usage.total_tokens if response.usage else 0,
                "options": options,
            },
        )

    async def _assess_quality(
        self,
        doc_type: DocumentType,
        content: dict,
        protocol: ExtractedProtocol,
    ) -> dict:
        """
        Assess the quality of a generated document.

        Returns dict with quality_score and suggestions.
        """
        try:
            prompt = QUALITY_ASSESSMENT_PROMPT.format(
                doc_type=doc_type.value,
                document_content=json.dumps(content, indent=2),
                protocol_json=self._format_protocol_for_prompt(protocol),
            )

            messages = [LLMMessage(role="user", content=prompt)]

            response = await self.orchestrator.generate(
                messages=messages,
                system_prompt="You are a document quality assessor. Respond only with valid JSON.",
                task_type="analysis",
                max_tokens=1024,
                temperature=0.3,
            )

            # Extract JSON from response
            result = self.orchestrator._extract_json(response.content)
            if result:
                return {
                    "quality_score": min(100, max(0, result.get("quality_score", 75))),
                    "suggestions": result.get("suggestions", []),
                }
        except Exception as e:
            logger.warning(f"Quality assessment failed: {e}")

        # Default quality assessment
        return {
            "quality_score": 75,
            "suggestions": ["Review for completeness before submission."],
        }

    async def generate_abstract(
        self,
        protocol: ExtractedProtocol,
        collected_answers: Optional[dict] = None,
        word_limit: int = 350,
    ) -> GeneratedDocument:
        """
        Generate a research abstract.

        Args:
            protocol: Extracted protocol data
            collected_answers: Additional user-provided answers
            word_limit: Maximum word count (default 350)

        Returns:
            GeneratedDocument containing the abstract
        """
        return await self.generate(
            doc_type=DocumentType.ABSTRACT,
            protocol=protocol,
            collected_answers=collected_answers,
            options={"word_limit": word_limit},
        )

    async def generate_consent_form(
        self,
        protocol: ExtractedProtocol,
        collected_answers: Optional[dict] = None,
    ) -> GeneratedDocument:
        """
        Generate an informed consent form.

        Args:
            protocol: Extracted protocol data
            collected_answers: Additional user-provided answers

        Returns:
            GeneratedDocument containing the consent form
        """
        return await self.generate(
            doc_type=DocumentType.CONSENT_FORM,
            protocol=protocol,
            collected_answers=collected_answers,
        )

    async def generate_protocol_document(
        self,
        protocol: ExtractedProtocol,
        collected_answers: Optional[dict] = None,
    ) -> GeneratedDocument:
        """
        Generate a full protocol document.

        Args:
            protocol: Extracted protocol data
            collected_answers: Additional user-provided answers

        Returns:
            GeneratedDocument containing the protocol
        """
        return await self.generate(
            doc_type=DocumentType.PROTOCOL,
            protocol=protocol,
            collected_answers=collected_answers,
        )

    async def generate_recruitment_materials(
        self,
        protocol: ExtractedProtocol,
        collected_answers: Optional[dict] = None,
    ) -> GeneratedDocument:
        """
        Generate recruitment materials.

        Args:
            protocol: Extracted protocol data
            collected_answers: Additional user-provided answers

        Returns:
            GeneratedDocument containing recruitment materials
        """
        return await self.generate(
            doc_type=DocumentType.RECRUITMENT,
            protocol=protocol,
            collected_answers=collected_answers,
        )

    async def generate_data_management_plan(
        self,
        protocol: ExtractedProtocol,
        collected_answers: Optional[dict] = None,
    ) -> GeneratedDocument:
        """
        Generate a data management plan.

        Args:
            protocol: Extracted protocol data
            collected_answers: Additional user-provided answers

        Returns:
            GeneratedDocument containing the data management plan
        """
        return await self.generate(
            doc_type=DocumentType.DATA_MANAGEMENT,
            protocol=protocol,
            collected_answers=collected_answers,
        )

    async def generate_all(
        self,
        protocol: ExtractedProtocol,
        collected_answers: Optional[dict] = None,
        doc_types: Optional[list[DocumentType]] = None,
    ) -> list[GeneratedDocument]:
        """
        Generate multiple documents at once.

        Args:
            protocol: Extracted protocol data
            collected_answers: Additional user-provided answers
            doc_types: List of document types to generate (defaults to abstract, consent, protocol)

        Returns:
            List of GeneratedDocument objects
        """
        if doc_types is None:
            doc_types = [
                DocumentType.ABSTRACT,
                DocumentType.CONSENT_FORM,
                DocumentType.PROTOCOL,
            ]

        results = []
        for doc_type in doc_types:
            try:
                doc = await self.generate(
                    doc_type=doc_type,
                    protocol=protocol,
                    collected_answers=collected_answers,
                )
                results.append(doc)
            except Exception as e:
                logger.error(f"Failed to generate {doc_type.value}: {e}")
                results.append(
                    GeneratedDocument(
                        doc_type=doc_type.value,
                        content={},
                        word_count=0,
                        quality_score=0,
                        suggestions=[f"Generation failed: {str(e)}"],
                        generation_metadata={"error": str(e)},
                    )
                )

        return results


# Module-level instance for convenience
_generator: Optional[DocumentGenerator] = None


def get_document_generator() -> DocumentGenerator:
    """Get the global document generator instance."""
    global _generator
    if _generator is None:
        _generator = DocumentGenerator()
    return _generator
