"""
Protocol Assistant Models Package.

This module exports all SQLAlchemy models for the Protocol Assistant service.
"""

# Chat models
from app.models.chat import ChatSession, ChatMessage

# Protocol/Document models
from app.models.protocol import GeneratedDocument

# Institution configuration
from app.models.institution import InstitutionFeatureFlags

# A/B Testing and Feedback
from app.models.learning import PromptVersion, AIFeedback

# Audit and Compliance
from app.models.audit import ProvenanceNode, ComplianceAuditLog, ElectronicSignature

# Collaboration
from app.models.collaboration import SessionHandoff, SessionCollaborator

# Knowledge Base (RAG)
from app.models.knowledge import KnowledgeDocument, KnowledgeQuery

# Analytics
from app.models.analytics import UsageAnalytics, UserActivity, FeatureUsageMetric

# Integrations
from app.models.integration import (
    UserIntegrationCredentials,
    InstitutionIntegration,
    WebhookEndpoint,
)


__all__ = [
    # Chat
    "ChatSession",
    "ChatMessage",
    # Protocol
    "GeneratedDocument",
    # Institution
    "InstitutionFeatureFlags",
    # Learning
    "PromptVersion",
    "AIFeedback",
    # Audit
    "ProvenanceNode",
    "ComplianceAuditLog",
    "ElectronicSignature",
    # Collaboration
    "SessionHandoff",
    "SessionCollaborator",
    # Knowledge
    "KnowledgeDocument",
    "KnowledgeQuery",
    # Analytics
    "UsageAnalytics",
    "UserActivity",
    "FeatureUsageMetric",
    # Integration
    "UserIntegrationCredentials",
    "InstitutionIntegration",
    "WebhookEndpoint",
]
