"""
Prompt versioning and A/B testing for Protocol Assistant.

This module provides admin-controlled prompt management with:
- Version tracking for all prompts
- A/B testing with configurable traffic percentages
- Performance metrics collection
- Approval workflow for production deployment
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from uuid import UUID, uuid4
from datetime import datetime
from typing import Optional
import random
import logging

from app.models.learning import PromptVersion

logger = logging.getLogger(__name__)


class PromptManager:
    """
    Admin-controlled prompt management with A/B testing.

    This class handles:
    - Retrieving prompts with A/B testing selection
    - Creating new prompt versions
    - Activating/deactivating versions
    - Tracking performance metrics
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_prompt(
        self,
        prompt_key: str,
        institution_id: Optional[str] = None,
    ) -> tuple[str, str]:
        """
        Get prompt for a task with A/B testing.

        Returns (content, version_id) tuple. If multiple active prompts
        exist for the key, selects one based on traffic percentages.

        Args:
            prompt_key: The identifier for the prompt (e.g., "gap_analysis", "document_generation")
            institution_id: Optional institution ID for institution-specific prompts

        Returns:
            Tuple of (prompt_content, version_id)

        Raises:
            ValueError: If no active prompt found for the key
        """
        # Get active prompts for this key
        result = await self.db.execute(
            select(PromptVersion)
            .where(
                PromptVersion.prompt_key == prompt_key,
                PromptVersion.is_active == True,
            )
        )
        prompts = result.scalars().all()

        if not prompts:
            raise ValueError(f"No active prompt found for key: {prompt_key}")

        # If only one prompt, return it directly
        if len(prompts) == 1:
            selected = prompts[0]
            logger.debug(f"Selected prompt version {selected.version} for key {prompt_key}")
            return selected.content, str(selected.id)

        # A/B selection based on traffic percentage
        selected = self._select_ab_variant(prompts)
        logger.debug(
            f"A/B selected prompt version {selected.version} for key {prompt_key} "
            f"(traffic: {selected.traffic_percentage}%)"
        )
        return selected.content, str(selected.id)

    def _select_ab_variant(self, prompts: list[PromptVersion]) -> PromptVersion:
        """
        Select prompt variant based on traffic percentages.

        Uses weighted random selection based on each prompt's traffic_percentage.

        Args:
            prompts: List of active prompt versions

        Returns:
            Selected PromptVersion
        """
        total = sum(p.traffic_percentage for p in prompts)
        if total <= 0:
            # If no traffic percentages set, use default prompt
            default_prompts = [p for p in prompts if p.is_default]
            return default_prompts[0] if default_prompts else prompts[0]

        r = random.uniform(0, total)

        cumulative = 0
        for prompt in prompts:
            cumulative += prompt.traffic_percentage
            if r <= cumulative:
                return prompt

        return prompts[0]  # Fallback

    async def create_version(
        self,
        prompt_key: str,
        content: str,
        created_by: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None,
        system_prompt: Optional[str] = None,
        parameters: Optional[dict] = None,
    ) -> PromptVersion:
        """
        Create new prompt version (inactive by default).

        New versions are created in inactive state and must be explicitly
        activated through the approval workflow.

        Args:
            prompt_key: The prompt identifier
            content: The prompt template content
            created_by: UUID of the user creating the version
            name: Optional human-readable version name
            description: Optional description of changes
            system_prompt: Optional separate system prompt
            parameters: Optional LLM parameters (temperature, etc.)

        Returns:
            The newly created PromptVersion
        """
        # Get latest version number for this key
        result = await self.db.execute(
            select(PromptVersion.version)
            .where(PromptVersion.prompt_key == prompt_key)
            .order_by(PromptVersion.version.desc())
            .limit(1)
        )
        latest = result.scalar_one_or_none()

        version = PromptVersion(
            prompt_key=prompt_key,
            version=latest + 1 if latest else 1,
            name=name,
            description=description,
            content=content,
            system_prompt=system_prompt,
            parameters=parameters,
            created_by=created_by,
            is_active=False,
            is_default=False,
            traffic_percentage=0,
            sample_count=0,
            error_count=0,
        )

        self.db.add(version)
        await self.db.commit()
        await self.db.refresh(version)

        logger.info(
            f"Created prompt version {version.version} for key {prompt_key} "
            f"by user {created_by}"
        )

        return version

    async def activate_version(
        self,
        version_id: int,
        approved_by: UUID,
        traffic_percentage: float = 100,
    ) -> PromptVersion:
        """
        Activate a prompt version for production use.

        If traffic_percentage is 100, this version becomes the sole active
        version and all others are deactivated. Otherwise, this version
        is added to the A/B test pool.

        Args:
            version_id: ID of the version to activate
            approved_by: UUID of the approving admin
            traffic_percentage: Percentage of traffic to route to this version (0-100)

        Returns:
            The activated PromptVersion

        Raises:
            ValueError: If version not found
        """
        version = await self.db.get(PromptVersion, version_id)
        if not version:
            raise ValueError(f"Version {version_id} not found")

        if traffic_percentage == 100:
            # Deactivate all other versions for this key
            await self.db.execute(
                update(PromptVersion)
                .where(
                    PromptVersion.prompt_key == version.prompt_key,
                    PromptVersion.id != version_id,
                )
                .values(is_active=False, traffic_percentage=0, is_default=False)
            )
            version.is_default = True
            logger.info(
                f"Activated prompt version {version.version} for key {version.prompt_key} "
                f"as sole active version"
            )
        else:
            logger.info(
                f"Activated prompt version {version.version} for key {version.prompt_key} "
                f"with {traffic_percentage}% traffic"
            )

        version.is_active = True
        version.traffic_percentage = traffic_percentage
        version.approved_by = approved_by
        version.approved_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(version)

        return version

    async def deactivate_version(
        self,
        version_id: int,
    ) -> PromptVersion:
        """
        Deactivate a prompt version.

        Args:
            version_id: ID of the version to deactivate

        Returns:
            The deactivated PromptVersion

        Raises:
            ValueError: If version not found
        """
        version = await self.db.get(PromptVersion, version_id)
        if not version:
            raise ValueError(f"Version {version_id} not found")

        version.is_active = False
        version.traffic_percentage = 0
        version.retired_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(version)

        logger.info(
            f"Deactivated prompt version {version.version} for key {version.prompt_key}"
        )

        return version

    async def update_metrics(
        self,
        version_id: int,
        success: bool,
        quality_score: Optional[float] = None,
        latency_ms: Optional[float] = None,
    ) -> None:
        """
        Update version performance metrics.

        Uses running averages to track success rate, quality scores,
        and response latency.

        Args:
            version_id: ID of the version to update
            success: Whether the operation was successful
            quality_score: Optional quality rating (0-1)
            latency_ms: Optional response latency in milliseconds
        """
        version = await self.db.get(PromptVersion, version_id)
        if not version:
            logger.warning(f"Cannot update metrics: version {version_id} not found")
            return

        version.sample_count += 1

        if not success:
            version.error_count += 1

        # Update success rate using running average
        if version.success_rate is None:
            version.success_rate = 1.0 if success else 0.0
        else:
            version.success_rate = (
                version.success_rate * (version.sample_count - 1) + (1.0 if success else 0.0)
            ) / version.sample_count

        # Update quality score using running average
        if quality_score is not None:
            if version.avg_quality_score is None:
                version.avg_quality_score = quality_score
            else:
                version.avg_quality_score = (
                    version.avg_quality_score * (version.sample_count - 1) + quality_score
                ) / version.sample_count

        # Update latency using running average
        if latency_ms is not None:
            if version.avg_latency_ms is None:
                version.avg_latency_ms = latency_ms
            else:
                version.avg_latency_ms = (
                    version.avg_latency_ms * (version.sample_count - 1) + latency_ms
                ) / version.sample_count

        await self.db.commit()

    async def get_version(self, version_id: int) -> Optional[PromptVersion]:
        """
        Get a specific prompt version by ID.

        Args:
            version_id: ID of the version to retrieve

        Returns:
            The PromptVersion or None if not found
        """
        return await self.db.get(PromptVersion, version_id)

    async def get_versions(
        self,
        prompt_key: str,
        include_inactive: bool = True,
    ) -> list[PromptVersion]:
        """
        Get all versions of a prompt.

        Args:
            prompt_key: The prompt identifier
            include_inactive: Whether to include inactive versions

        Returns:
            List of PromptVersion objects ordered by version descending
        """
        query = select(PromptVersion).where(PromptVersion.prompt_key == prompt_key)

        if not include_inactive:
            query = query.where(PromptVersion.is_active == True)

        query = query.order_by(PromptVersion.version.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_all_prompt_keys(self) -> list[str]:
        """
        Get all unique prompt keys.

        Returns:
            List of unique prompt key strings
        """
        result = await self.db.execute(
            select(PromptVersion.prompt_key).distinct()
        )
        return [r[0] for r in result.all()]

    async def compare_versions(
        self,
        version_id_a: int,
        version_id_b: int,
    ) -> dict:
        """
        Compare performance metrics between two versions.

        Args:
            version_id_a: ID of first version
            version_id_b: ID of second version

        Returns:
            Dict with comparison metrics
        """
        version_a = await self.db.get(PromptVersion, version_id_a)
        version_b = await self.db.get(PromptVersion, version_id_b)

        if not version_a or not version_b:
            raise ValueError("One or both versions not found")

        return {
            "version_a": {
                "id": version_a.id,
                "version": version_a.version,
                "success_rate": version_a.success_rate,
                "avg_quality_score": version_a.avg_quality_score,
                "avg_latency_ms": version_a.avg_latency_ms,
                "sample_count": version_a.sample_count,
                "error_count": version_a.error_count,
            },
            "version_b": {
                "id": version_b.id,
                "version": version_b.version,
                "success_rate": version_b.success_rate,
                "avg_quality_score": version_b.avg_quality_score,
                "avg_latency_ms": version_b.avg_latency_ms,
                "sample_count": version_b.sample_count,
                "error_count": version_b.error_count,
            },
            "comparison": {
                "success_rate_diff": (
                    (version_a.success_rate or 0) - (version_b.success_rate or 0)
                ),
                "quality_score_diff": (
                    (version_a.avg_quality_score or 0) - (version_b.avg_quality_score or 0)
                ),
                "latency_diff": (
                    (version_a.avg_latency_ms or 0) - (version_b.avg_latency_ms or 0)
                ),
            },
        }
