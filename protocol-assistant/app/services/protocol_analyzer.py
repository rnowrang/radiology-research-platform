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
EXTRACTION_USER_PROMPT = """Please analyze the following research protocol document and extract COMPREHENSIVE information.

IMPORTANT: Extract as much detail as possible from the document. Do NOT summarize - include full descriptions, all criteria, all risks, and all benefits mentioned in the document.

Document content:
---
{document_text}
---

Extract the following information into a JSON object. Be thorough and include ALL relevant information from the document:

## BASIC STUDY INFORMATION
- study_title: The complete title of the study
- principal_investigator: Full name and credentials of the PI if mentioned
- study_type: One of: retrospective, prospective, clinical_trial, quality_improvement, educational, other

## OBJECTIVES
- objectives:
  - primary: The COMPLETE primary study objective with full description (copy verbatim if possible)
  - secondary: List ALL secondary objectives mentioned (each as a complete statement)

## METHODOLOGY
- methodology:
  - design: FULL study design description including study type, phases, arms, randomization, blinding, etc.
  - population: Complete description of the target population including demographics, clinical characteristics
  - sample_size: Sample size with justification and power analysis if mentioned
  - inclusion_criteria: List EVERY inclusion criterion mentioned (do not summarize)
  - exclusion_criteria: List EVERY exclusion criterion mentioned (do not summarize)

## DATA COLLECTION
- data_collection:
  - sources: All data sources (medical records, questionnaires, lab values, imaging, etc.)
  - variables: List ALL variables to be collected (primary endpoints, secondary endpoints, safety measures, demographics)
  - timeline: Complete data collection timeline with visit schedules and time points

## RISKS AND BENEFITS
- risks_benefits:
  - risks: List EVERY risk mentioned including physical, psychological, social, and privacy risks
  - benefits: List ALL potential benefits to participants and society
  - mitigation: All risk mitigation strategies and safety monitoring procedures

## CONFIDENTIALITY
- confidentiality_measures: Complete description of data protection, storage, access controls, and privacy safeguards

## RECRUITMENT (new section)
- recruitment:
  - sources: List of recruitment sources (e.g., "clinic", "physician referral", "advertisements", "patient registry", "research database", "community outreach")
  - uses_flyers: Boolean - true if recruitment flyers/posters are mentioned
  - uses_verbal: Boolean - true if verbal/in-person recruitment is mentioned
  - uses_electronic: Boolean - true if electronic recruitment (email, website, social media) is mentioned
  - electronic_description: Description of electronic recruitment methods if used
  - description: Overall recruitment plan narrative

## CONSENT PROCESS (new section)
- consent:
  - plan_description: Full description of how informed consent will be obtained
  - location: Where consent will be obtained (clinic, research office, phone, etc.)
  - timing: When consent occurs relative to enrollment (before, at first visit, etc.)
  - documents_required: List of consent documents (e.g., "informed consent form", "HIPAA authorization", "assent form")
  - waiver_requested: Boolean - true if waiver of consent/documentation is requested
  - waiver_type: Type of waiver if requested (full waiver, waiver of documentation, partial waiver)
  - inducement: Description of subject compensation or payment if mentioned

## POPULATION DETAILS (new section)
- population_details:
  - healthy_count: Number of healthy volunteers if specified (integer)
  - patient_count: Number of patients if specified (integer)
  - total_count: Total sample size (integer)
  - healthy_age_range: Age range for healthy volunteers (e.g., "18-65 years")
  - patient_age_range: Age range for patients (e.g., "18 and older")
  - overall_age_range: Overall age range if not broken down
  - vulnerable_populations: List any vulnerable populations included (e.g., "children", "pregnant women", "prisoners", "cognitively impaired", "economically disadvantaged")
  - special_populations: List any special populations (e.g., "LLU employees", "LLU students", "non-English speakers")

## PROCEDURES (new section)
- procedures:
  - location: Where study procedures will be performed (specific clinic, hospital, research center)
  - minimal_risk: List of minimal risk procedures (e.g., "surveys", "questionnaires", "venipuncture", "urine collection", "saliva collection", "vital signs", "height/weight")
  - greater_risk: List of greater than minimal risk procedures (e.g., "MRI with contrast", "biopsy", "investigational drug", "experimental device")
  - safety_monitoring: Safety monitoring plan (e.g., "PI monitoring", "DSMB", "sponsor safety committee", "none required")

## DATA SECURITY (new section)
- data_security:
  - electronic_collection: Boolean - true if data collected electronically (REDCap, database, etc.)
  - electronic_protections: List of electronic data protections (e.g., "password protection", "encryption", "firewall", "VPN", "role-based access", "audit trail")
  - hardcopy_stored: Boolean - true if hardcopy/paper data is stored
  - hardcopy_storage: List of hardcopy storage methods (e.g., "locked cabinet", "locked office", "restricted access area")
  - collecting_health_info: Boolean - true if collecting PHI/protected health information
  - phi_shared_externally: Boolean - true if PHI shared outside institution
  - phi_shared_with: List who PHI is shared with (e.g., "sponsor", "FDA", "DSMB", "collaborating institution")

## REGULATORY STATUS (new section)
- regulatory:
  - fda_regulated: Boolean - true if FDA regulations apply (drug, device, biologic)
  - ind_number: IND number if mentioned
  - ide_number: IDE number if mentioned
  - uses_ionizing_radiation: Boolean - true if ionizing radiation used (X-ray, CT, PET, nuclear medicine)
  - involves_infectious_agents: Boolean - true if infectious agents/select agents used
  - involves_recombinant_dna: Boolean - true if recombinant DNA used
  - involves_hazardous_materials: Boolean - true if hazardous chemicals/materials used
  - is_student_project: Boolean - true if this is a student research project (thesis, dissertation, class project)

## QUALITY ASSESSMENT
- missing_sections: List any IRB-required sections that appear to be missing or incomplete
- quality_score: Score from 0-100 based on completeness and clarity (be realistic - most drafts score 40-70)
- recommendations: Specific, actionable recommendations for improvement

IMPORTANT NOTES:
1. For boolean fields, only set to true if there is clear evidence in the document. Set to null if not mentioned.
2. For list fields, include all items mentioned even if they seem redundant.
3. For optional string fields, include full text rather than summarizing.
4. If a section is not applicable (e.g., recruitment for retrospective studies), you may still extract what is mentioned or leave null.

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
        max_tokens: int = 8192,
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
