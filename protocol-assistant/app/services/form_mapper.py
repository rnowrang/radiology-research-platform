"""IRB Form Mapper service for Protocol Assistant.

This module provides functionality to:
- Map extracted protocol data to IRB form fields
- Pre-fill existing forms with protocol data
- Fetch form templates from the forms service
- Handle nested field mappings
"""

import logging
from typing import Any, Optional

import httpx

from app.config import get_settings
from app.schemas.protocol import ExtractedProtocol

logger = logging.getLogger(__name__)


class IRBFormMapper:
    """
    Maps extracted protocol data to IRB form fields.

    Provides bidirectional mapping between the structured protocol data
    extracted by the Protocol Assistant and the field structure used
    by IRB forms in the forms-service.
    """

    # Field mappings from ExtractedProtocol paths to form field IDs
    # Format: "protocol_path" -> "form_field_id"
    FIELD_MAPPING = {
        # Study identification
        "study_title": "investigator.study_title",
        "principal_investigator": "investigator.pi_name",
        "study_type": "study_design.type",
        # Objectives
        "objectives.primary": "objectives.primary_objective",
        "objectives.secondary": "objectives.secondary_objectives",
        # Methodology
        "methodology.design": "methodology.study_design",
        "methodology.population": "methodology.study_population",
        "methodology.sample_size": "methodology.sample_size",
        "methodology.inclusion_criteria": "methodology.inclusion_criteria",
        "methodology.exclusion_criteria": "methodology.exclusion_criteria",
        # Data collection
        "data_collection.sources": "data_collection.data_sources",
        "data_collection.variables": "data_collection.variables",
        "data_collection.timeline": "data_collection.timeline",
        # Risks and benefits
        "risks_benefits.risks": "risks.potential_risks",
        "risks_benefits.benefits": "risks.potential_benefits",
        "risks_benefits.mitigation": "risks.mitigation_strategies",
        # Confidentiality
        "confidentiality_measures": "data_security.confidentiality_measures",
    }

    # Alternative field name mappings for different form templates
    # Some templates use different field IDs
    ALTERNATIVE_MAPPINGS = {
        "investigator.study_title": ["study_info.title", "protocol.title", "title"],
        "investigator.pi_name": ["study_info.pi", "protocol.investigator", "pi_name"],
        "methodology.study_design": ["study_info.design", "design.type"],
        "methodology.study_population": ["population.description", "subjects.population"],
        "methodology.sample_size": ["population.size", "subjects.sample_size"],
        "objectives.primary_objective": ["study_info.objective", "aims.primary"],
        "objectives.secondary_objectives": ["aims.secondary", "secondary_objectives"],
    }

    def __init__(self):
        """Initialize the form mapper with settings."""
        self.settings = get_settings()
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client for forms service communication."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.settings.FORMS_SERVICE_URL,
                timeout=30.0,
                headers={
                    "X-Internal-API-Key": self.settings.INTERNAL_API_KEY,
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    def _get_nested_value(self, obj: Any, path: str) -> Any:
        """
        Get a nested value from an object using dot notation.

        Args:
            obj: Object to extract value from (dict, Pydantic model, or object)
            path: Dot-separated path (e.g., "objectives.primary")

        Returns:
            The value at the path, or None if not found
        """
        if obj is None:
            return None

        parts = path.split(".")
        current = obj

        for part in parts:
            if current is None:
                return None

            if hasattr(current, part):
                current = getattr(current, part)
            elif isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return None

        return current

    def _set_nested_value(self, data: dict, path: str, value: Any) -> None:
        """
        Set a nested value in a dictionary using dot notation.

        Args:
            data: Dictionary to set value in
            path: Dot-separated path (e.g., "investigator.pi_name")
            value: Value to set
        """
        parts = path.split(".")
        current = data

        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]

        current[parts[-1]] = value

    def _format_value(self, value: Any) -> Any:
        """
        Format a value for form field compatibility.

        Handles lists, enums, and other special types.
        """
        if value is None:
            return None

        # Handle enums
        if hasattr(value, "value"):
            return value.value

        # Handle lists - join as newline-separated for text fields
        if isinstance(value, list):
            if all(isinstance(item, str) for item in value):
                # Check if this looks like criteria - keep as list
                if len(value) > 1:
                    return value  # Return as list for multi-value fields
                return "\n".join(value)
            return value

        return value

    async def map_to_form_data(
        self,
        protocol: ExtractedProtocol,
        template_schema: Optional[dict] = None,
    ) -> dict:
        """
        Convert extracted protocol to form field data.

        Args:
            protocol: Extracted protocol data
            template_schema: Optional template schema to validate against

        Returns:
            Dictionary of form field data with dot-notation keys
        """
        form_data = {}
        mapped_fields = []

        for protocol_path, form_field in self.FIELD_MAPPING.items():
            value = self._get_nested_value(protocol, protocol_path)

            if value is not None:
                formatted_value = self._format_value(value)
                if formatted_value is not None:
                    self._set_nested_value(form_data, form_field, formatted_value)
                    mapped_fields.append(form_field)

        logger.info(f"Mapped {len(mapped_fields)} fields from protocol to form data")
        return form_data

    async def get_form_template_schema(self, template_id: int) -> dict:
        """
        Fetch form template schema from forms service.

        Args:
            template_id: ID of the template to fetch

        Returns:
            Template schema dictionary

        Raises:
            httpx.HTTPError: If the request fails
        """
        client = await self._get_client()

        try:
            response = await client.get(f"/api/templates/{template_id}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to fetch template {template_id}: {e}")
            raise
        except httpx.RequestError as e:
            logger.error(f"Request error fetching template {template_id}: {e}")
            raise

    async def get_form(self, form_id: int) -> dict:
        """
        Fetch form details from forms service.

        Args:
            form_id: ID of the form to fetch

        Returns:
            Form details dictionary

        Raises:
            httpx.HTTPError: If the request fails
        """
        client = await self._get_client()

        try:
            response = await client.get(f"/api/forms/{form_id}")
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to fetch form {form_id}: {e}")
            raise
        except httpx.RequestError as e:
            logger.error(f"Request error fetching form {form_id}: {e}")
            raise

    async def prefill_form(
        self,
        form_id: int,
        protocol: ExtractedProtocol,
        user_id: str,
    ) -> dict:
        """
        Pre-fill an existing form with extracted protocol data.

        Args:
            form_id: ID of the form to pre-fill
            protocol: Extracted protocol data
            user_id: ID of the user making the update

        Returns:
            Dictionary with updated_fields, skipped_fields, and message

        Raises:
            httpx.HTTPError: If the request fails
        """
        client = await self._get_client()

        # Get current form to understand its structure
        try:
            form_response = await client.get(f"/api/forms/{form_id}")
            form_response.raise_for_status()
            current_form = form_response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to fetch form {form_id} for pre-fill: {e}")
            raise

        # Check if form is editable
        if current_form.get("status") not in ["draft", "needs_changes"]:
            raise ValueError(
                f"Form is not editable. Current status: {current_form.get('status')}"
            )

        # Map protocol to form data
        template_schema = current_form.get("template", {}).get("schema")
        form_data = await self.map_to_form_data(protocol, template_schema)

        if not form_data:
            return {
                "updated_fields": [],
                "skipped_fields": [],
                "message": "No fields could be mapped from protocol data",
            }

        # Prepare field changes for the API
        current_data = current_form.get("data", {})
        changes = []
        updated_fields = []
        skipped_fields = []

        for field_path, new_value in self._flatten_dict(form_data).items():
            old_value = self._get_nested_value(current_data, field_path)

            # Skip if values are the same
            if old_value == new_value:
                skipped_fields.append(field_path)
                continue

            changes.append({
                "field_id": field_path,
                "field_label": field_path.replace(".", " > ").title(),
                "old_value": old_value,
                "new_value": new_value,
            })
            updated_fields.append(field_path)

        if not changes:
            return {
                "updated_fields": [],
                "skipped_fields": list(self._flatten_dict(form_data).keys()),
                "message": "No changes needed - all fields already match protocol data",
            }

        # Send update to forms service
        try:
            update_response = await client.post(
                f"/api/forms/{form_id}/data",
                json={
                    "changes": changes,
                    "user_id": user_id,
                    "version": current_form.get("version", 1),
                },
            )
            update_response.raise_for_status()

            logger.info(
                f"Successfully pre-filled form {form_id} with {len(updated_fields)} fields"
            )

            return {
                "updated_fields": updated_fields,
                "skipped_fields": skipped_fields,
                "message": f"Successfully updated {len(updated_fields)} fields from protocol data",
            }

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 409:
                # Version conflict
                logger.warning(f"Version conflict when pre-filling form {form_id}")
                raise ValueError(
                    "Form was modified by another user. Please refresh and try again."
                )
            raise

    def _flatten_dict(self, d: dict, parent_key: str = "") -> dict:
        """
        Flatten a nested dictionary with dot notation keys.

        Args:
            d: Dictionary to flatten
            parent_key: Parent key prefix

        Returns:
            Flattened dictionary
        """
        items = []
        for k, v in d.items():
            new_key = f"{parent_key}.{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key).items())
            else:
                items.append((new_key, v))
        return dict(items)

    async def create_prefilled_form(
        self,
        template_id: int,
        protocol: ExtractedProtocol,
        user_id: str,
        project_id: str,
        title: Optional[str] = None,
    ) -> dict:
        """
        Create a new form pre-filled with protocol data.

        Args:
            template_id: ID of the template to use
            protocol: Extracted protocol data
            user_id: ID of the user creating the form
            project_id: ID of the project
            title: Optional title for the form

        Returns:
            Created form details

        Raises:
            httpx.HTTPError: If the request fails
        """
        client = await self._get_client()

        # Use protocol title if not provided
        form_title = title or protocol.study_title or "Untitled IRB Form"

        # Create the form
        try:
            create_response = await client.post(
                "/api/forms",
                json={
                    "template_id": template_id,
                    "owner_id": user_id,
                    "project_id": project_id,
                    "title": form_title,
                },
            )
            create_response.raise_for_status()
            created_form = create_response.json()
            form_id = created_form["id"]

            # Pre-fill the form
            prefill_result = await self.prefill_form(form_id, protocol, user_id)

            return {
                "form_id": form_id,
                "title": form_title,
                "status": "draft",
                "updated_fields": prefill_result["updated_fields"],
                "message": f"Created and pre-filled form with {len(prefill_result['updated_fields'])} fields",
            }

        except httpx.HTTPStatusError as e:
            logger.error(f"Failed to create pre-filled form: {e}")
            raise

    def get_unmapped_fields(self, template_schema: dict) -> list[str]:
        """
        Get list of form fields that don't have protocol mappings.

        Args:
            template_schema: Template schema from forms service

        Returns:
            List of field IDs without mappings
        """
        mapped_form_fields = set(self.FIELD_MAPPING.values())

        # Add alternative mappings
        for alternatives in self.ALTERNATIVE_MAPPINGS.values():
            mapped_form_fields.update(alternatives)

        # Extract all field IDs from template
        all_fields = self._extract_field_ids(template_schema)

        return [f for f in all_fields if f not in mapped_form_fields]

    def _extract_field_ids(self, schema: dict) -> list[str]:
        """
        Extract all field IDs from a template schema.

        Args:
            schema: Template schema

        Returns:
            List of field IDs
        """
        field_ids = []

        sections = schema.get("sections", [])
        for section in sections:
            fields = section.get("fields", [])
            for field in fields:
                field_id = field.get("id")
                if field_id:
                    field_ids.append(field_id)

        # Also check flat fields list
        fields = schema.get("fields", [])
        for field in fields:
            field_id = field.get("id")
            if field_id:
                field_ids.append(field_id)

        return field_ids


# Module-level instance for convenience
_mapper: Optional[IRBFormMapper] = None


def get_form_mapper() -> IRBFormMapper:
    """Get the global form mapper instance."""
    global _mapper
    if _mapper is None:
        _mapper = IRBFormMapper()
    return _mapper
