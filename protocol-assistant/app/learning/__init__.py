"""
Learning and optimization module for Protocol Assistant.

This module provides:
- Prompt versioning with A/B testing
- User feedback collection and analysis
- RAG knowledge base for context augmentation
"""

from app.learning.prompt_management import PromptManager
from app.learning.feedback import FeedbackService, FeedbackRequest, FeedbackSummary
from app.learning.rag import CuratedKnowledgeBase, SearchResult

__all__ = [
    "PromptManager",
    "FeedbackService",
    "FeedbackRequest",
    "FeedbackSummary",
    "CuratedKnowledgeBase",
    "SearchResult",
]
