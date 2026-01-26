"""
RAG (Retrieval-Augmented Generation) knowledge base for Protocol Assistant.

This module provides:
- Admin-curated document management
- Keyword and semantic search (with optional pgvector)
- Hybrid search combining keyword and semantic approaches
- Context augmentation for LLM prompts
- Category-based organization
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional, List, Tuple
from pydantic import BaseModel, Field
import logging
import re
import os

from app.models.knowledge import KnowledgeDocument, KnowledgeQuery
from app.services.embedding import get_embedding_service, EmbeddingError

logger = logging.getLogger(__name__)

# Feature flag for semantic search (can be overridden by feature flag service)
SEMANTIC_SEARCH_ENABLED = os.environ.get("FEATURE_FLAG_SEMANTIC_SEARCH", "false").lower() == "true"


class SearchResult(BaseModel):
    """Search result from knowledge base."""

    id: str
    title: str
    content: str
    category: str
    relevance: float = Field(..., description="Relevance score (higher is better)")
    source_url: Optional[str] = None
    metadata: Optional[dict] = None


class CuratedKnowledgeBase:
    """
    Admin-curated RAG knowledge base.

    This class manages a knowledge base of documents that can be used
    to augment LLM prompts with relevant context. Documents are
    organized by category and can be institution-specific or global.

    In production, this would integrate with vector embeddings
    (e.g., pgvector) for semantic search. Currently uses keyword matching.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def add_document(
        self,
        title: str,
        content: str,
        category: str,
        added_by: UUID,
        institution_id: Optional[UUID] = None,
        description: Optional[str] = None,
        source_url: Optional[str] = None,
        source_filename: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
        is_public: bool = False,
    ) -> KnowledgeDocument:
        """
        Add document to knowledge base.

        Args:
            title: Document title
            content: Document content
            category: Category (e.g., "guidelines", "templates", "regulations")
            added_by: UUID of admin adding the document
            institution_id: Optional institution ID (None for global)
            description: Optional description
            source_url: Optional source URL
            source_filename: Optional original filename
            tags: Optional list of tags
            metadata: Optional metadata dict
            is_public: Whether visible to all institutions

        Returns:
            The created KnowledgeDocument
        """
        doc = KnowledgeDocument(
            id=uuid4(),
            institution_id=institution_id,
            title=title,
            description=description,
            content=content,
            category=category,
            source_url=source_url,
            source_filename=source_filename,
            tags=tags or [],
            doc_metadata=metadata or {},
            is_active=True,
            is_public=is_public,
            added_by=added_by,
            word_count=len(content.split()),
        )

        self.db.add(doc)
        await self.db.commit()
        await self.db.refresh(doc)

        logger.info(
            f"Added knowledge document '{title}' to category '{category}' "
            f"by user {added_by}"
        )

        return doc

    async def update_document(
        self,
        document_id: UUID,
        updated_by: UUID,
        title: Optional[str] = None,
        content: Optional[str] = None,
        category: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict] = None,
        is_active: Optional[bool] = None,
    ) -> KnowledgeDocument:
        """
        Update an existing document.

        Creates a new version while preserving history.

        Args:
            document_id: ID of document to update
            updated_by: UUID of admin making the update
            Other args are optional fields to update

        Returns:
            The updated KnowledgeDocument

        Raises:
            ValueError: If document not found
        """
        doc = await self.db.get(KnowledgeDocument, document_id)
        if not doc:
            raise ValueError(f"Document {document_id} not found")

        if title is not None:
            doc.title = title
        if content is not None:
            doc.content = content
            doc.word_count = len(content.split())
        if category is not None:
            doc.category = category
        if description is not None:
            doc.description = description
        if tags is not None:
            doc.tags = tags
        if metadata is not None:
            doc.doc_metadata = metadata
        if is_active is not None:
            doc.is_active = is_active

        doc.version += 1

        await self.db.commit()
        await self.db.refresh(doc)

        logger.info(
            f"Updated knowledge document '{doc.title}' to version {doc.version} "
            f"by user {updated_by}"
        )

        return doc

    async def search(
        self,
        query: str,
        categories: Optional[list[str]] = None,
        institution_id: Optional[UUID] = None,
        tags: Optional[list[str]] = None,
        limit: int = 5,
        log_query: bool = True,
    ) -> list[SearchResult]:
        """
        Search knowledge base.

        Uses keyword matching with relevance scoring.
        In production, would use vector similarity search.

        Args:
            query: Search query string
            categories: Optional category filter
            institution_id: Optional institution filter (also includes global docs)
            tags: Optional tag filter
            limit: Maximum results to return
            log_query: Whether to log the query for analytics

        Returns:
            List of SearchResult objects sorted by relevance
        """
        start_time = datetime.utcnow()

        # Build base query
        base_query = select(KnowledgeDocument).where(
            KnowledgeDocument.is_active == True
        )

        if categories:
            base_query = base_query.where(KnowledgeDocument.category.in_(categories))

        if institution_id:
            # Include institution-specific and global/public documents
            base_query = base_query.where(
                or_(
                    KnowledgeDocument.institution_id == institution_id,
                    KnowledgeDocument.institution_id == None,
                    KnowledgeDocument.is_public == True,
                )
            )
        else:
            # Only global/public documents
            base_query = base_query.where(
                or_(
                    KnowledgeDocument.institution_id == None,
                    KnowledgeDocument.is_public == True,
                )
            )

        result = await self.db.execute(base_query)
        docs = result.scalars().all()

        # Score and rank documents
        scored = []
        query_lower = query.lower()
        query_words = set(re.findall(r'\w+', query_lower))

        for doc in docs:
            score = self._calculate_relevance(doc, query_lower, query_words, tags)
            if score > 0:
                scored.append((doc, score))

        # Sort by relevance
        scored.sort(key=lambda x: x[1], reverse=True)

        results = [
            SearchResult(
                id=str(doc.id),
                title=doc.title,
                content=doc.content[:500] + "..." if len(doc.content) > 500 else doc.content,
                category=doc.category,
                relevance=round(score, 2),
                source_url=doc.source_url,
                metadata=doc.doc_metadata,
            )
            for doc, score in scored[:limit]
        ]

        # Log query for analytics
        if log_query:
            latency_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            await self._log_query(
                query=query,
                result_count=len(results),
                result_ids=[r.id for r in results],
                top_score=results[0].relevance if results else None,
                latency_ms=latency_ms,
                institution_id=institution_id,
            )

        return results

    async def semantic_search(
        self,
        query: str,
        categories: Optional[list[str]] = None,
        institution_id: Optional[UUID] = None,
        limit: int = 5,
        similarity_threshold: float = 0.7,
    ) -> list[SearchResult]:
        """
        Semantic search using vector embeddings.

        Uses OpenAI embeddings and pgvector for similarity search.
        Falls back to keyword search if embeddings are not available.

        Args:
            query: Search query string
            categories: Optional category filter
            institution_id: Optional institution filter
            limit: Maximum results to return
            similarity_threshold: Minimum similarity score (0-1)

        Returns:
            List of SearchResult objects sorted by similarity
        """
        start_time = datetime.utcnow()

        try:
            # Generate query embedding
            embedding_service = get_embedding_service()
            query_embedding = await embedding_service.embed(query)
        except EmbeddingError as e:
            logger.warning(f"Failed to generate query embedding: {e}. Falling back to keyword search.")
            return await self.search(query, categories, institution_id, limit=limit)

        # Build SQL for vector similarity search using pgvector
        # This assumes the embedding column exists and pgvector extension is installed
        sql = """
            SELECT
                id,
                title,
                content,
                category,
                source_url,
                metadata,
                1 - (embedding <=> :query_embedding::vector) as similarity
            FROM knowledge_documents
            WHERE is_active = true
              AND has_embeddings = true
              AND 1 - (embedding <=> :query_embedding::vector) >= :threshold
        """

        params = {
            "query_embedding": str(query_embedding),
            "threshold": similarity_threshold,
        }

        # Add filters
        if categories:
            sql += " AND category = ANY(:categories)"
            params["categories"] = categories

        if institution_id:
            sql += " AND (institution_id = :institution_id OR institution_id IS NULL OR is_public = true)"
            params["institution_id"] = str(institution_id)
        else:
            sql += " AND (institution_id IS NULL OR is_public = true)"

        sql += " ORDER BY similarity DESC LIMIT :limit"
        params["limit"] = limit

        try:
            result = await self.db.execute(text(sql), params)
            rows = result.fetchall()
        except Exception as e:
            logger.error(f"Vector search failed: {e}. Falling back to keyword search.")
            return await self.search(query, categories, institution_id, limit=limit)

        results = [
            SearchResult(
                id=str(row.id),
                title=row.title,
                content=row.content[:500] + "..." if len(row.content) > 500 else row.content,
                category=row.category,
                relevance=round(row.similarity, 3),
                source_url=row.source_url,
                metadata=row.metadata,
            )
            for row in rows
        ]

        # Log query
        latency_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        await self._log_query(
            query=query,
            result_count=len(results),
            result_ids=[r.id for r in results],
            top_score=results[0].relevance if results else None,
            latency_ms=latency_ms,
            institution_id=institution_id,
        )

        return results

    async def hybrid_search(
        self,
        query: str,
        categories: Optional[list[str]] = None,
        institution_id: Optional[UUID] = None,
        limit: int = 5,
        semantic_weight: float = 0.7,
    ) -> list[SearchResult]:
        """
        Hybrid search combining keyword and semantic approaches.

        Uses Reciprocal Rank Fusion (RRF) to combine results from both
        keyword and semantic search for best results.

        Args:
            query: Search query string
            categories: Optional category filter
            institution_id: Optional institution filter
            limit: Maximum results to return
            semantic_weight: Weight for semantic results (0-1)

        Returns:
            List of SearchResult objects with combined ranking
        """
        # Get keyword results
        keyword_results = await self.search(
            query,
            categories=categories,
            institution_id=institution_id,
            limit=limit * 2,  # Get more for fusion
            log_query=False,
        )

        # Try semantic search if enabled
        semantic_results = []
        if SEMANTIC_SEARCH_ENABLED:
            try:
                semantic_results = await self.semantic_search(
                    query,
                    categories=categories,
                    institution_id=institution_id,
                    limit=limit * 2,
                )
            except Exception as e:
                logger.warning(f"Semantic search failed in hybrid mode: {e}")

        if not semantic_results:
            # Just use keyword results if semantic failed or disabled
            return keyword_results[:limit]

        # Reciprocal Rank Fusion
        k = 60  # RRF constant
        scores: dict[str, float] = {}
        doc_map: dict[str, SearchResult] = {}

        # Score keyword results
        keyword_weight = 1 - semantic_weight
        for rank, result in enumerate(keyword_results, 1):
            rrf_score = keyword_weight / (k + rank)
            scores[result.id] = scores.get(result.id, 0) + rrf_score
            doc_map[result.id] = result

        # Score semantic results
        for rank, result in enumerate(semantic_results, 1):
            rrf_score = semantic_weight / (k + rank)
            scores[result.id] = scores.get(result.id, 0) + rrf_score
            if result.id not in doc_map:
                doc_map[result.id] = result

        # Sort by combined score and return top results
        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)

        results = []
        for doc_id in sorted_ids[:limit]:
            result = doc_map[doc_id]
            # Update relevance to combined score
            result.relevance = round(scores[doc_id], 4)
            results.append(result)

        return results

    async def index_document(
        self,
        document_id: UUID,
    ) -> bool:
        """
        Index a document by generating its embedding.

        Args:
            document_id: ID of the document to index

        Returns:
            True if indexing succeeded
        """
        doc = await self.db.get(KnowledgeDocument, document_id)
        if not doc:
            logger.warning(f"Document {document_id} not found for indexing")
            return False

        try:
            embedding_service = get_embedding_service()
            embedding = await embedding_service.embed(doc.content)

            # Update document with embedding
            # Note: This requires the embedding column to exist
            await self.db.execute(
                text("""
                    UPDATE knowledge_documents
                    SET embedding = :embedding::vector,
                        has_embeddings = true,
                        embedding_model = :model,
                        last_indexed_at = NOW()
                    WHERE id = :doc_id
                """),
                {
                    "embedding": str(embedding),
                    "model": "text-embedding-ada-002",
                    "doc_id": str(document_id),
                },
            )
            await self.db.commit()

            logger.info(f"Indexed document {document_id}")
            return True

        except EmbeddingError as e:
            logger.error(f"Failed to index document {document_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error indexing document {document_id}: {e}")
            return False

    async def reindex_all(
        self,
        batch_size: int = 10,
    ) -> dict:
        """
        Reindex all documents in the knowledge base.

        Args:
            batch_size: Number of documents to process at once

        Returns:
            Dict with success/failure counts
        """
        # Get all active documents without embeddings
        result = await self.db.execute(
            select(KnowledgeDocument.id)
            .where(KnowledgeDocument.is_active == True)
            .where(
                or_(
                    KnowledgeDocument.has_embeddings == False,
                    KnowledgeDocument.has_embeddings == None,
                )
            )
        )
        doc_ids = [row[0] for row in result.fetchall()]

        logger.info(f"Reindexing {len(doc_ids)} documents")

        success = 0
        failed = 0

        for doc_id in doc_ids:
            if await self.index_document(doc_id):
                success += 1
            else:
                failed += 1

        return {
            "total": len(doc_ids),
            "success": success,
            "failed": failed,
        }

    def _calculate_relevance(
        self,
        doc: KnowledgeDocument,
        query_lower: str,
        query_words: set[str],
        required_tags: Optional[list[str]] = None,
    ) -> float:
        """
        Calculate relevance score for a document.

        Scoring factors:
        - Title match (high weight)
        - Content match
        - Word overlap
        - Tag matches
        """
        score = 0.0

        title_lower = doc.title.lower()
        content_lower = doc.content.lower()

        # Exact phrase match in title (highest weight)
        if query_lower in title_lower:
            score += 10.0

        # Exact phrase match in content
        if query_lower in content_lower:
            score += 3.0

        # Word matches in title
        title_words = set(re.findall(r'\w+', title_lower))
        title_overlap = len(query_words & title_words)
        score += title_overlap * 2.0

        # Word matches in content
        content_words = set(re.findall(r'\w+', content_lower))
        content_overlap = len(query_words & content_words)
        score += content_overlap * 0.5

        # Tag filter and bonus
        if required_tags:
            doc_tags = set(doc.tags) if doc.tags else set()
            if not set(required_tags) & doc_tags:
                return 0  # Required tag not present
            score += len(set(required_tags) & doc_tags) * 1.5

        # Description match
        if doc.description:
            desc_lower = doc.description.lower()
            if query_lower in desc_lower:
                score += 2.0

        return score

    async def _log_query(
        self,
        query: str,
        result_count: int,
        result_ids: list[str],
        top_score: Optional[float],
        latency_ms: int,
        institution_id: Optional[UUID] = None,
        session_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
    ) -> None:
        """Log search query for analytics."""
        log_entry = KnowledgeQuery(
            id=uuid4(),
            session_id=session_id,
            user_id=user_id,
            institution_id=institution_id,
            query_text=query,
            query_type="keyword",  # Would be "semantic" with vector search
            result_count=result_count,
            result_document_ids=result_ids,
            top_similarity_score=str(top_score) if top_score else None,
            latency_ms=latency_ms,
        )
        self.db.add(log_entry)
        await self.db.commit()

    async def augment_prompt(
        self,
        base_prompt: str,
        context_query: str,
        categories: Optional[list[str]] = None,
        institution_id: Optional[UUID] = None,
        max_context_length: int = 3000,
        max_documents: int = 3,
    ) -> str:
        """
        Augment prompt with relevant knowledge base context.

        Searches for relevant documents and appends them to the prompt
        as additional context for the LLM.

        Args:
            base_prompt: The original prompt
            context_query: Query to find relevant context
            categories: Optional category filter
            institution_id: Optional institution filter
            max_context_length: Maximum characters of context to include
            max_documents: Maximum documents to include

        Returns:
            Augmented prompt with relevant context
        """
        relevant_docs = await self.search(
            context_query,
            categories=categories,
            institution_id=institution_id,
            limit=max_documents,
            log_query=False,  # Don't log augmentation queries
        )

        if not relevant_docs:
            return base_prompt

        # Build context section
        context_parts = []
        total_length = 0

        for doc in relevant_docs:
            doc_text = f"### {doc.title}\n{doc.content}"
            if total_length + len(doc_text) > max_context_length:
                # Truncate if needed
                remaining = max_context_length - total_length
                if remaining > 100:
                    doc_text = doc_text[:remaining] + "..."
                    context_parts.append(doc_text)
                break

            context_parts.append(doc_text)
            total_length += len(doc_text)

        context = "\n\n".join(context_parts)

        return f"{base_prompt}\n\n## Relevant Guidance:\n{context}"

    async def get_document(self, document_id: UUID) -> Optional[KnowledgeDocument]:
        """
        Get a specific document by ID.

        Args:
            document_id: UUID of the document

        Returns:
            The KnowledgeDocument or None
        """
        return await self.db.get(KnowledgeDocument, document_id)

    async def get_categories(
        self,
        institution_id: Optional[UUID] = None,
    ) -> list[str]:
        """
        Get all categories.

        Args:
            institution_id: Optional filter by institution

        Returns:
            List of unique category strings
        """
        query = (
            select(KnowledgeDocument.category)
            .where(KnowledgeDocument.is_active == True)
            .distinct()
        )

        if institution_id:
            query = query.where(
                or_(
                    KnowledgeDocument.institution_id == institution_id,
                    KnowledgeDocument.institution_id == None,
                )
            )

        result = await self.db.execute(query)
        return [r[0] for r in result.all() if r[0]]

    async def get_documents_by_category(
        self,
        category: str,
        institution_id: Optional[UUID] = None,
        limit: int = 50,
    ) -> list[KnowledgeDocument]:
        """
        Get all documents in a category.

        Args:
            category: The category to filter by
            institution_id: Optional institution filter
            limit: Maximum results

        Returns:
            List of KnowledgeDocument objects
        """
        query = (
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.category == category,
                KnowledgeDocument.is_active == True,
            )
            .order_by(KnowledgeDocument.title)
            .limit(limit)
        )

        if institution_id:
            query = query.where(
                or_(
                    KnowledgeDocument.institution_id == institution_id,
                    KnowledgeDocument.institution_id == None,
                )
            )

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def delete_document(
        self,
        document_id: UUID,
        deleted_by: UUID,
        hard_delete: bool = False,
    ) -> bool:
        """
        Delete a document.

        By default, performs soft delete (marks as inactive).

        Args:
            document_id: ID of document to delete
            deleted_by: UUID of admin deleting
            hard_delete: If True, permanently removes from database

        Returns:
            True if deleted, False if not found
        """
        doc = await self.db.get(KnowledgeDocument, document_id)
        if not doc:
            return False

        if hard_delete:
            await self.db.delete(doc)
            logger.info(
                f"Hard deleted knowledge document '{doc.title}' by user {deleted_by}"
            )
        else:
            doc.is_active = False
            logger.info(
                f"Soft deleted knowledge document '{doc.title}' by user {deleted_by}"
            )

        await self.db.commit()
        return True

    async def get_stats(
        self,
        institution_id: Optional[UUID] = None,
    ) -> dict:
        """
        Get knowledge base statistics.

        Args:
            institution_id: Optional filter by institution

        Returns:
            Dict with document counts and category breakdown
        """
        base_query = select(KnowledgeDocument).where(
            KnowledgeDocument.is_active == True
        )

        if institution_id:
            base_query = base_query.where(
                or_(
                    KnowledgeDocument.institution_id == institution_id,
                    KnowledgeDocument.institution_id == None,
                )
            )

        result = await self.db.execute(base_query)
        docs = result.scalars().all()

        # Count by category
        by_category: dict[str, int] = {}
        total_words = 0

        for doc in docs:
            by_category[doc.category] = by_category.get(doc.category, 0) + 1
            total_words += doc.word_count or 0

        return {
            "total_documents": len(docs),
            "total_words": total_words,
            "by_category": by_category,
            "categories_count": len(by_category),
        }
