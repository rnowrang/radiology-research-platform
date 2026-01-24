"""Services module for Protocol Assistant."""

from app.services.document_parser import (
    DocumentParser,
    DocumentParserError,
    get_document_parser,
)
from app.services.phi_detector import PHIDetector, PHIMatch, get_phi_detector
from app.services.protocol_analyzer import (
    ProtocolAnalyzer,
    ProtocolAnalyzerError,
    get_protocol_analyzer,
)
from app.services.generator import DocumentGenerator, get_document_generator
from app.services.form_mapper import IRBFormMapper, get_form_mapper

__all__ = [
    # Document parsing
    "DocumentParser",
    "DocumentParserError",
    "get_document_parser",
    # PHI detection
    "PHIDetector",
    "PHIMatch",
    "get_phi_detector",
    # Protocol analysis
    "ProtocolAnalyzer",
    "ProtocolAnalyzerError",
    "get_protocol_analyzer",
    # Document generation
    "DocumentGenerator",
    "get_document_generator",
    # Form mapping
    "IRBFormMapper",
    "get_form_mapper",
]
