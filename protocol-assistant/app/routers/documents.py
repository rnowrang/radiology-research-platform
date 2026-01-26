"""Document upload and processing endpoints for Protocol Assistant."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.models.chat import ChatSession
from app.schemas.document import (
    DocumentParseResponse,
    ParsedDocument,
    PHIDetectionResult,
)
from app.schemas.protocol import (
    ExtractedProtocol,
    GapAnalysisResult,
    ProtocolExtractionResponse,
    ProtocolQualityAssessment,
)
from app.services.document_parser import (
    DocumentParser,
    DocumentParserError,
    get_document_parser,
)
from app.services.phi_detector import PHIDetector, get_phi_detector
from app.services.protocol_analyzer import (
    ProtocolAnalyzer,
    ProtocolAnalyzerError,
    get_protocol_analyzer,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])

# Maximum file size (10 MB)
MAX_FILE_SIZE = 10 * 1024 * 1024


def validate_file(file: UploadFile) -> None:
    """
    Validate uploaded file.

    Args:
        file: Uploaded file to validate

    Raises:
        HTTPException: If file is invalid
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided",
        )

    # Check file extension
    filename_lower = file.filename.lower()
    valid_extensions = [".pdf", ".docx", ".doc", ".rtf"]
    if not any(filename_lower.endswith(ext) for ext in valid_extensions):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type. Supported types: {', '.join(valid_extensions)}",
        )


@router.post(
    "/parse",
    response_model=DocumentParseResponse,
    summary="Parse a document",
    description="Parse a PDF or Word document and extract text and structure.",
)
async def parse_document(
    file: UploadFile = File(..., description="PDF or Word document to parse"),
) -> DocumentParseResponse:
    """
    Parse a document and return structured content.

    Extracts:
    - Full text content
    - Document sections with headings
    - Metadata (title, author, creation date)
    - Word and page counts

    Supported formats:
    - PDF (.pdf)
    - Word (.docx)
    """
    validate_file(file)

    try:
        # Read file content
        content = await file.read()

        # Check file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB",
            )

        # Parse the document
        parser = get_document_parser()
        document = await parser.parse(content, file.filename or "document")

        logger.info(
            f"Successfully parsed document: {file.filename}, "
            f"{document.word_count} words, {len(document.sections)} sections"
        )

        return DocumentParseResponse(
            success=True,
            document=document,
            error=None,
        )

    except DocumentParserError as e:
        logger.warning(f"Document parsing failed: {e.message}")
        return DocumentParseResponse(
            success=False,
            document=None,
            error=e.message,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error parsing document: {e}")
        return DocumentParseResponse(
            success=False,
            document=None,
            error=f"Unexpected error: {str(e)}",
        )
    finally:
        await file.close()


@router.post(
    "/extract-protocol",
    response_model=ProtocolExtractionResponse,
    summary="Extract protocol information",
    description="Parse document and extract structured protocol information using AI.",
)
async def extract_protocol(
    file: UploadFile = File(..., description="Protocol document to analyze"),
    include_gap_analysis: bool = Query(
        True, description="Whether to include gap analysis"
    ),
    include_quality_assessment: bool = Query(
        False, description="Whether to include quality assessment"
    ),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    db: AsyncSession = Depends(get_async_session),
) -> ProtocolExtractionResponse:
    """
    Parse document and extract protocol information.

    This endpoint:
    1. Parses the uploaded document
    2. Checks for PHI and redacts if found
    3. Extracts structured protocol information using AI
    4. Optionally performs gap analysis
    5. Optionally performs quality assessment

    The extracted information includes:
    - Study title and type
    - Objectives (primary and secondary)
    - Methodology details
    - Risks and benefits
    - Data collection information
    - Recommendations for improvement
    """
    validate_file(file)

    try:
        # Read file content
        content = await file.read()

        # Check file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB",
            )

        # Parse the document
        parser = get_document_parser()
        document = await parser.parse(content, file.filename or "document")

        # Check for PHI and redact before sending to LLM
        phi_detector = get_phi_detector()
        if phi_detector.has_phi(document.full_text):
            logger.warning(
                f"PHI detected in document {file.filename}, redacting before analysis"
            )
            # Redact PHI from full text
            redacted_text = phi_detector.redact(document.full_text)
            # Create a copy with redacted content
            document = ParsedDocument(
                full_text=redacted_text,
                sections=[
                    section.model_copy(
                        update={"content": phi_detector.redact(section.content)}
                    )
                    for section in document.sections
                ],
                metadata=document.metadata,
                word_count=document.word_count,
                page_count=document.page_count,
                filename=document.filename,
                file_type=document.file_type,
            )

        # Extract protocol information
        analyzer = get_protocol_analyzer()

        if include_quality_assessment:
            # Full analysis with quality assessment
            protocol, gap_analysis, quality = await analyzer.extract_and_analyze(
                document, include_quality_assessment=True
            )
        else:
            # Extract protocol
            protocol = await analyzer.extract_protocol_info(document)

            # Optional gap analysis
            gap_analysis = None
            if include_gap_analysis:
                gap_analysis = await analyzer.generate_gap_questions(protocol)

        logger.info(
            f"Successfully extracted protocol from {file.filename}: "
            f"'{protocol.study_title}', score={protocol.quality_score}"
        )

        # Check if extraction actually succeeded - if quality score is 0 or title
        # indicates no content was found, the document likely wasn't readable
        if protocol.quality_score == 0 or "no document" in (protocol.study_title or "").lower():
            logger.warning(
                f"Document {file.filename} was parsed but no meaningful content extracted. "
                f"Title: '{protocol.study_title}', score: {protocol.quality_score}"
            )
            return ProtocolExtractionResponse(
                success=False,
                protocol=None,
                gap_analysis=None,
                error=(
                    "Could not extract meaningful content from the document. "
                    "The file may be corrupted, password-protected, or in an unsupported format. "
                    "Please try: (1) Saving as PDF from Microsoft Word, or (2) Re-saving as .docx format."
                ),
            )

        # Store extracted protocol in session if session ID provided
        if x_session_id:
            try:
                session_uuid = UUID(x_session_id)
                update_values = {
                    "extracted_protocol": protocol.model_dump(),
                    "document_filename": file.filename,
                }
                if gap_analysis:
                    update_values["current_gaps"] = [g.model_dump() for g in gap_analysis.questions]

                await db.execute(
                    update(ChatSession)
                    .where(ChatSession.id == session_uuid)
                    .values(**update_values)
                )
                await db.commit()
                logger.info(f"Stored extracted protocol in session {x_session_id}")
            except ValueError as e:
                logger.warning(f"Invalid session ID format: {x_session_id}, error: {e}")
            except Exception as e:
                logger.error(f"Failed to store protocol in session: {e}")
                # Don't fail the request, just log the error

        return ProtocolExtractionResponse(
            success=True,
            protocol=protocol,
            gap_analysis=gap_analysis,
            error=None,
        )

    except DocumentParserError as e:
        logger.warning(f"Document parsing failed: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse document: {e.message}",
        )
    except ProtocolAnalyzerError as e:
        logger.warning(f"Protocol analysis failed: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to analyze protocol: {e.message}",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error extracting protocol: {e}")
        return ProtocolExtractionResponse(
            success=False,
            protocol=None,
            gap_analysis=None,
            error=f"Unexpected error: {str(e)}",
        )
    finally:
        await file.close()


@router.post(
    "/check-phi",
    response_model=PHIDetectionResult,
    summary="Check document for PHI",
    description="Scan a document for Protected Health Information (PHI).",
)
async def check_phi(
    file: UploadFile = File(..., description="Document to scan for PHI"),
    sensitivity: str = Query(
        "medium",
        description="Detection sensitivity: 'low', 'medium', or 'high'",
        pattern="^(low|medium|high)$",
    ),
    include_redacted: bool = Query(
        False, description="Whether to include redacted text in response"
    ),
) -> PHIDetectionResult:
    """
    Check document for potential PHI.

    Scans the document for common PHI patterns:
    - Medical Record Numbers (MRN)
    - Social Security Numbers (SSN)
    - Phone numbers
    - Email addresses
    - Dates of birth
    - Names (limited detection)
    - IP addresses

    Sensitivity levels:
    - low: Only detect clear PHI patterns
    - medium: Standard detection (default)
    - high: Aggressive detection, may have more false positives

    Note: This is pattern-based detection and may not catch all PHI.
    Human review is recommended for sensitive documents.
    """
    validate_file(file)

    try:
        # Read file content
        content = await file.read()

        # Check file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB",
            )

        # Parse the document
        parser = get_document_parser()
        document = await parser.parse(content, file.filename or "document")

        # Scan for PHI
        detector = get_phi_detector(sensitivity=sensitivity)
        matches = detector.scan(document.full_text)

        # Prepare response
        match_list = [
            {
                "type": m.type,
                "start": m.start,
                "end": m.end,
                "text": detector._partial_redact(m.text),  # Partially redact for safety
            }
            for m in matches
        ]

        redacted_text = None
        if include_redacted:
            redacted_text = detector.redact(document.full_text, matches)

        logger.info(
            f"PHI scan complete for {file.filename}: "
            f"found {len(matches)} potential PHI instances"
        )

        return PHIDetectionResult(
            has_phi=len(matches) > 0,
            matches=match_list,
            redacted_text=redacted_text,
            phi_count=len(matches),
        )

    except DocumentParserError as e:
        logger.warning(f"Document parsing failed: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse document: {e.message}",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error checking PHI: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error: {str(e)}",
        )
    finally:
        await file.close()


@router.post(
    "/analyze-quality",
    response_model=ProtocolQualityAssessment,
    summary="Analyze protocol quality",
    description="Perform detailed quality assessment of an extracted protocol.",
)
async def analyze_quality(
    file: UploadFile = File(..., description="Protocol document to analyze"),
) -> ProtocolQualityAssessment:
    """
    Perform detailed quality assessment of a protocol.

    This endpoint provides a comprehensive quality evaluation including:
    - Overall quality score
    - Section-by-section scores
    - Protocol strengths and weaknesses
    - IRB readiness assessment
    - Estimated completion percentage
    """
    validate_file(file)

    try:
        # Read file content
        content = await file.read()

        # Check file size
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)} MB",
            )

        # Parse the document
        parser = get_document_parser()
        document = await parser.parse(content, file.filename or "document")

        # Check for PHI and redact
        phi_detector = get_phi_detector()
        if phi_detector.has_phi(document.full_text):
            redacted_text = phi_detector.redact(document.full_text)
            document = ParsedDocument(
                full_text=redacted_text,
                sections=[
                    section.model_copy(
                        update={"content": phi_detector.redact(section.content)}
                    )
                    for section in document.sections
                ],
                metadata=document.metadata,
                word_count=document.word_count,
                page_count=document.page_count,
                filename=document.filename,
                file_type=document.file_type,
            )

        # Extract protocol and assess quality
        analyzer = get_protocol_analyzer()
        protocol = await analyzer.extract_protocol_info(document)
        quality = await analyzer.analyze_protocol_quality(protocol)

        logger.info(
            f"Quality assessment complete for {file.filename}: "
            f"score={quality.overall_score}, readiness={quality.irb_readiness}"
        )

        return quality

    except DocumentParserError as e:
        logger.warning(f"Document parsing failed: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to parse document: {e.message}",
        )
    except ProtocolAnalyzerError as e:
        logger.warning(f"Quality analysis failed: {e.message}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze quality: {e.message}",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error analyzing quality: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unexpected error: {str(e)}",
        )
    finally:
        await file.close()
