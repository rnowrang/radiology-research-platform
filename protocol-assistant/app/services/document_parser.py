"""Document parser service for extracting text and structure from PDF/Word documents."""

import io
import logging
import re
import subprocess
import tempfile
from typing import Optional

import PyPDF2
from docx import Document
from docx.shared import Pt
from striprtf.striprtf import rtf_to_text

from app.schemas.document import DocumentSection, ParsedDocument

logger = logging.getLogger(__name__)


class DocumentParserError(Exception):
    """Exception raised when document parsing fails."""

    def __init__(self, message: str, filename: Optional[str] = None):
        self.message = message
        self.filename = filename
        super().__init__(message)


class DocumentParser:
    """
    Extracts text and structure from PDF and Word documents.

    Supports:
    - PDF files (.pdf)
    - Word documents (.docx)
    - Automatic section detection based on headings
    - Word and page counting
    """

    SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".doc", ".rtf"]

    # Common section headers in research protocols
    SECTION_PATTERNS = [
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:ABSTRACT|INTRODUCTION|BACKGROUND)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:OBJECTIVES?|AIMS?|PURPOSE)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:METHODS?|METHODOLOGY|PROCEDURES?)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:STUDY DESIGN|DESIGN)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:POPULATION|PARTICIPANTS?|SUBJECTS?)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:INCLUSION|EXCLUSION)\s*CRITERIA",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:DATA COLLECTION|DATA SOURCES?)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:ANALYSIS|STATISTICAL|DATA ANALYSIS)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:RISKS?|BENEFITS?|RISKS?\s*(?:AND|&)\s*BENEFITS?)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:CONFIDENTIALITY|PRIVACY|DATA SECURITY)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:INFORMED CONSENT|CONSENT)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:TIMELINE|SCHEDULE|DURATION)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:REFERENCES?|BIBLIOGRAPHY)",
        r"^(?:(?:\d+\.?\s*)+|[A-Z]+\.?\s*)?(?:APPENDIX|APPENDICES|ATTACHMENTS?)",
    ]

    async def parse(self, file_content: bytes, filename: str) -> ParsedDocument:
        """
        Parse a document and extract text and structure.

        Args:
            file_content: Raw bytes of the document file
            filename: Original filename to determine file type

        Returns:
            ParsedDocument with extracted content and structure

        Raises:
            DocumentParserError: If parsing fails or file type is unsupported
        """
        filename_lower = filename.lower()

        if filename_lower.endswith(".pdf"):
            return await self._parse_pdf(file_content, filename)
        elif filename_lower.endswith(".docx"):
            try:
                return await self._parse_docx(file_content, filename)
            except DocumentParserError as e:
                # If docx parsing fails with "not a zip file", try other parsers
                if "zip file" in str(e.message).lower():
                    logger.info(f"File {filename} appears to be .doc format despite .docx extension, trying .doc parser")
                    try:
                        return await self._parse_doc(file_content, filename)
                    except DocumentParserError as doc_error:
                        # If .doc also fails, try RTF parser as last resort
                        if "not a Word Document" in str(doc_error.message):
                            logger.info(f"File {filename} also not .doc, trying RTF parser")
                            return await self._parse_rtf(file_content, filename)
                        raise
                raise
        elif filename_lower.endswith(".doc"):
            try:
                return await self._parse_doc(file_content, filename)
            except DocumentParserError as e:
                # If .doc parsing fails, try RTF as fallback
                if "not a Word Document" in str(e.message):
                    logger.info(f"File {filename} not a valid .doc, trying RTF parser")
                    return await self._parse_rtf(file_content, filename)
                raise
        elif filename_lower.endswith(".rtf"):
            return await self._parse_rtf(file_content, filename)
        else:
            raise DocumentParserError(
                f"Unsupported file type. Supported types: {', '.join(self.SUPPORTED_EXTENSIONS)}",
                filename=filename,
            )

    async def _parse_pdf(self, content: bytes, filename: str) -> ParsedDocument:
        """
        Parse a PDF document.

        Extracts text page by page and attempts to identify section headers.

        Args:
            content: PDF file content as bytes
            filename: Original filename

        Returns:
            ParsedDocument with extracted content
        """
        try:
            pdf_file = io.BytesIO(content)
            reader = PyPDF2.PdfReader(pdf_file)

            page_count = len(reader.pages)
            full_text_parts = []
            sections = []
            current_section_title = None
            current_section_content = []
            current_section_page = 1

            for page_num, page in enumerate(reader.pages, start=1):
                page_text = page.extract_text() or ""
                full_text_parts.append(page_text)

                # Process each line to identify sections
                lines = page_text.split("\n")
                for line in lines:
                    line_stripped = line.strip()
                    if not line_stripped:
                        continue

                    # Check if this line is a section header
                    is_header = self._is_section_header(line_stripped)

                    if is_header:
                        # Save previous section if exists
                        if current_section_title and current_section_content:
                            sections.append(
                                DocumentSection(
                                    title=current_section_title,
                                    content="\n".join(current_section_content).strip(),
                                    page_number=current_section_page,
                                    heading_level=self._estimate_heading_level(
                                        current_section_title
                                    ),
                                )
                            )
                        # Start new section
                        current_section_title = line_stripped
                        current_section_content = []
                        current_section_page = page_num
                    elif current_section_title:
                        current_section_content.append(line_stripped)

            # Save final section
            if current_section_title and current_section_content:
                sections.append(
                    DocumentSection(
                        title=current_section_title,
                        content="\n".join(current_section_content).strip(),
                        page_number=current_section_page,
                        heading_level=self._estimate_heading_level(current_section_title),
                    )
                )

            full_text = "\n\n".join(full_text_parts)

            # If no sections were detected, create a single section from all content
            if not sections and full_text.strip():
                sections.append(
                    DocumentSection(
                        title="Document Content",
                        content=full_text.strip(),
                        page_number=1,
                        heading_level=1,
                    )
                )

            return ParsedDocument(
                full_text=full_text,
                sections=sections,
                metadata=self._extract_pdf_metadata(reader),
                word_count=self._count_words(full_text),
                page_count=page_count,
                filename=filename,
                file_type=".pdf",
            )

        except PyPDF2.errors.PdfReadError as e:
            logger.error(f"Failed to parse PDF {filename}: {e}")
            raise DocumentParserError(
                f"Failed to parse PDF: {str(e)}", filename=filename
            )
        except Exception as e:
            logger.error(f"Unexpected error parsing PDF {filename}: {e}")
            raise DocumentParserError(
                f"Unexpected error parsing PDF: {str(e)}", filename=filename
            )

    async def _parse_docx(self, content: bytes, filename: str) -> ParsedDocument:
        """
        Parse a Word document (.docx).

        Uses python-docx to extract paragraphs and identify sections by heading styles.

        Args:
            content: DOCX file content as bytes
            filename: Original filename

        Returns:
            ParsedDocument with extracted content
        """
        try:
            docx_file = io.BytesIO(content)
            document = Document(docx_file)

            full_text_parts = []
            sections = []
            current_section_title = None
            current_section_content = []
            current_heading_level = None

            for paragraph in document.paragraphs:
                text = paragraph.text.strip()
                if not text:
                    continue

                # Check if this is a heading style
                style_name = paragraph.style.name if paragraph.style else ""
                is_heading = style_name.startswith("Heading") or style_name == "Title"

                # Extract heading level from style
                heading_level = None
                if is_heading:
                    if style_name == "Title":
                        heading_level = 1
                    elif style_name.startswith("Heading"):
                        try:
                            heading_level = int(style_name.replace("Heading ", ""))
                        except ValueError:
                            heading_level = 2

                # Also check for section patterns in regular text (all caps, numbered sections)
                if not is_heading:
                    is_heading = self._is_section_header(text)
                    if is_heading:
                        heading_level = self._estimate_heading_level(text)

                full_text_parts.append(text)

                if is_heading:
                    # Save previous section
                    if current_section_title and current_section_content:
                        sections.append(
                            DocumentSection(
                                title=current_section_title,
                                content="\n".join(current_section_content).strip(),
                                page_number=None,
                                heading_level=current_heading_level,
                            )
                        )
                    current_section_title = text
                    current_section_content = []
                    current_heading_level = heading_level
                elif current_section_title:
                    current_section_content.append(text)

            # Save final section
            if current_section_title and current_section_content:
                sections.append(
                    DocumentSection(
                        title=current_section_title,
                        content="\n".join(current_section_content).strip(),
                        page_number=None,
                        heading_level=current_heading_level,
                    )
                )

            full_text = "\n\n".join(full_text_parts)

            # If no sections were detected, create a single section from all content
            if not sections and full_text.strip():
                sections.append(
                    DocumentSection(
                        title="Document Content",
                        content=full_text.strip(),
                        page_number=None,
                        heading_level=1,
                    )
                )

            # Extract metadata from document properties
            metadata = self._extract_docx_metadata(document)

            return ParsedDocument(
                full_text=full_text,
                sections=sections,
                metadata=metadata,
                word_count=self._count_words(full_text),
                page_count=self._estimate_docx_pages(full_text),
                filename=filename,
                file_type=".docx",
            )

        except Exception as e:
            logger.error(f"Failed to parse DOCX {filename}: {e}")
            raise DocumentParserError(
                f"Failed to parse Word document: {str(e)}", filename=filename
            )

    async def _parse_doc(self, content: bytes, filename: str) -> ParsedDocument:
        """
        Parse a legacy Word document (.doc) using antiword.

        Args:
            content: DOC file content as bytes
            filename: Original filename

        Returns:
            ParsedDocument with extracted content
        """
        try:
            # Write content to a temporary file (antiword needs a file path)
            with tempfile.NamedTemporaryFile(suffix=".doc", delete=False) as tmp_file:
                tmp_file.write(content)
                tmp_path = tmp_file.name

            try:
                # Use antiword to extract text
                result = subprocess.run(
                    ["antiword", "-w", "0", tmp_path],
                    capture_output=True,
                    text=True,
                    timeout=30,
                )

                if result.returncode != 0:
                    error_msg = result.stderr.strip() or "Unknown error"
                    raise DocumentParserError(
                        f"antiword failed to parse document: {error_msg}",
                        filename=filename,
                    )

                full_text = result.stdout

            finally:
                # Clean up temp file
                import os
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

            if not full_text.strip():
                raise DocumentParserError(
                    "No text could be extracted from the document",
                    filename=filename,
                )

            # Parse sections from extracted text
            sections = []
            current_section_title = None
            current_section_content = []

            lines = full_text.split("\n")
            for line in lines:
                line_stripped = line.strip()
                if not line_stripped:
                    continue

                # Check if this line is a section header
                is_header = self._is_section_header(line_stripped)

                if is_header:
                    # Save previous section if exists
                    if current_section_title and current_section_content:
                        sections.append(
                            DocumentSection(
                                title=current_section_title,
                                content="\n".join(current_section_content).strip(),
                                page_number=None,
                                heading_level=self._estimate_heading_level(
                                    current_section_title
                                ),
                            )
                        )
                    # Start new section
                    current_section_title = line_stripped
                    current_section_content = []
                elif current_section_title:
                    current_section_content.append(line_stripped)

            # Save final section
            if current_section_title and current_section_content:
                sections.append(
                    DocumentSection(
                        title=current_section_title,
                        content="\n".join(current_section_content).strip(),
                        page_number=None,
                        heading_level=self._estimate_heading_level(current_section_title),
                    )
                )

            # If no sections were detected, create a single section from all content
            if not sections and full_text.strip():
                sections.append(
                    DocumentSection(
                        title="Document Content",
                        content=full_text.strip(),
                        page_number=None,
                        heading_level=1,
                    )
                )

            return ParsedDocument(
                full_text=full_text,
                sections=sections,
                metadata={},
                word_count=self._count_words(full_text),
                page_count=self._estimate_docx_pages(full_text),
                filename=filename,
                file_type=".doc",
            )

        except DocumentParserError:
            raise
        except subprocess.TimeoutExpired:
            logger.error(f"Timeout parsing DOC {filename}")
            raise DocumentParserError(
                "Document parsing timed out", filename=filename
            )
        except FileNotFoundError:
            logger.error("antiword not found - is it installed?")
            raise DocumentParserError(
                "Server cannot process .doc files - antiword not installed",
                filename=filename,
            )
        except Exception as e:
            logger.error(f"Failed to parse DOC {filename}: {e}")
            raise DocumentParserError(
                f"Failed to parse legacy Word document: {str(e)}", filename=filename
            )

    async def _parse_rtf(self, content: bytes, filename: str) -> ParsedDocument:
        """
        Parse an RTF (Rich Text Format) document.

        Args:
            content: RTF file content as bytes
            filename: Original filename

        Returns:
            ParsedDocument with extracted content
        """
        try:
            # Decode bytes to string - RTF is text-based
            try:
                rtf_content = content.decode('utf-8')
            except UnicodeDecodeError:
                rtf_content = content.decode('latin-1')

            # Convert RTF to plain text
            full_text = rtf_to_text(rtf_content)

            if not full_text or not full_text.strip():
                raise DocumentParserError(
                    "No text could be extracted from the RTF document",
                    filename=filename,
                )

            # Parse sections from extracted text
            sections = []
            current_section_title = None
            current_section_content = []

            lines = full_text.split("\n")
            for line in lines:
                line_stripped = line.strip()
                if not line_stripped:
                    continue

                # Check if this line is a section header
                is_header = self._is_section_header(line_stripped)

                if is_header:
                    # Save previous section if exists
                    if current_section_title and current_section_content:
                        sections.append(
                            DocumentSection(
                                title=current_section_title,
                                content="\n".join(current_section_content).strip(),
                                page_number=None,
                                heading_level=self._estimate_heading_level(
                                    current_section_title
                                ),
                            )
                        )
                    # Start new section
                    current_section_title = line_stripped
                    current_section_content = []
                elif current_section_title:
                    current_section_content.append(line_stripped)

            # Save final section
            if current_section_title and current_section_content:
                sections.append(
                    DocumentSection(
                        title=current_section_title,
                        content="\n".join(current_section_content).strip(),
                        page_number=None,
                        heading_level=self._estimate_heading_level(current_section_title),
                    )
                )

            # If no sections were detected, create a single section from all content
            if not sections and full_text.strip():
                sections.append(
                    DocumentSection(
                        title="Document Content",
                        content=full_text.strip(),
                        page_number=None,
                        heading_level=1,
                    )
                )

            return ParsedDocument(
                full_text=full_text,
                sections=sections,
                metadata={},
                word_count=self._count_words(full_text),
                page_count=self._estimate_docx_pages(full_text),
                filename=filename,
                file_type=".rtf",
            )

        except DocumentParserError:
            raise
        except Exception as e:
            logger.error(f"Failed to parse RTF {filename}: {e}")
            raise DocumentParserError(
                f"Failed to parse RTF document: {str(e)}", filename=filename
            )

    def _is_section_header(self, text: str) -> bool:
        """
        Determine if a line of text is likely a section header.

        Args:
            text: Line of text to check

        Returns:
            True if text appears to be a section header
        """
        # Check against known section patterns
        for pattern in self.SECTION_PATTERNS:
            if re.match(pattern, text.upper()):
                return True

        # Check for all caps titles (at least 3 words)
        words = text.split()
        if len(words) >= 2 and len(words) <= 8:
            if text.isupper() and len(text) < 80:
                return True

        # Check for numbered section headers (e.g., "1. Introduction", "1.1 Background")
        if re.match(r"^\d+(?:\.\d+)*\.?\s+[A-Z]", text):
            return True

        return False

    def _estimate_heading_level(self, title: str) -> int:
        """
        Estimate the heading level based on title format.

        Args:
            title: Section title

        Returns:
            Estimated heading level (1-6)
        """
        # Primary sections (no number or single number)
        if re.match(r"^\d\.?\s", title) or title.isupper():
            return 1
        # Subsections (e.g., 1.1)
        if re.match(r"^\d+\.\d+\.?\s", title):
            return 2
        # Sub-subsections (e.g., 1.1.1)
        if re.match(r"^\d+\.\d+\.\d+\.?\s", title):
            return 3
        return 2

    def _extract_pdf_metadata(self, reader: PyPDF2.PdfReader) -> dict:
        """Extract metadata from PDF document."""
        metadata = {}
        if reader.metadata:
            # Each metadata field access can trigger date parsing which may fail
            # on malformed PDF dates, so wrap each in try-except
            try:
                if reader.metadata.title:
                    metadata["title"] = reader.metadata.title
            except Exception:
                pass
            try:
                if reader.metadata.author:
                    metadata["author"] = reader.metadata.author
            except Exception:
                pass
            try:
                if reader.metadata.subject:
                    metadata["subject"] = reader.metadata.subject
            except Exception:
                pass
            try:
                if reader.metadata.creation_date:
                    metadata["creation_date"] = str(reader.metadata.creation_date)
            except Exception:
                # PDF has malformed date string - skip it
                pass
        return metadata

    def _extract_docx_metadata(self, document: Document) -> dict:
        """Extract metadata from Word document."""
        metadata = {}
        try:
            core_props = document.core_properties
            if core_props.title:
                metadata["title"] = core_props.title
            if core_props.author:
                metadata["author"] = core_props.author
            if core_props.subject:
                metadata["subject"] = core_props.subject
            if core_props.created:
                metadata["creation_date"] = str(core_props.created)
            if core_props.modified:
                metadata["modified_date"] = str(core_props.modified)
        except Exception:
            pass
        return metadata

    def _count_words(self, text: str) -> int:
        """
        Count words in text.

        Args:
            text: Text to count words in

        Returns:
            Word count
        """
        # Split on whitespace and filter empty strings
        words = [w for w in text.split() if w]
        return len(words)

    def _estimate_docx_pages(self, text: str) -> int:
        """
        Estimate page count for a Word document based on word count.

        Assumes approximately 300 words per page.

        Args:
            text: Document text

        Returns:
            Estimated page count (minimum 1)
        """
        word_count = self._count_words(text)
        return max(1, round(word_count / 300))


# Global instance for dependency injection
_document_parser: Optional[DocumentParser] = None


def get_document_parser() -> DocumentParser:
    """Get the global document parser instance."""
    global _document_parser
    if _document_parser is None:
        _document_parser = DocumentParser()
    return _document_parser
