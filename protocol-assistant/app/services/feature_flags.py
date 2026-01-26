"""
Feature Flag Service for Protocol Assistant.

This service provides feature flag management with:
- Environment variable defaults
- Database-backed flag definitions
- Institution and user-level overrides
- A/B testing with percentage rollout
- Audit logging for compliance
"""

import os
import logging
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from uuid import UUID
from functools import lru_cache

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.feature_flags import (
    FeatureFlag,
    FeatureFlagOverride,
    FeatureFlagAudit,
    DEFAULT_FLAGS,
)

logger = logging.getLogger(__name__)


class FeatureFlagService:
    """
    Service for managing and evaluating feature flags.

    Feature flags are evaluated in this priority order:
    1. User-level override (if exists and not expired)
    2. Institution-level override (if exists and not expired)
    3. Database flag default
    4. Environment variable (FEATURE_FLAG_{NAME}=true/false)
    5. Hardcoded default (false)
    """

    # Environment variable prefix for feature flags
    ENV_PREFIX = "FEATURE_FLAG_"

    # Cache TTL for flag lookups (in-memory)
    _cache: Dict[str, tuple[Any, datetime]] = {}
    CACHE_TTL_SECONDS = 60

    def __init__(self, db: AsyncSession):
        self.db = db

    async def is_enabled(
        self,
        flag_name: str,
        institution_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        default: bool = False,
    ) -> bool:
        """
        Check if a feature flag is enabled.

        Args:
            flag_name: Name of the feature flag
            institution_id: Optional institution for scoped checks
            user_id: Optional user for user-level overrides
            default: Default value if flag not found

        Returns:
            True if the flag is enabled for the given context
        """
        # Check user override first (highest priority)
        if user_id:
            user_override = await self._get_user_override(flag_name, user_id)
            if user_override is not None:
                return user_override

        # Check institution override
        if institution_id:
            inst_override = await self._get_institution_override(flag_name, institution_id)
            if inst_override is not None:
                return inst_override

        # Check database flag
        flag = await self._get_flag(flag_name)
        if flag:
            # If flag uses percentage rollout, compute based on user/institution
            if flag.rollout_percentage < 100 and (user_id or institution_id):
                return self._is_in_rollout(
                    flag_name,
                    flag.rollout_percentage,
                    user_id,
                    institution_id,
                )
            return flag.is_enabled

        # Check environment variable
        env_value = os.environ.get(f"{self.ENV_PREFIX}{flag_name.upper()}")
        if env_value is not None:
            return env_value.lower() in ("true", "1", "yes", "on")

        return default

    async def get_all_flags(
        self,
        institution_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        category: Optional[str] = None,
    ) -> Dict[str, bool]:
        """
        Get all feature flags with their effective values.

        Args:
            institution_id: Optional institution for scoped values
            user_id: Optional user for user-level values
            category: Optional filter by category

        Returns:
            Dict mapping flag names to their enabled status
        """
        # Get all flags from database
        query = select(FeatureFlag)
        if category:
            query = query.where(FeatureFlag.category == category)

        result = await self.db.execute(query)
        flags = result.scalars().all()

        # Build result dict with effective values
        result_dict = {}
        for flag in flags:
            result_dict[flag.name] = await self.is_enabled(
                flag.name,
                institution_id=institution_id,
                user_id=user_id,
                default=flag.is_enabled,
            )

        return result_dict

    async def get_flag_details(
        self,
        flag_name: str,
        institution_id: Optional[UUID] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a feature flag.

        Returns:
            Dict with flag details or None if not found
        """
        flag = await self._get_flag(flag_name)
        if not flag:
            return None

        # Get overrides count
        overrides_query = select(FeatureFlagOverride).where(
            FeatureFlagOverride.flag_id == flag.id
        )
        if institution_id:
            overrides_query = overrides_query.where(
                FeatureFlagOverride.institution_id == institution_id
            )
        overrides_result = await self.db.execute(overrides_query)
        overrides = overrides_result.scalars().all()

        return {
            "name": flag.name,
            "description": flag.description,
            "category": flag.category,
            "is_enabled": flag.is_enabled,
            "rollout_percentage": flag.rollout_percentage,
            "flag_type": flag.flag_type,
            "metadata": flag.metadata,
            "overrides_count": len(overrides),
            "created_at": flag.created_at,
            "updated_at": flag.updated_at,
        }

    async def set_flag(
        self,
        flag_name: str,
        is_enabled: bool,
        admin_id: UUID,
        rollout_percentage: Optional[float] = None,
        reason: Optional[str] = None,
    ) -> FeatureFlag:
        """
        Set the global default for a feature flag.

        Args:
            flag_name: Name of the flag
            is_enabled: New enabled state
            admin_id: ID of admin making the change
            rollout_percentage: Optional new rollout percentage
            reason: Optional reason for the change

        Returns:
            Updated FeatureFlag
        """
        flag = await self._get_flag(flag_name)

        if not flag:
            raise ValueError(f"Feature flag '{flag_name}' not found")

        # Record previous state for audit
        previous_value = {
            "is_enabled": flag.is_enabled,
            "rollout_percentage": flag.rollout_percentage,
        }

        # Update flag
        flag.is_enabled = is_enabled
        if rollout_percentage is not None:
            flag.rollout_percentage = rollout_percentage

        # Create audit entry
        await self._log_audit(
            flag_name=flag_name,
            action="updated",
            actor_id=admin_id,
            previous_value=previous_value,
            new_value={
                "is_enabled": is_enabled,
                "rollout_percentage": rollout_percentage or flag.rollout_percentage,
            },
            reason=reason,
        )

        await self.db.commit()
        await self.db.refresh(flag)

        # Clear cache
        self._invalidate_cache(flag_name)

        logger.info(
            f"Feature flag '{flag_name}' updated to {is_enabled} by {admin_id}"
        )

        return flag

    async def set_institution_override(
        self,
        flag_name: str,
        institution_id: UUID,
        is_enabled: bool,
        admin_id: UUID,
        reason: Optional[str] = None,
        expires_at: Optional[datetime] = None,
    ) -> FeatureFlagOverride:
        """
        Set an institution-level override for a feature flag.

        Args:
            flag_name: Name of the flag
            institution_id: Institution to override for
            is_enabled: Override value
            admin_id: ID of admin making the change
            reason: Optional reason for the override
            expires_at: Optional expiration time

        Returns:
            Created or updated FeatureFlagOverride
        """
        flag = await self._get_flag(flag_name)
        if not flag:
            raise ValueError(f"Feature flag '{flag_name}' not found")

        # Check for existing override
        query = select(FeatureFlagOverride).where(
            and_(
                FeatureFlagOverride.flag_id == flag.id,
                FeatureFlagOverride.institution_id == institution_id,
            )
        )
        result = await self.db.execute(query)
        override = result.scalar_one_or_none()

        if override:
            # Update existing
            previous_value = {"is_enabled": override.is_enabled}
            override.is_enabled = is_enabled
            override.reason = reason
            override.expires_at = expires_at
            override.created_by = admin_id
            action = "override_updated"
        else:
            # Create new
            previous_value = None
            override = FeatureFlagOverride(
                flag_id=flag.id,
                institution_id=institution_id,
                is_enabled=is_enabled,
                reason=reason,
                expires_at=expires_at,
                created_by=admin_id,
            )
            self.db.add(override)
            action = "override_created"

        # Audit
        await self._log_audit(
            flag_name=flag_name,
            action=action,
            actor_id=admin_id,
            previous_value=previous_value,
            new_value={"is_enabled": is_enabled},
            institution_id=institution_id,
            reason=reason,
        )

        await self.db.commit()
        await self.db.refresh(override)

        # Clear cache
        self._invalidate_cache(flag_name, institution_id=institution_id)

        logger.info(
            f"Institution override for '{flag_name}' set to {is_enabled} "
            f"for institution {institution_id}"
        )

        return override

    async def remove_institution_override(
        self,
        flag_name: str,
        institution_id: UUID,
        admin_id: UUID,
        reason: Optional[str] = None,
    ) -> bool:
        """
        Remove an institution-level override.

        Returns:
            True if override was removed, False if not found
        """
        flag = await self._get_flag(flag_name)
        if not flag:
            return False

        query = select(FeatureFlagOverride).where(
            and_(
                FeatureFlagOverride.flag_id == flag.id,
                FeatureFlagOverride.institution_id == institution_id,
            )
        )
        result = await self.db.execute(query)
        override = result.scalar_one_or_none()

        if not override:
            return False

        previous_value = {"is_enabled": override.is_enabled}
        await self.db.delete(override)

        # Audit
        await self._log_audit(
            flag_name=flag_name,
            action="override_deleted",
            actor_id=admin_id,
            previous_value=previous_value,
            institution_id=institution_id,
            reason=reason,
        )

        await self.db.commit()

        # Clear cache
        self._invalidate_cache(flag_name, institution_id=institution_id)

        return True

    async def get_institution_overrides(
        self,
        institution_id: UUID,
    ) -> List[Dict[str, Any]]:
        """
        Get all overrides for an institution.

        Returns:
            List of override details
        """
        query = (
            select(FeatureFlagOverride, FeatureFlag)
            .join(FeatureFlag)
            .where(FeatureFlagOverride.institution_id == institution_id)
        )
        result = await self.db.execute(query)
        rows = result.all()

        return [
            {
                "flag_name": flag.name,
                "is_enabled": override.is_enabled,
                "default_enabled": flag.is_enabled,
                "reason": override.reason,
                "expires_at": override.expires_at,
                "created_at": override.created_at,
            }
            for override, flag in rows
        ]

    async def seed_default_flags(self) -> int:
        """
        Seed the database with default feature flags.

        Only creates flags that don't already exist.

        Returns:
            Number of flags created
        """
        created = 0

        for flag_def in DEFAULT_FLAGS:
            existing = await self._get_flag(flag_def["name"])
            if not existing:
                flag = FeatureFlag(**flag_def)
                self.db.add(flag)
                created += 1
                logger.info(f"Created default feature flag: {flag_def['name']}")

        if created > 0:
            await self.db.commit()

        return created

    async def get_audit_log(
        self,
        flag_name: Optional[str] = None,
        institution_id: Optional[UUID] = None,
        limit: int = 50,
    ) -> List[FeatureFlagAudit]:
        """
        Get audit log entries for feature flags.
        """
        query = select(FeatureFlagAudit).order_by(FeatureFlagAudit.created_at.desc())

        if flag_name:
            query = query.where(FeatureFlagAudit.flag_name == flag_name)
        if institution_id:
            query = query.where(FeatureFlagAudit.institution_id == institution_id)

        query = query.limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    # Private methods

    async def _get_flag(self, flag_name: str) -> Optional[FeatureFlag]:
        """Get a feature flag by name."""
        query = select(FeatureFlag).where(FeatureFlag.name == flag_name)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _get_user_override(
        self,
        flag_name: str,
        user_id: UUID,
    ) -> Optional[bool]:
        """Get user-level override if exists and not expired."""
        flag = await self._get_flag(flag_name)
        if not flag:
            return None

        query = select(FeatureFlagOverride).where(
            and_(
                FeatureFlagOverride.flag_id == flag.id,
                FeatureFlagOverride.user_id == user_id,
            )
        )
        result = await self.db.execute(query)
        override = result.scalar_one_or_none()

        if not override:
            return None

        # Check expiration
        if override.expires_at and override.expires_at < datetime.now(timezone.utc):
            return None

        return override.is_enabled

    async def _get_institution_override(
        self,
        flag_name: str,
        institution_id: UUID,
    ) -> Optional[bool]:
        """Get institution-level override if exists and not expired."""
        flag = await self._get_flag(flag_name)
        if not flag:
            return None

        query = select(FeatureFlagOverride).where(
            and_(
                FeatureFlagOverride.flag_id == flag.id,
                FeatureFlagOverride.institution_id == institution_id,
            )
        )
        result = await self.db.execute(query)
        override = result.scalar_one_or_none()

        if not override:
            return None

        # Check expiration
        if override.expires_at and override.expires_at < datetime.now(timezone.utc):
            return None

        return override.is_enabled

    def _is_in_rollout(
        self,
        flag_name: str,
        percentage: float,
        user_id: Optional[UUID],
        institution_id: Optional[UUID],
    ) -> bool:
        """
        Determine if user/institution is in the rollout group.

        Uses consistent hashing to ensure same users always get same result.
        """
        # Create a consistent hash key
        key_parts = [flag_name]
        if user_id:
            key_parts.append(str(user_id))
        if institution_id:
            key_parts.append(str(institution_id))

        hash_key = ":".join(key_parts)
        hash_value = int(hashlib.md5(hash_key.encode()).hexdigest(), 16)

        # Convert to 0-100 range and compare with percentage
        bucket = hash_value % 100
        return bucket < percentage

    async def _log_audit(
        self,
        flag_name: str,
        action: str,
        actor_id: Optional[UUID] = None,
        previous_value: Optional[Dict] = None,
        new_value: Optional[Dict] = None,
        institution_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        reason: Optional[str] = None,
    ) -> None:
        """Log a feature flag change to the audit table."""
        audit = FeatureFlagAudit(
            flag_name=flag_name,
            action=action,
            actor_id=actor_id,
            previous_value=previous_value,
            new_value=new_value,
            institution_id=institution_id,
            user_id=user_id,
            reason=reason,
        )
        self.db.add(audit)

    def _invalidate_cache(
        self,
        flag_name: str,
        institution_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
    ) -> None:
        """Invalidate cached flag values."""
        # Simple approach: clear all cache entries for this flag
        keys_to_remove = [
            k for k in self._cache.keys()
            if k.startswith(f"{flag_name}:")
        ]
        for key in keys_to_remove:
            del self._cache[key]


# Singleton-like access for dependency injection
_service_instance: Optional[FeatureFlagService] = None


def get_feature_flag_service(db: AsyncSession) -> FeatureFlagService:
    """Get or create the feature flag service."""
    return FeatureFlagService(db)
