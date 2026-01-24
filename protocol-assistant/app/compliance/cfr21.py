"""21 CFR Part 11 compliance for Protocol Assistant.

This module implements FDA 21 CFR Part 11 compliance for electronic records
and electronic signatures. This compliance is optional and must be explicitly
enabled for institutions that require it.

21 CFR Part 11 Requirements:
- Electronic signatures must be unique to one individual
- Identity verification before signing
- Link between signature and signed record
- Signature date and time
- Meaning of signature (e.g., review, approval, authorship)
- System identification
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.compliance.framework import (
    ComplianceRequirement,
    ComplianceResult,
    ComplianceStandard,
    ComplianceViolation,
)
from app.models.audit import ElectronicSignature

logger = logging.getLogger(__name__)


class SignatureCredentials(BaseModel):
    """Credentials provided for electronic signature verification."""

    password: str = Field(..., description="User password for verification")
    timezone: str = Field(default="UTC", description="Signer's timezone")
    mfa_code: Optional[str] = Field(
        None, description="Multi-factor authentication code if required"
    )
    auth_method: str = Field(
        default="password", description="Authentication method used"
    )


class SignatureRequest(BaseModel):
    """Request to create an electronic signature."""

    document_id: UUID = Field(..., description="ID of document to sign")
    document_version: int = Field(..., description="Version of document being signed")
    document_hash: str = Field(..., description="SHA-256 hash of document content")
    meaning: str = Field(
        ..., description="Meaning of signature: approval, review, author, witness"
    )
    statement: Optional[str] = Field(
        None, description="Optional statement accompanying signature"
    )


class SignatureResponse(BaseModel):
    """Response containing electronic signature details."""

    signature_id: UUID
    document_id: UUID
    signer_id: UUID
    signer_name: str
    meaning: str
    timestamp: datetime
    timestamp_utc: datetime
    timezone: str
    is_valid: bool
    signature_hash: str


class SignatureVerificationResult(BaseModel):
    """Result of signature verification."""

    is_valid: bool
    signature_id: UUID
    signer_name: str
    meaning: str
    signed_at: datetime
    document_hash_matches: bool
    errors: list[str] = Field(default_factory=list)


class CFR21Part11Compliance:
    """
    21 CFR Part 11 compliance manager for electronic records and signatures.

    This compliance standard is optional and must be explicitly enabled
    for institutions that are FDA-regulated or choose to comply.

    Key features:
    - Electronic signature creation and verification
    - Document integrity verification
    - Signature meaning capture
    - Audit trail maintenance
    """

    SYSTEM_ID = "protocol-assistant-v1"
    SYSTEM_VERSION = "1.0.0"
    SIGNATURE_ALGORITHM = "SHA-256"

    # Valid signature meanings per 21 CFR Part 11
    VALID_MEANINGS = {"approval", "review", "author", "witness", "acknowledgment"}

    def __init__(self, db: AsyncSession):
        """
        Initialize 21 CFR Part 11 compliance manager.

        Args:
            db: Async database session
        """
        self.db = db

    async def sign_document(
        self,
        document_id: UUID,
        document_version: int,
        document_content: bytes,
        signer_id: UUID,
        signer_name: str,
        signer_email: str,
        meaning: str,
        credentials: SignatureCredentials,
        signer_title: Optional[str] = None,
        signer_institution: Optional[str] = None,
        statement: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> ElectronicSignature:
        """
        Create a 21 CFR Part 11 compliant electronic signature.

        This method creates a legally binding electronic signature that meets
        FDA requirements for electronic records.

        Args:
            document_id: UUID of the document being signed
            document_version: Version number of the document
            document_content: Raw content of the document for hashing
            signer_id: UUID of the person signing
            signer_name: Full legal name of the signer
            signer_email: Email address of the signer
            meaning: Meaning of signature (approval, review, author, witness)
            credentials: Authentication credentials
            signer_title: Professional title (optional)
            signer_institution: Institution name (optional)
            statement: Optional statement with signature
            ip_address: Client IP address
            user_agent: Client user agent

        Returns:
            Created ElectronicSignature record

        Raises:
            ComplianceViolation: If signature requirements not met
        """
        # Validate meaning
        if meaning not in self.VALID_MEANINGS:
            raise ComplianceViolation(
                standard="21_CFR_11",
                requirement="signature_meaning",
                message=f"Invalid signature meaning: {meaning}. Must be one of: {self.VALID_MEANINGS}",
            )

        # Verify credentials (in production, this would authenticate the user)
        auth_verified = await self._verify_credentials(signer_id, credentials)
        if not auth_verified:
            raise ComplianceViolation(
                standard="21_CFR_11",
                requirement="identity_verification",
                message="Failed to verify signer identity",
            )

        # Compute document hash
        document_hash = hashlib.sha256(document_content).hexdigest()

        # Get current timestamp in UTC and signer's timezone
        now_utc = datetime.now(timezone.utc)
        now_local = now_utc  # In production, convert to signer's timezone

        # Compute signature hash
        signature_hash = self._compute_signature_hash(
            document_id=document_id,
            document_hash=document_hash,
            signer_id=signer_id,
            meaning=meaning,
            timestamp=now_utc,
        )

        # Create signature record
        signature = ElectronicSignature(
            id=uuid4(),
            document_id=document_id,
            document_version=document_version,
            document_hash=document_hash,
            signer_id=signer_id,
            signer_name=signer_name,
            signer_email=signer_email,
            signer_title=signer_title,
            signer_institution=signer_institution,
            meaning=meaning,
            statement=statement,
            timestamp=now_local,
            timezone=credentials.timezone,
            timestamp_utc=now_utc,
            system_id=self.SYSTEM_ID,
            system_version=self.SYSTEM_VERSION,
            signature_hash=signature_hash,
            signature_algorithm=self.SIGNATURE_ALGORITHM,
            auth_method=credentials.auth_method,
            auth_timestamp=now_utc,
            ip_address=ip_address,
            user_agent=user_agent,
            is_valid=True,
        )

        self.db.add(signature)
        await self.db.commit()
        await self.db.refresh(signature)

        logger.info(
            f"Electronic signature created: document={document_id} "
            f"signer={signer_name} meaning={meaning}"
        )

        return signature

    async def verify_signature(
        self,
        signature_id: UUID,
        document_content: Optional[bytes] = None,
    ) -> SignatureVerificationResult:
        """
        Verify an electronic signature.

        Checks:
        - Signature exists and is valid
        - Document hash matches (if document content provided)
        - Signature has not been invalidated

        Args:
            signature_id: UUID of the signature to verify
            document_content: Optional document content to verify hash

        Returns:
            SignatureVerificationResult with verification status
        """
        signature = await self.db.get(ElectronicSignature, signature_id)

        if not signature:
            return SignatureVerificationResult(
                is_valid=False,
                signature_id=signature_id,
                signer_name="Unknown",
                meaning="unknown",
                signed_at=datetime.now(timezone.utc),
                document_hash_matches=False,
                errors=["Signature not found"],
            )

        errors = []

        # Check if signature is still valid
        if not signature.is_valid:
            errors.append(
                f"Signature invalidated: {signature.invalidation_reason or 'No reason provided'}"
            )

        # Verify document hash if content provided
        document_hash_matches = True
        if document_content:
            current_hash = hashlib.sha256(document_content).hexdigest()
            if current_hash != signature.document_hash:
                document_hash_matches = False
                errors.append(
                    "Document has been modified since signing"
                )

        return SignatureVerificationResult(
            is_valid=signature.is_valid and document_hash_matches and len(errors) == 0,
            signature_id=signature.id,
            signer_name=signature.signer_name,
            meaning=signature.meaning,
            signed_at=signature.timestamp_utc,
            document_hash_matches=document_hash_matches,
            errors=errors,
        )

    async def invalidate_signature(
        self,
        signature_id: UUID,
        reason: str,
        invalidated_by: UUID,
    ) -> bool:
        """
        Invalidate an electronic signature.

        Once invalidated, a signature cannot be re-validated. This action
        is logged for compliance purposes.

        Args:
            signature_id: UUID of the signature to invalidate
            reason: Reason for invalidation
            invalidated_by: UUID of user performing invalidation

        Returns:
            True if invalidation successful
        """
        signature = await self.db.get(ElectronicSignature, signature_id)

        if not signature:
            logger.warning(f"Attempted to invalidate non-existent signature: {signature_id}")
            return False

        if not signature.is_valid:
            logger.warning(f"Signature already invalidated: {signature_id}")
            return False

        signature.is_valid = False
        signature.invalidated_at = datetime.now(timezone.utc)
        signature.invalidation_reason = reason

        await self.db.commit()

        logger.info(
            f"Signature invalidated: {signature_id} by {invalidated_by} "
            f"reason={reason}"
        )

        return True

    async def get_document_signatures(
        self, document_id: UUID
    ) -> list[ElectronicSignature]:
        """
        Get all signatures for a document.

        Args:
            document_id: UUID of the document

        Returns:
            List of signatures ordered by timestamp
        """
        result = await self.db.execute(
            select(ElectronicSignature)
            .where(ElectronicSignature.document_id == document_id)
            .order_by(ElectronicSignature.timestamp_utc)
        )
        return list(result.scalars().all())

    async def get_user_signatures(
        self,
        signer_id: UUID,
        limit: int = 100,
    ) -> list[ElectronicSignature]:
        """
        Get all signatures by a user.

        Args:
            signer_id: UUID of the signer
            limit: Maximum number of signatures to return

        Returns:
            List of signatures ordered by timestamp (newest first)
        """
        result = await self.db.execute(
            select(ElectronicSignature)
            .where(ElectronicSignature.signer_id == signer_id)
            .order_by(ElectronicSignature.timestamp_utc.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def check_signature_requirements(
        self,
        document_id: UUID,
        required_signatures: list[dict[str, Any]],
    ) -> ComplianceResult:
        """
        Check if a document has all required signatures.

        Args:
            document_id: UUID of the document
            required_signatures: List of required signature specs, each with:
                - meaning: Required meaning (e.g., "approval")
                - role: Optional required signer role

        Returns:
            ComplianceResult indicating if requirements are met
        """
        signatures = await self.get_document_signatures(document_id)
        valid_signatures = [s for s in signatures if s.is_valid]

        missing = []
        for req in required_signatures:
            meaning = req.get("meaning")
            found = any(s.meaning == meaning for s in valid_signatures)
            if not found:
                missing.append(meaning)

        if missing:
            return ComplianceResult(
                passed=False,
                standard="21_CFR_11",
                requirement="required_signatures",
                message=f"Document missing required signatures: {', '.join(missing)}",
                details={
                    "document_id": str(document_id),
                    "missing_meanings": missing,
                    "current_signatures": [
                        {"meaning": s.meaning, "signer": s.signer_name}
                        for s in valid_signatures
                    ],
                },
            )

        return ComplianceResult(
            passed=True,
            standard="21_CFR_11",
            requirement="required_signatures",
            message="All required signatures present",
        )

    async def _verify_credentials(
        self, signer_id: UUID, credentials: SignatureCredentials
    ) -> bool:
        """
        Verify signer credentials.

        In production, this would:
        - Verify password against stored hash
        - Verify MFA code if required
        - Check account status

        For now, returns True for valid-looking credentials.

        Args:
            signer_id: UUID of the signer
            credentials: Provided credentials

        Returns:
            True if credentials verified
        """
        # TODO: Implement actual credential verification
        # This should integrate with the authentication system
        if not credentials.password:
            return False
        return True

    def _compute_signature_hash(
        self,
        document_id: UUID,
        document_hash: str,
        signer_id: UUID,
        meaning: str,
        timestamp: datetime,
    ) -> str:
        """
        Compute a cryptographic hash for the signature.

        This hash binds together all signature components to prevent
        tampering and ensure integrity.

        Args:
            document_id: UUID of the document
            document_hash: Hash of document content
            signer_id: UUID of the signer
            meaning: Signature meaning
            timestamp: Signature timestamp

        Returns:
            Hex-encoded SHA-256 hash
        """
        data = (
            f"{document_id}|{document_hash}|{signer_id}|"
            f"{meaning}|{timestamp.isoformat()}|{self.SYSTEM_ID}"
        )
        return hashlib.sha256(data.encode()).hexdigest()


class ElectronicRecordRequirement(ComplianceRequirement):
    """
    Requirement: Electronic records must maintain integrity and authenticity.

    21 CFR Part 11 requires that electronic records be accurate, complete,
    and unaltered throughout their retention period.
    """

    name = "electronic_record_integrity"
    description = "Electronic records must maintain integrity and authenticity"
    standard = ComplianceStandard.CFR_21_11
    is_mandatory = True

    async def validate(self, context: dict[str, Any]) -> ComplianceResult:
        """
        Validate electronic record integrity.

        Args:
            context: Dictionary containing:
                - record_hash: Expected hash of the record
                - current_content: Current content to verify

        Returns:
            ComplianceResult indicating integrity status
        """
        expected_hash = context.get("record_hash")
        current_content = context.get("current_content")

        if not expected_hash or not current_content:
            return ComplianceResult(
                passed=True,
                standard="21_CFR_11",
                requirement=self.name,
                message="No integrity verification requested",
            )

        if isinstance(current_content, str):
            current_content = current_content.encode()

        current_hash = hashlib.sha256(current_content).hexdigest()

        if current_hash != expected_hash:
            return ComplianceResult(
                passed=False,
                standard="21_CFR_11",
                requirement=self.name,
                message="Record integrity check failed - content has been modified",
                severity="error",
                details={
                    "expected_hash": expected_hash,
                    "current_hash": current_hash,
                },
            )

        return ComplianceResult(
            passed=True,
            standard="21_CFR_11",
            requirement=self.name,
            message="Record integrity verified",
        )

    async def enforce(self, context: dict[str, Any]) -> str:
        """
        Compute and return a hash for the given content.

        Args:
            context: Dictionary containing:
                - content: Content to hash

        Returns:
            SHA-256 hash of the content
        """
        content = context.get("content", b"")
        if isinstance(content, str):
            content = content.encode()

        return hashlib.sha256(content).hexdigest()
