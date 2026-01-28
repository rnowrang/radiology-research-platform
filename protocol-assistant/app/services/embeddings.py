"""Enhanced Embeddings Service with pgvector storage and semantic search.

This service extends the base embedding capabilities with:
- Storage of embeddings in PostgreSQL via pgvector
- Semantic similarity search
- Knowledge base indexing and reindexing
- Batch embedding with deduplication
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services.embedding import EmbeddingService as BaseEmbeddingService, get_embedding_service
from app.schemas.knowledge import ContentType, EmbeddingMatch

logger = logging.getLogger(__name__)


class KnowledgeEmbeddingsService:
    """Service for managing knowledge embeddings with pgvector.

    This service handles:
    - Embedding text content using OpenAI
    - Storing embeddings in PostgreSQL with pgvector
    - Semantic similarity search
    - Knowledge base reindexing
    """

    def __init__(self, db: AsyncSession):
        """Initialize the embeddings service.

        Args:
            db: Async database session
        """
        self.db = db
        self._embedding_service = get_embedding_service()
        self.settings = get_settings()

    async def embed_text(self, text_content: str) -> List[float]:
        """Generate embedding for text content.

        Args:
            text_content: Text to embed

        Returns:
            Embedding vector (1536 dimensions)
        """
        return await self._embedding_service.embed(text_content)

    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        return await self._embedding_service.embed_batch(texts)

    async def store_embedding(
        self,
        kb_id: UUID,
        content: str,
        content_type: ContentType,
        source_key: str,
        embedding: Optional[List[float]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> UUID:
        """Store a text embedding in the database.

        Args:
            kb_id: Knowledge base UUID
            content: The text content that was embedded
            content_type: Type of content (fact, document_chunk, etc.)
            source_key: Reference back to source
            embedding: Optional pre-computed embedding (will generate if not provided)
            metadata: Optional metadata dict

        Returns:
            UUID of the stored embedding record
        """
        # Generate embedding if not provided
        if embedding is None:
            embedding = await self.embed_text(content)

        # Convert embedding to pgvector format
        embedding_str = f"[{','.join(str(x) for x in embedding)}]"

        # Generate UUID
        embedding_id = uuid4()

        # Insert into database
        # Note: Using CAST() syntax instead of :: to avoid asyncpg parameter parsing issues
        await self.db.execute(
            text("""
                INSERT INTO knowledge_embeddings
                    (id, knowledge_base_id, content, content_type, source_key, embedding)
                VALUES
                    (:id, :kb_id, :content, :content_type, :source_key, CAST(:embedding AS vector))
            """),
            {
                "id": str(embedding_id),
                "kb_id": str(kb_id),
                "content": content[:10000],  # Limit content size
                "content_type": content_type.value if isinstance(content_type, ContentType) else content_type,
                "source_key": source_key,
                "embedding": embedding_str,
            }
        )
        await self.db.commit()

        logger.debug(f"Stored embedding {embedding_id} for KB {kb_id}, source_key={source_key}")
        return embedding_id

    async def store_batch(
        self,
        kb_id: UUID,
        items: List[Dict[str, Any]]
    ) -> int:
        """Store multiple embeddings in batch.

        Args:
            kb_id: Knowledge base UUID
            items: List of dicts with keys: content, content_type, source_key

        Returns:
            Number of embeddings stored
        """
        if not items:
            return 0

        # Extract texts for batch embedding
        texts = [item["content"] for item in items]
        embeddings = await self.embed_batch(texts)

        # Store each embedding
        count = 0
        for item, embedding in zip(items, embeddings):
            if embedding is not None:
                try:
                    await self.store_embedding(
                        kb_id=kb_id,
                        content=item["content"],
                        content_type=item["content_type"],
                        source_key=item["source_key"],
                        embedding=embedding,
                    )
                    count += 1
                except Exception as e:
                    logger.error(f"Failed to store embedding for {item['source_key']}: {e}")

        return count

    async def delete_by_source_key(self, kb_id: UUID, source_key: str) -> int:
        """Delete embeddings by source key.

        Args:
            kb_id: Knowledge base UUID
            source_key: Source key to match

        Returns:
            Number of embeddings deleted
        """
        result = await self.db.execute(
            text("""
                DELETE FROM knowledge_embeddings
                WHERE knowledge_base_id = :kb_id AND source_key = :source_key
            """),
            {"kb_id": str(kb_id), "source_key": source_key}
        )
        await self.db.commit()
        return result.rowcount

    async def delete_all_for_kb(self, kb_id: UUID) -> int:
        """Delete all embeddings for a knowledge base.

        Args:
            kb_id: Knowledge base UUID

        Returns:
            Number of embeddings deleted
        """
        result = await self.db.execute(
            text("DELETE FROM knowledge_embeddings WHERE knowledge_base_id = :kb_id"),
            {"kb_id": str(kb_id)}
        )
        await self.db.commit()
        return result.rowcount

    async def search_similar(
        self,
        kb_id: UUID,
        query: str,
        top_k: int = 5,
        content_types: Optional[List[ContentType]] = None,
        min_score: float = 0.0
    ) -> List[EmbeddingMatch]:
        """Search for similar content using cosine similarity.

        Args:
            kb_id: Knowledge base UUID
            query: Search query text
            top_k: Number of results to return
            content_types: Optional filter by content types
            min_score: Minimum similarity score (0-1)

        Returns:
            List of EmbeddingMatch results sorted by score descending
        """
        # Generate query embedding - if this fails, we shouldn't affect the DB transaction
        try:
            query_embedding = await self.embed_text(query)
        except Exception as e:
            logger.error(f"Failed to generate embedding for query: {e}")
            raise
        embedding_str = f"[{','.join(str(x) for x in query_embedding)}]"

        # Build query with optional content type filter
        type_filter = ""
        params = {
            "kb_id": str(kb_id),
            "embedding": embedding_str,
            "top_k": top_k,
            "min_score": min_score,
        }

        if content_types:
            type_values = [ct.value if isinstance(ct, ContentType) else ct for ct in content_types]
            type_filter = "AND content_type = ANY(:content_types)"
            params["content_types"] = type_values

        # Use pgvector cosine similarity (1 - cosine_distance)
        # Note: Using CAST() syntax instead of :: to avoid asyncpg parameter parsing issues
        result = await self.db.execute(
            text(f"""
                SELECT
                    content,
                    content_type,
                    source_key,
                    1 - (embedding <=> CAST(:embedding AS vector)) as score
                FROM knowledge_embeddings
                WHERE knowledge_base_id = :kb_id
                    {type_filter}
                    AND 1 - (embedding <=> CAST(:embedding AS vector)) >= :min_score
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
            """),
            params
        )
        rows = result.fetchall()

        # Convert to EmbeddingMatch objects
        matches = []
        for row in rows:
            try:
                content_type = ContentType(row.content_type)
            except ValueError:
                content_type = ContentType.FACT

            matches.append(EmbeddingMatch(
                content=row.content,
                content_type=content_type,
                source_key=row.source_key,
                score=float(row.score),
            ))

        return matches

    async def search_by_embedding(
        self,
        kb_id: UUID,
        embedding: List[float],
        top_k: int = 5,
        min_score: float = 0.0
    ) -> List[EmbeddingMatch]:
        """Search using a pre-computed embedding vector.

        Args:
            kb_id: Knowledge base UUID
            embedding: Pre-computed embedding vector
            top_k: Number of results to return
            min_score: Minimum similarity score

        Returns:
            List of EmbeddingMatch results
        """
        embedding_str = f"[{','.join(str(x) for x in embedding)}]"

        # Note: Using CAST() syntax instead of :: to avoid asyncpg parameter parsing issues
        result = await self.db.execute(
            text("""
                SELECT
                    content,
                    content_type,
                    source_key,
                    1 - (embedding <=> CAST(:embedding AS vector)) as score
                FROM knowledge_embeddings
                WHERE knowledge_base_id = :kb_id
                    AND 1 - (embedding <=> CAST(:embedding AS vector)) >= :min_score
                ORDER BY embedding <=> CAST(:embedding AS vector)
                LIMIT :top_k
            """),
            {
                "kb_id": str(kb_id),
                "embedding": embedding_str,
                "top_k": top_k,
                "min_score": min_score,
            }
        )
        rows = result.fetchall()

        matches = []
        for row in rows:
            try:
                content_type = ContentType(row.content_type)
            except ValueError:
                content_type = ContentType.FACT

            matches.append(EmbeddingMatch(
                content=row.content,
                content_type=content_type,
                source_key=row.source_key,
                score=float(row.score),
            ))

        return matches

    async def reindex_knowledge_base(
        self,
        kb_id: UUID,
        facts: List[Dict[str, Any]],
        wizard_answers: Optional[Dict[str, Any]] = None
    ) -> int:
        """Reindex all content in a knowledge base.

        Deletes existing embeddings and recreates them from current data.

        Args:
            kb_id: Knowledge base UUID
            facts: List of fact dicts from knowledge base
            wizard_answers: Optional wizard answers dict

        Returns:
            Number of embeddings created
        """
        # Delete existing embeddings
        await self.delete_all_for_kb(kb_id)

        items = []

        # Add facts
        for fact in facts:
            key = fact.get("key", "")
            value = fact.get("value", "")
            if key and value:
                # Create searchable text from fact
                text_content = f"{key}: {value}"
                items.append({
                    "content": text_content,
                    "content_type": ContentType.FACT,
                    "source_key": f"fact:{key}",
                })

        # Add wizard answers
        if wizard_answers:
            for question_id, answer_record in wizard_answers.items():
                answer = answer_record.get("answer", "")
                if answer:
                    text_content = f"{question_id}: {answer}"
                    items.append({
                        "content": text_content,
                        "content_type": ContentType.WIZARD_ANSWER,
                        "source_key": f"wizard:{question_id}",
                    })

        # Store all embeddings
        if items:
            return await self.store_batch(kb_id, items)
        return 0

    async def index_document_chunks(
        self,
        kb_id: UUID,
        doc_id: UUID,
        chunks: List[str]
    ) -> int:
        """Index document chunks for semantic search.

        Args:
            kb_id: Knowledge base UUID
            doc_id: Document UUID
            chunks: List of text chunks from the document

        Returns:
            Number of chunks indexed
        """
        items = []
        for i, chunk in enumerate(chunks):
            if chunk and chunk.strip():
                items.append({
                    "content": chunk,
                    "content_type": ContentType.DOCUMENT_CHUNK,
                    "source_key": f"doc:{doc_id}:chunk:{i}",
                })

        if items:
            return await self.store_batch(kb_id, items)
        return 0

    async def get_embedding_count(self, kb_id: UUID) -> int:
        """Get the number of embeddings for a knowledge base.

        Args:
            kb_id: Knowledge base UUID

        Returns:
            Number of embeddings
        """
        try:
            result = await self.db.execute(
                text("SELECT COUNT(*) FROM knowledge_embeddings WHERE knowledge_base_id = :kb_id"),
                {"kb_id": str(kb_id)}
            )
            row = result.fetchone()
            return row[0] if row else 0
        except Exception as e:
            # Table may not exist if pgvector extension isn't installed
            logger.debug(f"Could not get embedding count: {e}")
            return 0

    async def get_embedding_stats(self, kb_id: UUID) -> Dict[str, Any]:
        """Get statistics about embeddings for a knowledge base.

        Args:
            kb_id: Knowledge base UUID

        Returns:
            Dict with count, type breakdown, etc.
        """
        result = await self.db.execute(
            text("""
                SELECT content_type, COUNT(*) as count
                FROM knowledge_embeddings
                WHERE knowledge_base_id = :kb_id
                GROUP BY content_type
            """),
            {"kb_id": str(kb_id)}
        )
        rows = result.fetchall()

        type_counts = {row.content_type: row.count for row in rows}
        total = sum(type_counts.values())

        return {
            "total": total,
            "by_type": type_counts,
        }


def get_knowledge_embeddings_service(db: AsyncSession) -> KnowledgeEmbeddingsService:
    """Get a KnowledgeEmbeddingsService instance.

    Args:
        db: Async database session

    Returns:
        KnowledgeEmbeddingsService instance
    """
    return KnowledgeEmbeddingsService(db)
