"""
Embedding service for semantic search in Protocol Assistant.

This service provides text embedding capabilities using OpenAI's embedding API.
Embeddings are used for semantic search in the knowledge base via pgvector.
"""

import os
import logging
from typing import Optional, List
from functools import lru_cache

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)

# OpenAI embedding model configuration
EMBEDDING_MODEL = "text-embedding-ada-002"
EMBEDDING_DIMENSIONS = 1536

# Environment variables
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")


class EmbeddingError(Exception):
    """Error during embedding generation."""
    pass


class EmbeddingService:
    """
    Service for generating text embeddings using OpenAI's API.

    Uses the text-embedding-ada-002 model which produces 1536-dimensional vectors.
    Includes retry logic for resilience and batching for efficiency.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = EMBEDDING_MODEL,
        dimensions: int = EMBEDDING_DIMENSIONS,
    ):
        """
        Initialize the embedding service.

        Args:
            api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
            model: Embedding model name
            dimensions: Expected embedding dimensions
        """
        self.api_key = api_key or OPENAI_API_KEY
        self.model = model
        self.dimensions = dimensions
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url="https://api.openai.com/v1",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                timeout=60.0,
            )
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
    )
    async def embed(self, text: str) -> List[float]:
        """
        Generate an embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            List of floats representing the embedding vector

        Raises:
            EmbeddingError: If embedding generation fails
        """
        if not self.api_key:
            raise EmbeddingError("OpenAI API key not configured")

        if not text or not text.strip():
            raise EmbeddingError("Cannot embed empty text")

        # Truncate very long texts (OpenAI has token limits)
        # Rough estimate: 1 token ≈ 4 characters
        max_chars = 8000 * 4  # ~8000 tokens
        if len(text) > max_chars:
            text = text[:max_chars]
            logger.warning(f"Truncated text to {max_chars} characters for embedding")

        try:
            response = await self.client.post(
                "/embeddings",
                json={
                    "input": text,
                    "model": self.model,
                },
            )
            response.raise_for_status()
            data = response.json()

            embedding = data["data"][0]["embedding"]

            if len(embedding) != self.dimensions:
                raise EmbeddingError(
                    f"Unexpected embedding dimension: {len(embedding)} "
                    f"(expected {self.dimensions})"
                )

            return embedding

        except httpx.HTTPStatusError as e:
            logger.error(f"OpenAI API error: {e.response.status_code} - {e.response.text}")
            raise EmbeddingError(f"OpenAI API error: {e.response.status_code}")
        except Exception as e:
            logger.error(f"Embedding generation failed: {e}")
            raise EmbeddingError(str(e))

    async def embed_batch(
        self,
        texts: List[str],
        batch_size: int = 100,
    ) -> List[List[float]]:
        """
        Generate embeddings for multiple texts.

        Args:
            texts: List of texts to embed
            batch_size: Maximum texts per API call

        Returns:
            List of embedding vectors in the same order as input texts

        Raises:
            EmbeddingError: If embedding generation fails
        """
        if not self.api_key:
            raise EmbeddingError("OpenAI API key not configured")

        if not texts:
            return []

        all_embeddings = []

        # Process in batches
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]

            # Filter empty texts and track indices
            valid_texts = []
            valid_indices = []
            for j, text in enumerate(batch):
                if text and text.strip():
                    # Truncate long texts
                    max_chars = 8000 * 4
                    if len(text) > max_chars:
                        text = text[:max_chars]
                    valid_texts.append(text)
                    valid_indices.append(j)

            if not valid_texts:
                # All texts in batch were empty
                all_embeddings.extend([None] * len(batch))
                continue

            try:
                response = await self.client.post(
                    "/embeddings",
                    json={
                        "input": valid_texts,
                        "model": self.model,
                    },
                )
                response.raise_for_status()
                data = response.json()

                # Map embeddings back to original order
                batch_embeddings = [None] * len(batch)
                for item in data["data"]:
                    idx = item["index"]
                    original_idx = valid_indices[idx]
                    batch_embeddings[original_idx] = item["embedding"]

                all_embeddings.extend(batch_embeddings)

            except httpx.HTTPStatusError as e:
                logger.error(f"OpenAI API error in batch: {e.response.status_code}")
                raise EmbeddingError(f"OpenAI API error: {e.response.status_code}")
            except Exception as e:
                logger.error(f"Batch embedding failed: {e}")
                raise EmbeddingError(str(e))

        return all_embeddings

    async def similarity(
        self,
        embedding1: List[float],
        embedding2: List[float],
    ) -> float:
        """
        Calculate cosine similarity between two embeddings.

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            Cosine similarity (0 to 1, higher is more similar)
        """
        import math

        if len(embedding1) != len(embedding2):
            raise ValueError("Embeddings must have the same dimension")

        dot_product = sum(a * b for a, b in zip(embedding1, embedding2))
        magnitude1 = math.sqrt(sum(a * a for a in embedding1))
        magnitude2 = math.sqrt(sum(b * b for b in embedding2))

        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0

        return dot_product / (magnitude1 * magnitude2)


# Singleton instance
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    """Get or create the embedding service singleton."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


async def cleanup_embedding_service():
    """Cleanup the embedding service on shutdown."""
    global _embedding_service
    if _embedding_service:
        await _embedding_service.close()
        _embedding_service = None
