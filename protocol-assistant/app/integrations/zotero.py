"""Zotero integration for reference management and citation formatting."""

import logging
from typing import Optional

import httpx
from pydantic import BaseModel, Field

from app.integrations.base import AuthResult, IntegrationProvider

logger = logging.getLogger(__name__)


class Citation(BaseModel):
    """Represents a citation/reference item from Zotero."""

    id: str
    title: str
    authors: list[str] = Field(default_factory=list)
    year: Optional[int] = None
    journal: Optional[str] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None
    item_type: str = "unknown"
    url: Optional[str] = None
    pages: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    publisher: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class FormattedCitation(BaseModel):
    """A citation formatted in a specific citation style."""

    id: str
    formatted: str
    style: str


class ZoteroCollection(BaseModel):
    """Represents a Zotero collection (folder)."""

    key: str
    name: str
    parent_key: Optional[str] = None
    item_count: int = 0


class ZoteroIntegration(IntegrationProvider):
    """
    Zotero integration for managing research references.

    Provides access to user's Zotero library including:
    - Library browsing and searching
    - Citation formatting in various styles
    - Collection management
    """

    name = "zotero"
    BASE_URL = "https://api.zotero.org"

    # Supported citation styles
    CITATION_STYLES = [
        "apa",
        "mla",
        "chicago-note-bibliography",
        "harvard-cite-them-right",
        "vancouver",
        "ieee",
        "nature",
        "science",
        "cell",
    ]

    def __init__(self, api_key: str = None, user_id: str = None):
        """
        Initialize Zotero integration.

        Args:
            api_key: Zotero API key (from zotero.org/settings/keys)
            user_id: Zotero user ID
        """
        self.api_key = api_key
        self.user_id = user_id

    def _get_headers(self) -> dict:
        """Get common headers for Zotero API requests."""
        return {
            "Zotero-API-Key": self.api_key,
            "Zotero-API-Version": "3",
        }

    async def authenticate(self, credentials: dict) -> AuthResult:
        """
        Authenticate with Zotero API key.

        Args:
            credentials: Dict containing 'api_key'

        Returns:
            AuthResult with user information if successful
        """
        api_key = credentials.get("api_key")

        if not api_key:
            return AuthResult(success=False, error="API key is required")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.BASE_URL}/keys/{api_key}",
                    headers={"Zotero-API-Key": api_key},
                )

                if response.status_code == 200:
                    data = response.json()
                    user_id = str(data.get("userID"))

                    # Store for subsequent calls
                    self.api_key = api_key
                    self.user_id = user_id

                    return AuthResult(
                        success=True,
                        access_token=api_key,
                        user_id=user_id,
                        metadata={
                            "username": data.get("username"),
                            "access": data.get("access", {}),
                        },
                    )
                elif response.status_code == 403:
                    return AuthResult(success=False, error="Invalid API key")
                else:
                    return AuthResult(
                        success=False,
                        error=f"Authentication failed: {response.status_code}",
                    )
        except httpx.TimeoutException:
            return AuthResult(success=False, error="Connection timeout")
        except Exception as e:
            logger.exception("Zotero authentication error")
            return AuthResult(success=False, error=str(e))

    async def refresh_token(self, refresh_token: str) -> AuthResult:
        """
        Zotero uses API keys which don't expire, so no refresh needed.

        Args:
            refresh_token: The API key (same as access token)

        Returns:
            AuthResult with the same token
        """
        return AuthResult(success=True, access_token=refresh_token)

    async def test_connection(self, access_token: str) -> bool:
        """
        Test if the API key is valid.

        Args:
            access_token: The Zotero API key

        Returns:
            True if the key is valid
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.BASE_URL}/keys/{access_token}",
                    headers={"Zotero-API-Key": access_token},
                )
                return response.status_code == 200
        except Exception:
            return False

    async def get_library(
        self,
        limit: int = 100,
        start: int = 0,
        sort: str = "dateModified",
        direction: str = "desc",
    ) -> list[Citation]:
        """
        Fetch items from user's Zotero library.

        Args:
            limit: Maximum number of items to return (max 100)
            start: Offset for pagination
            sort: Field to sort by (dateModified, title, creator, etc.)
            direction: Sort direction (asc or desc)

        Returns:
            List of Citation objects
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.BASE_URL}/users/{self.user_id}/items",
                headers=self._get_headers(),
                params={
                    "limit": min(limit, 100),
                    "start": start,
                    "sort": sort,
                    "direction": direction,
                    "format": "json",
                    "itemType": "-attachment",  # Exclude attachments
                },
            )
            response.raise_for_status()

            items = response.json()
            return [self._parse_item(item) for item in items if item.get("data")]

    async def search_references(
        self,
        query: str,
        limit: int = 50,
        item_type: str = None,
    ) -> list[Citation]:
        """
        Search user's Zotero library for relevant references.

        Args:
            query: Search query string
            limit: Maximum number of results
            item_type: Optional filter by item type (journalArticle, book, etc.)

        Returns:
            List of matching Citation objects
        """
        params = {
            "q": query,
            "limit": min(limit, 100),
            "format": "json",
            "itemType": "-attachment",
        }

        if item_type:
            params["itemType"] = item_type

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.BASE_URL}/users/{self.user_id}/items",
                headers=self._get_headers(),
                params=params,
            )
            response.raise_for_status()

            items = response.json()
            return [self._parse_item(item) for item in items if item.get("data")]

    async def get_collections(self) -> list[ZoteroCollection]:
        """
        Get all collections (folders) in the user's library.

        Returns:
            List of ZoteroCollection objects
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.BASE_URL}/users/{self.user_id}/collections",
                headers=self._get_headers(),
                params={"format": "json"},
            )
            response.raise_for_status()

            collections = response.json()
            return [
                ZoteroCollection(
                    key=c.get("key"),
                    name=c.get("data", {}).get("name", ""),
                    parent_key=c.get("data", {}).get("parentCollection"),
                    item_count=c.get("meta", {}).get("numItems", 0),
                )
                for c in collections
            ]

    async def get_collection_items(
        self,
        collection_key: str,
        limit: int = 100,
    ) -> list[Citation]:
        """
        Get items from a specific collection.

        Args:
            collection_key: The collection key
            limit: Maximum number of items

        Returns:
            List of Citation objects in the collection
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.BASE_URL}/users/{self.user_id}/collections/{collection_key}/items",
                headers=self._get_headers(),
                params={
                    "limit": min(limit, 100),
                    "format": "json",
                    "itemType": "-attachment",
                },
            )
            response.raise_for_status()

            items = response.json()
            return [self._parse_item(item) for item in items if item.get("data")]

    async def format_citations(
        self,
        item_keys: list[str],
        style: str = "apa",
    ) -> list[FormattedCitation]:
        """
        Format citations in a specified citation style.

        Args:
            item_keys: List of Zotero item keys to format
            style: Citation style (apa, mla, chicago-note-bibliography, etc.)

        Returns:
            List of FormattedCitation objects
        """
        results = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            for key in item_keys:
                try:
                    response = await client.get(
                        f"{self.BASE_URL}/users/{self.user_id}/items/{key}",
                        headers={
                            **self._get_headers(),
                            "Accept": f"text/x-bibliography; style={style}",
                        },
                    )
                    if response.status_code == 200:
                        results.append(
                            FormattedCitation(
                                id=key,
                                formatted=response.text.strip(),
                                style=style,
                            )
                        )
                except Exception as e:
                    logger.warning(f"Failed to format citation {key}: {e}")

        return results

    async def get_item_by_key(self, item_key: str) -> Optional[Citation]:
        """
        Get a specific item by its key.

        Args:
            item_key: The Zotero item key

        Returns:
            Citation object or None if not found
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.BASE_URL}/users/{self.user_id}/items/{item_key}",
                    headers=self._get_headers(),
                    params={"format": "json"},
                )

                if response.status_code == 200:
                    return self._parse_item(response.json())
                return None
        except Exception as e:
            logger.warning(f"Failed to get item {item_key}: {e}")
            return None

    def _parse_item(self, item: dict) -> Citation:
        """
        Parse a Zotero API item into a Citation object.

        Args:
            item: Raw item data from Zotero API

        Returns:
            Citation object
        """
        data = item.get("data", {})
        creators = data.get("creators", [])

        # Parse authors
        authors = []
        for creator in creators:
            if creator.get("creatorType") == "author":
                last_name = creator.get("lastName", "")
                first_name = creator.get("firstName", "")
                if last_name and first_name:
                    authors.append(f"{last_name}, {first_name}")
                elif creator.get("name"):
                    authors.append(creator.get("name"))

        # Parse year from date
        year = None
        date_str = data.get("date", "")
        if date_str:
            # Try to extract year from various date formats
            import re

            year_match = re.search(r"\b(19|20)\d{2}\b", date_str)
            if year_match:
                year = int(year_match.group())

        # Parse tags
        tags = [t.get("tag", "") for t in data.get("tags", []) if t.get("tag")]

        return Citation(
            id=item.get("key", ""),
            title=data.get("title", "Untitled"),
            authors=authors,
            year=year,
            journal=data.get("publicationTitle"),
            doi=data.get("DOI"),
            abstract=data.get("abstractNote"),
            item_type=data.get("itemType", "unknown"),
            url=data.get("url"),
            pages=data.get("pages"),
            volume=data.get("volume"),
            issue=data.get("issue"),
            publisher=data.get("publisher"),
            tags=tags,
        )
