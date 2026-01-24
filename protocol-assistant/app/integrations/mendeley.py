"""Mendeley integration for reference management with OAuth authentication."""

import logging
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx
from pydantic import BaseModel, Field

from app.integrations.base import AuthResult, IntegrationProvider, SyncResult
from app.integrations.zotero import Citation

logger = logging.getLogger(__name__)


class MendeleyDocument(BaseModel):
    """Extended document information from Mendeley."""

    id: str
    title: str
    authors: list[dict] = Field(default_factory=list)
    year: Optional[int] = None
    source: Optional[str] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None
    document_type: str = "unknown"
    created: Optional[datetime] = None
    last_modified: Optional[datetime] = None
    file_attached: bool = False
    read: bool = False
    starred: bool = False
    folder_ids: list[str] = Field(default_factory=list)


class MendeleyFolder(BaseModel):
    """Represents a Mendeley folder."""

    id: str
    name: str
    parent_id: Optional[str] = None
    created: Optional[datetime] = None


class MendeleyIntegration(IntegrationProvider):
    """
    Mendeley integration for managing research references.

    Uses OAuth 2.0 for authentication and provides access to:
    - Document library browsing and searching
    - Folder organization
    - Document metadata and annotations
    """

    name = "mendeley"
    AUTH_URL = "https://api.mendeley.com/oauth/authorize"
    TOKEN_URL = "https://api.mendeley.com/oauth/token"
    API_URL = "https://api.mendeley.com"

    def __init__(
        self,
        client_id: str = None,
        client_secret: str = None,
        access_token: str = None,
    ):
        """
        Initialize Mendeley integration.

        Args:
            client_id: OAuth client ID from Mendeley developer portal
            client_secret: OAuth client secret
            access_token: Optional existing access token
        """
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = access_token

    def _get_headers(self) -> dict:
        """Get common headers for Mendeley API requests."""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/vnd.mendeley-document.1+json",
        }

    def get_auth_url(self, redirect_uri: str, state: str) -> str:
        """
        Get OAuth authorization URL for user consent.

        Args:
            redirect_uri: URI to redirect after authorization
            state: State parameter for CSRF protection

        Returns:
            Full authorization URL
        """
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "all",
            "state": state,
        }
        return f"{self.AUTH_URL}?{urlencode(params)}"

    async def authenticate(self, credentials: dict) -> AuthResult:
        """
        Exchange OAuth authorization code for access tokens.

        Args:
            credentials: Dict containing 'code' and 'redirect_uri'

        Returns:
            AuthResult with access and refresh tokens
        """
        code = credentials.get("code")
        redirect_uri = credentials.get("redirect_uri")

        if not code:
            return AuthResult(success=False, error="Authorization code is required")

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.TOKEN_URL,
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": redirect_uri,
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

                if response.status_code == 200:
                    data = response.json()
                    expires_in = data.get("expires_in", 3600)
                    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

                    self.access_token = data.get("access_token")

                    # Get user profile
                    user_info = await self._get_profile()

                    return AuthResult(
                        success=True,
                        access_token=data.get("access_token"),
                        refresh_token=data.get("refresh_token"),
                        expires_at=expires_at,
                        user_id=user_info.get("id") if user_info else None,
                        metadata={
                            "display_name": user_info.get("display_name")
                            if user_info
                            else None,
                            "email": user_info.get("email") if user_info else None,
                        },
                    )
                else:
                    error_data = response.json() if response.text else {}
                    return AuthResult(
                        success=False,
                        error=error_data.get(
                            "error_description",
                            f"Authentication failed: {response.status_code}",
                        ),
                    )
        except httpx.TimeoutException:
            return AuthResult(success=False, error="Connection timeout")
        except Exception as e:
            logger.exception("Mendeley authentication error")
            return AuthResult(success=False, error=str(e))

    async def refresh_token(self, refresh_token: str) -> AuthResult:
        """
        Refresh an expired access token.

        Args:
            refresh_token: The refresh token from previous authentication

        Returns:
            AuthResult with new access and refresh tokens
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.TOKEN_URL,
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token,
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

                if response.status_code == 200:
                    data = response.json()
                    expires_in = data.get("expires_in", 3600)
                    expires_at = datetime.utcnow() + timedelta(seconds=expires_in)

                    self.access_token = data.get("access_token")

                    return AuthResult(
                        success=True,
                        access_token=data.get("access_token"),
                        refresh_token=data.get("refresh_token", refresh_token),
                        expires_at=expires_at,
                    )
                else:
                    return AuthResult(
                        success=False,
                        error=f"Token refresh failed: {response.status_code}",
                    )
        except Exception as e:
            logger.exception("Mendeley token refresh error")
            return AuthResult(success=False, error=str(e))

    async def test_connection(self, access_token: str) -> bool:
        """
        Test if the access token is valid.

        Args:
            access_token: The access token to test

        Returns:
            True if token is valid
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.API_URL}/profiles/me",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                return response.status_code == 200
        except Exception:
            return False

    async def _get_profile(self) -> Optional[dict]:
        """Get the authenticated user's profile."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.API_URL}/profiles/me",
                    headers=self._get_headers(),
                )
                if response.status_code == 200:
                    return response.json()
                return None
        except Exception:
            return None

    async def get_library(
        self,
        limit: int = 100,
        offset: int = 0,
        sort: str = "last_modified",
        order: str = "desc",
    ) -> list[Citation]:
        """
        Fetch documents from user's Mendeley library.

        Args:
            limit: Maximum number of documents to return
            offset: Offset for pagination
            sort: Field to sort by (created, last_modified, title)
            order: Sort order (asc or desc)

        Returns:
            List of Citation objects
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.API_URL}/documents",
                headers=self._get_headers(),
                params={
                    "limit": min(limit, 500),
                    "offset": offset,
                    "sort": sort,
                    "order": order,
                    "view": "all",
                },
            )
            response.raise_for_status()

            items = response.json()
            return [self._parse_item(item) for item in items]

    async def search_references(
        self,
        query: str,
        limit: int = 50,
        access_token: str = None,
    ) -> list[Citation]:
        """
        Search Mendeley library for documents.

        Args:
            query: Search query string
            limit: Maximum number of results
            access_token: Optional access token (uses instance token if not provided)

        Returns:
            List of matching Citation objects
        """
        if access_token:
            self.access_token = access_token

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.API_URL}/documents",
                headers=self._get_headers(),
                params={
                    "title": query,
                    "limit": min(limit, 500),
                    "view": "all",
                },
            )
            response.raise_for_status()

            items = response.json()
            return [self._parse_item(item) for item in items]

    async def get_folders(self) -> list[MendeleyFolder]:
        """
        Get all folders in the user's library.

        Returns:
            List of MendeleyFolder objects
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.API_URL}/folders",
                headers=self._get_headers(),
            )
            response.raise_for_status()

            folders = response.json()
            return [
                MendeleyFolder(
                    id=f.get("id"),
                    name=f.get("name", ""),
                    parent_id=f.get("parent_id"),
                    created=datetime.fromisoformat(f["created"].replace("Z", "+00:00"))
                    if f.get("created")
                    else None,
                )
                for f in folders
            ]

    async def get_folder_documents(
        self,
        folder_id: str,
        limit: int = 100,
    ) -> list[Citation]:
        """
        Get documents in a specific folder.

        Args:
            folder_id: The folder ID
            limit: Maximum number of documents

        Returns:
            List of Citation objects
        """
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.API_URL}/folders/{folder_id}/documents",
                headers=self._get_headers(),
                params={"limit": min(limit, 500)},
            )
            response.raise_for_status()

            document_ids = response.json()

            # Fetch full document details
            citations = []
            for doc_id in document_ids[:limit]:
                doc = await self.get_document(doc_id.get("id"))
                if doc:
                    citations.append(doc)

            return citations

    async def get_document(self, document_id: str) -> Optional[Citation]:
        """
        Get a specific document by ID.

        Args:
            document_id: The Mendeley document ID

        Returns:
            Citation object or None if not found
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{self.API_URL}/documents/{document_id}",
                    headers=self._get_headers(),
                    params={"view": "all"},
                )

                if response.status_code == 200:
                    return self._parse_item(response.json())
                return None
        except Exception as e:
            logger.warning(f"Failed to get document {document_id}: {e}")
            return None

    async def sync_library(self, since: datetime = None) -> SyncResult:
        """
        Sync library changes since a given time.

        Args:
            since: Only fetch changes after this time

        Returns:
            SyncResult with sync statistics
        """
        import time

        start_time = time.time()
        errors = []
        items_synced = 0

        try:
            params = {"limit": 500, "view": "all"}
            if since:
                params["modified_since"] = since.isoformat() + "Z"

            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(
                    f"{self.API_URL}/documents",
                    headers=self._get_headers(),
                    params=params,
                )
                response.raise_for_status()

                items = response.json()
                items_synced = len(items)

            return SyncResult(
                success=True,
                items_synced=items_synced,
                duration_seconds=time.time() - start_time,
            )
        except Exception as e:
            errors.append(str(e))
            return SyncResult(
                success=False,
                errors=errors,
                duration_seconds=time.time() - start_time,
            )

    def _parse_item(self, item: dict) -> Citation:
        """
        Parse a Mendeley document into a Citation object.

        Args:
            item: Raw document data from Mendeley API

        Returns:
            Citation object
        """
        authors = []
        for author in item.get("authors", []):
            last_name = author.get("last_name", "")
            first_name = author.get("first_name", "")
            if last_name and first_name:
                authors.append(f"{last_name}, {first_name}")
            elif last_name:
                authors.append(last_name)

        return Citation(
            id=item.get("id", ""),
            title=item.get("title", "Untitled"),
            authors=authors,
            year=item.get("year"),
            journal=item.get("source"),
            doi=item.get("identifiers", {}).get("doi"),
            abstract=item.get("abstract"),
            item_type=item.get("type", "unknown"),
            url=item.get("websites", [None])[0] if item.get("websites") else None,
            pages=item.get("pages"),
            volume=item.get("volume"),
            issue=item.get("issue"),
            publisher=item.get("publisher"),
            tags=[],  # Mendeley uses different tag system
        )
