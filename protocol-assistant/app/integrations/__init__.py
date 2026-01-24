"""External integrations for Protocol Assistant.

This module provides integrations with external research tools:
- Zotero: Reference management and citation formatting
- Mendeley: Reference management with OAuth authentication
- REDCap: Research data capture and form management
"""

from app.integrations.base import (
    AuthResult,
    IntegrationProvider,
    SyncResult,
)
from app.integrations.credential_manager import CredentialManager
from app.integrations.mendeley import MendeleyIntegration
from app.integrations.redcap import (
    FieldMapping,
    REDCapField,
    REDCapForm,
    REDCapIntegration,
)
from app.integrations.zotero import (
    Citation,
    FormattedCitation,
    ZoteroIntegration,
)

__all__ = [
    # Base classes
    "IntegrationProvider",
    "AuthResult",
    "SyncResult",
    # Credential management
    "CredentialManager",
    # Zotero
    "ZoteroIntegration",
    "Citation",
    "FormattedCitation",
    # Mendeley
    "MendeleyIntegration",
    # REDCap
    "REDCapIntegration",
    "REDCapField",
    "REDCapForm",
    "FieldMapping",
]
