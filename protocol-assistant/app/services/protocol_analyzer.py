"""Protocol analyzer service for extracting and analyzing research protocols using LLM."""

import json
import logging
from typing import Optional

from app.schemas.document import ParsedDocument
from app.schemas.protocol import (
    ExtractedProtocol,
    GapQuestion,
    GapAnalysisResult,
    ProtocolQualityAssessment,
    StudyType,
)
from app.services.llm import get_llm_orchestrator, LLMMessage, LLMError

logger = logging.getLogger(__name__)


# System prompt for protocol extraction
EXTRACTION_SYSTEM_PROMPT = """You are a research protocol analyst specializing in IRB (Institutional Review Board) submissions. Your task is to extract structured information from research protocol documents.

You must analyze the provided document and extract key information into a structured JSON format. Be thorough but also identify what information is missing or incomplete.

Important guidelines:
1. Extract information exactly as stated in the document when possible
2. For missing information, leave fields empty or use appropriate defaults
3. Identify the study type based on the described methodology
4. Be conservative in quality scoring - only give high scores for comprehensive protocols
5. Include specific recommendations for improvement

Respond ONLY with valid JSON matching the required schema. Do not include any additional text or explanations outside the JSON."""


# User prompt template for extraction
EXTRACTION_USER_PROMPT = """Please analyze the following research protocol document and extract the key information.

Document content:
---
{document_text}
---

Extract the following information into a JSON object:
- study_title: The title of the study
- principal_investigator: Name of the PI if mentioned
- study_type: One of: retrospective, prospective, clinical_trial, quality_improvement, educational, other
- objectives:
  - primary: The primary study objective (minimum 10 characters)
  - secondary: List of secondary objectives
- methodology:
  - design: Study design description
  - population: Target population description
  - sample_size: Sample size or estimation if mentioned
  - inclusion_criteria: List of inclusion criteria
  - exclusion_criteria: List of exclusion criteria
- data_collection:
  - sources: Data sources
  - variables: Variables to be collected
  - timeline: Data collection timeline
- risks_benefits:
  - risks: List of identified risks
  - benefits: List of potential benefits
  - mitigation: Risk mitigation strategies
- confidentiality_measures: Description of data protection measures
- missing_sections: List any sections that appear to be missing or incomplete
- quality_score: Score from 0-100 based on completeness and clarity
- recommendations: List of specific recommendations for improvement

Respond with valid JSON only."""


# System prompt for gap analysis
GAP_ANALYSIS_SYSTEM_PROMPT = """You are a research protocol analyst helping researchers prepare their IRB submissions. Your task is to generate targeted questions to gather missing or incomplete information from the extracted protocol.

Focus on:
1. Information required by IRB for approval
2. Clarity and completeness of methodology
3. Risk assessment and mitigation
4. Subject protection and informed consent
5. Data security and confidentiality

Generate questions that are:
- Specific and actionable
- Prioritized by importance for IRB approval
- Mapped to relevant form fields when applicable

Respond ONLY with valid JSON matching the required schema."""


# User prompt template for gap analysis
GAP_ANALYSIS_USER_PROMPT = """Based on the following extracted protocol information, generate a list of questions to gather missing or incomplete information.

Extracted Protocol:
---
{protocol_json}
---

Missing sections identified: {missing_sections}

Quality score: {quality_score}/100

Generate a JSON response with:
- questions: List of gap questions, each with:
  - question: The specific question to ask (minimum 10 characters)
  - section: Which protocol section this relates to (e.g., "methodology", "risks", "data_collection")
  - priority: "high", "medium", or "low" based on IRB requirements
  - field_mapping: Optional mapping to form field (e.g., "methodology.sample_size")
  - rationale: Why this information is needed
- completeness_score: Percentage of protocol that is complete (0-100)
- critical_gaps: List of the most critical missing information
- summary: Brief summary of the gap analysis

Respond with valid JSON only."""


# System prompt for quality assessment
QUALITY_ASSESSMENT_PROMPT = """You are an IRB protocol reviewer assessing the quality and completeness of research protocols. Evaluate the protocol objectively and provide specific feedback.

Consider:
1. Clarity of objectives and methodology
2. Adequacy of subject protections
3. Completeness of risk/benefit analysis
4. Data management and privacy measures
5. Overall readiness for IRB submission

Be specific in your assessment and provide actionable feedback."""


class ProtocolAnalyzerError(Exception):
    """Exception raised when protocol analysis fails."""

    def __init__(self, message: str, details: Optional[dict] = None):
        self.message = message
        self.details = details or {}
        super().__init__(message)


class ProtocolAnalyzer:
    """
    Analyzes research protocol documents using LLM.

    This service:
    - Extracts structured information from protocol documents
    - Identifies gaps and missing information
    - Generates targeted questions to fill gaps
    - Assesses protocol quality and IRB readiness
    """

    def __init__(self):
        """Initialize the protocol analyzer with LLM orchestrator."""
        self.orchestrator = get_llm_orchestrator()

    async def extract_protocol_info(
        self,
        document: ParsedDocument,
        max_tokens: int = 4096,
    ) -> ExtractedProtocol:
        """
        Extract structured protocol information from a parsed document.

        Args:
            document: Parsed document with text and structure
            max_tokens: Maximum tokens for LLM response

        Returns:
            ExtractedProtocol with structured information

        Raises:
            ProtocolAnalyzerError: If extraction fails
        """
        try:
            # Prepare the document text (truncate if too long)
            doc_text = self._prepare_document_text(document)

            # Create the user message with document content
            user_prompt = EXTRACTION_USER_PROMPT.format(document_text=doc_text)

            messages = [LLMMessage(role="user", content=user_prompt)]

            # Use orchestrator to extract with validation
            extracted, response = await self.orchestrator.generate_validated(
                schema=ExtractedProtocol,
                messages=messages,
                system_prompt=EXTRACTION_SYSTEM_PROMPT,
                task_type="extraction",
                max_tokens=max_tokens,
                temperature=0.3,  # Lower temperature for more consistent extraction
            )

            logger.info(
                f"Successfully extracted protocol: {extracted.study_title}, "
                f"quality score: {extracted.quality_score}"
            )

            return extracted

        except LLMError as e:
            logger.error(f"LLM error during protocol extraction: {e}")
            raise ProtocolAnalyzerError(
                f"Failed to extract protocol information: {e.message}",
                details={"provider": e.provider},
            )
        except Exception as e:
            logger.error(f"Unexpected error during protocol extraction: {e}")
            raise ProtocolAnalyzerError(f"Protocol extraction failed: {str(e)}")

    async def generate_gap_questions(
        self,
        protocol: ExtractedProtocol,
        max_questions: int = 10,
    ) -> GapAnalysisResult:
        """
        Generate questions to fill gaps in the extracted protocol.

        Args:
            protocol: Extracted protocol information
            max_questions: Maximum number of questions to generate

        Returns:
            GapAnalysisResult with questions and analysis

        Raises:
            ProtocolAnalyzerError: If gap analysis fails
        """
        try:
            # Convert protocol to JSON for the prompt
            protocol_dict = protocol.model_dump()
            protocol_json = json.dumps(protocol_dict, indent=2)

            # Create the user message
            user_prompt = GAP_ANALYSIS_USER_PROMPT.format(
                protocol_json=protocol_json,
                missing_sections=", ".join(protocol.missing_sections) or "None identified",
                quality_score=protocol.quality_score,
            )

            messages = [LLMMessage(role="user", content=user_prompt)]

            # Use orchestrator to generate gap analysis
            gap_analysis, response = await self.orchestrator.generate_validated(
                schema=GapAnalysisResult,
                messages=messages,
                system_prompt=GAP_ANALYSIS_SYSTEM_PROMPT,
                task_type="analysis",
                max_tokens=2048,
                temperature=0.5,
            )

            # Limit questions if needed
            if len(gap_analysis.questions) > max_questions:
                # Sort by priority and keep top questions
                priority_order = {"high": 0, "medium": 1, "low": 2}
                sorted_questions = sorted(
                    gap_analysis.questions,
                    key=lambda q: priority_order.get(q.priority, 3),
                )
                gap_analysis.questions = sorted_questions[:max_questions]

            logger.info(
                f"Generated {len(gap_analysis.questions)} gap questions, "
                f"completeness: {gap_analysis.completeness_score}%"
            )

            return gap_analysis

        except LLMError as e:
            logger.error(f"LLM error during gap analysis: {e}")
            raise ProtocolAnalyzerError(
                f"Failed to generate gap questions: {e.message}",
                details={"provider": e.provider},
            )
        except Exception as e:
            logger.error(f"Unexpected error during gap analysis: {e}")
            raise ProtocolAnalyzerError(f"Gap analysis failed: {str(e)}")

    async def analyze_protocol_quality(
        self,
        protocol: ExtractedProtocol,
    ) -> ProtocolQualityAssessment:
        """
        Assess the quality and IRB readiness of a protocol.

        Args:
            protocol: Extracted protocol information

        Returns:
            ProtocolQualityAssessment with detailed evaluation

        Raises:
            ProtocolAnalyzerError: If quality assessment fails
        """
        try:
            # Convert protocol to JSON for the prompt
            protocol_dict = protocol.model_dump()
            protocol_json = json.dumps(protocol_dict, indent=2)

            user_prompt = f"""Assess the quality of this research protocol:

{protocol_json}

Provide a JSON response with:
- overall_score: 0-100 quality score
- section_scores: Dictionary mapping section names to scores (0-100)
- strengths: List of protocol strengths
- weaknesses: List of protocol weaknesses
- irb_readiness: Assessment string (e.g., "Ready for submission", "Needs minor revisions", "Significant gaps remain")
- estimated_completion: Percentage of protocol that is complete (0-100)

Respond with valid JSON only."""

            messages = [LLMMessage(role="user", content=user_prompt)]

            # Use orchestrator for quality assessment
            assessment, response = await self.orchestrator.generate_validated(
                schema=ProtocolQualityAssessment,
                messages=messages,
                system_prompt=QUALITY_ASSESSMENT_PROMPT,
                task_type="analysis",
                max_tokens=2048,
                temperature=0.4,
            )

            logger.info(
                f"Quality assessment complete: score={assessment.overall_score}, "
                f"readiness={assessment.irb_readiness}"
            )

            return assessment

        except LLMError as e:
            logger.error(f"LLM error during quality assessment: {e}")
            raise ProtocolAnalyzerError(
                f"Failed to assess protocol quality: {e.message}",
                details={"provider": e.provider},
            )
        except Exception as e:
            logger.error(f"Unexpected error during quality assessment: {e}")
            raise ProtocolAnalyzerError(f"Quality assessment failed: {str(e)}")

    async def extract_and_analyze(
        self,
        document: ParsedDocument,
        include_quality_assessment: bool = True,
    ) -> tuple[ExtractedProtocol, GapAnalysisResult, Optional[ProtocolQualityAssessment]]:
        """
        Full protocol analysis pipeline: extract, gap analysis, and quality assessment.

        Args:
            document: Parsed document to analyze
            include_quality_assessment: Whether to include quality assessment

        Returns:
            Tuple of (extracted protocol, gap analysis, optional quality assessment)
        """
        # Extract protocol information
        protocol = await self.extract_protocol_info(document)

        # Generate gap questions
        gaps = await self.generate_gap_questions(protocol)

        # Quality assessment (optional)
        quality = None
        if include_quality_assessment:
            quality = await self.analyze_protocol_quality(protocol)

        return protocol, gaps, quality

    def _prepare_document_text(
        self,
        document: ParsedDocument,
        max_chars: int = 50000,
    ) -> str:
        """
        Prepare document text for LLM processing.

        Truncates if necessary while trying to preserve structure.

        Args:
            document: Parsed document
            max_chars: Maximum characters to include

        Returns:
            Prepared text for LLM
        """
        # If document has sections, use them for better structure
        if document.sections:
            parts = []
            remaining_chars = max_chars

            for section in document.sections:
                section_text = f"\n## {section.title}\n{section.content}"

                if len(section_text) <= remaining_chars:
                    parts.append(section_text)
                    remaining_chars -= len(section_text)
                else:
                    # Truncate this section
                    truncated = section_text[:remaining_chars] + "\n[...truncated...]"
                    parts.append(truncated)
                    break

            return "\n".join(parts)

        # Fall back to full text
        text = document.full_text
        if len(text) > max_chars:
            return text[:max_chars] + "\n\n[...document truncated due to length...]"
        return text

    def _calculate_base_quality_score(self, protocol: ExtractedProtocol) -> int:
        """
        Calculate a base quality score from protocol completeness.

        Used as a fallback or validation check.

        Args:
            protocol: Extracted protocol

        Returns:
            Quality score 0-100
        """
        score = 0
        max_score = 100

        # Title (5 points)
        if len(protocol.study_title) >= 10:
            score += 5

        # PI (5 points)
        if protocol.principal_investigator:
            score += 5

        # Objectives (15 points)
        if len(protocol.objectives.primary) >= 20:
            score += 10
        if protocol.objectives.secondary:
            score += 5

        # Methodology (25 points)
        if len(protocol.methodology.design) >= 20:
            score += 10
        if len(protocol.methodology.population) >= 20:
            score += 5
        if protocol.methodology.inclusion_criteria:
            score += 5
        if protocol.methodology.exclusion_criteria:
            score += 5

        # Data Collection (15 points)
        if protocol.data_collection:
            if protocol.data_collection.sources:
                score += 5
            if protocol.data_collection.variables:
                score += 5
            if protocol.data_collection.timeline:
                score += 5

        # Risks/Benefits (20 points)
        if protocol.risks_benefits.risks:
            score += 7
        if protocol.risks_benefits.benefits:
            score += 7
        if protocol.risks_benefits.mitigation:
            score += 6

        # Confidentiality (10 points)
        if protocol.confidentiality_measures and len(protocol.confidentiality_measures) >= 20:
            score += 10

        # Penalty for missing sections
        penalty = len(protocol.missing_sections) * 3
        score = max(0, score - penalty)

        return min(score, max_score)


# Global instance for dependency injection
_protocol_analyzer: Optional[ProtocolAnalyzer] = None


def get_protocol_analyzer() -> ProtocolAnalyzer:
    """Get the global protocol analyzer instance."""
    global _protocol_analyzer
    if _protocol_analyzer is None:
        _protocol_analyzer = ProtocolAnalyzer()
    return _protocol_analyzer
