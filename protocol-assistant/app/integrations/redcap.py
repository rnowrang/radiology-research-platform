"""REDCap integration for research data capture and form management."""

import logging
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field

from app.integrations.base import AuthResult, IntegrationProvider, SyncResult

logger = logging.getLogger(__name__)


class REDCapField(BaseModel):
    """Represents a field in a REDCap form."""

    field_name: str
    field_label: str
    field_type: str
    required: bool = False
    choices: Optional[dict[str, str]] = None
    validation: Optional[str] = None
    validation_min: Optional[str] = None
    validation_max: Optional[str] = None
    branching_logic: Optional[str] = None
    field_note: Optional[str] = None
    text_validation_type: Optional[str] = None
    identifier: bool = False
    section_header: Optional[str] = None
    matrix_group_name: Optional[str] = None


class REDCapForm(BaseModel):
    """Represents a REDCap instrument/form."""

    form_name: str
    form_label: Optional[str] = None
    fields: list[REDCapField] = Field(default_factory=list)
    repeating: bool = False


class REDCapProject(BaseModel):
    """REDCap project metadata."""

    project_id: int
    project_title: str
    creation_time: Optional[str] = None
    production_time: Optional[str] = None
    in_production: bool = False
    purpose: Optional[int] = None
    purpose_other: Optional[str] = None
    surveys_enabled: bool = False
    is_longitudinal: bool = False
    has_repeating_instruments: bool = False
    record_autonumbering_enabled: bool = False


class FieldMapping(BaseModel):
    """Mapping between REDCap and IRB form fields."""

    redcap_field: str
    irb_field: str
    confidence: float
    mapping_type: str = "direct"  # direct, transform, computed
    transformation: Optional[str] = None
    notes: Optional[str] = None


class REDCapRecord(BaseModel):
    """Represents a REDCap record."""

    record_id: str
    data: dict[str, Any] = Field(default_factory=dict)
    redcap_repeat_instrument: Optional[str] = None
    redcap_repeat_instance: Optional[int] = None


class REDCapIntegration(IntegrationProvider):
    """
    REDCap integration for research data capture.

    Provides access to:
    - Project metadata and configuration
    - Form/instrument definitions
    - Data dictionary export
    - Record import/export
    - Field mapping for IRB form integration
    """

    name = "redcap"

    def __init__(self, api_url: str = None, api_token: str = None):
        """
        Initialize REDCap integration.

        Args:
            api_url: REDCap API endpoint URL
            api_token: Project-specific API token
        """
        self.api_url = api_url
        self.api_token = api_token

    async def _make_request(
        self,
        content: str,
        extra_data: dict = None,
        timeout: float = 30.0,
    ) -> Any:
        """
        Make a request to the REDCap API.

        Args:
            content: The content type for the request
            extra_data: Additional request parameters
            timeout: Request timeout in seconds

        Returns:
            Parsed JSON response
        """
        data = {
            "token": self.api_token,
            "content": content,
            "format": "json",
            "returnFormat": "json",
        }
        if extra_data:
            data.update(extra_data)

        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(self.api_url, data=data)
            response.raise_for_status()
            return response.json()

    async def authenticate(self, credentials: dict) -> AuthResult:
        """
        Verify REDCap API token by fetching project info.

        Args:
            credentials: Dict containing 'api_url' and 'api_token'

        Returns:
            AuthResult with project information if successful
        """
        api_url = credentials.get("api_url")
        api_token = credentials.get("api_token")

        if not api_url or not api_token:
            return AuthResult(
                success=False, error="API URL and token are required"
            )

        self.api_url = api_url
        self.api_token = api_token

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    api_url,
                    data={
                        "token": api_token,
                        "content": "project",
                        "format": "json",
                    },
                )

                if response.status_code == 200:
                    data = response.json()
                    return AuthResult(
                        success=True,
                        access_token=api_token,
                        metadata={
                            "project_id": data.get("project_id"),
                            "project_title": data.get("project_title"),
                            "in_production": data.get("in_production") == 1,
                        },
                    )
                elif response.status_code == 403:
                    return AuthResult(success=False, error="Invalid API token")
                else:
                    return AuthResult(
                        success=False,
                        error=f"Authentication failed: {response.status_code}",
                    )
        except httpx.TimeoutException:
            return AuthResult(success=False, error="Connection timeout")
        except Exception as e:
            logger.exception("REDCap authentication error")
            return AuthResult(success=False, error=str(e))

    async def refresh_token(self, refresh_token: str) -> AuthResult:
        """
        REDCap uses API tokens which don't expire, so no refresh needed.

        Args:
            refresh_token: The API token (same as access token)

        Returns:
            AuthResult with the same token
        """
        return AuthResult(success=True, access_token=refresh_token)

    async def test_connection(self, access_token: str) -> bool:
        """
        Test if the API token is valid.

        Args:
            access_token: The REDCap API token

        Returns:
            True if the token is valid
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    self.api_url,
                    data={
                        "token": access_token,
                        "content": "version",
                    },
                )
                return response.status_code == 200
        except Exception:
            return False

    async def get_project_metadata(self) -> REDCapProject:
        """
        Get REDCap project metadata.

        Returns:
            REDCapProject with project information
        """
        data = await self._make_request("project")

        return REDCapProject(
            project_id=data.get("project_id", 0),
            project_title=data.get("project_title", ""),
            creation_time=data.get("creation_time"),
            production_time=data.get("production_time"),
            in_production=data.get("in_production") == 1,
            purpose=data.get("purpose"),
            purpose_other=data.get("purpose_other"),
            surveys_enabled=data.get("surveys_enabled") == 1,
            is_longitudinal=data.get("is_longitudinal") == 1,
            has_repeating_instruments=data.get("has_repeating_instruments_or_events")
            == 1,
            record_autonumbering_enabled=data.get("record_autonumbering_enabled") == 1,
        )

    async def get_data_dictionary(self) -> list[dict]:
        """
        Get the complete REDCap data dictionary.

        Returns:
            List of field definitions
        """
        return await self._make_request("metadata")

    async def get_forms(self) -> list[str]:
        """
        Get list of all forms/instruments in the project.

        Returns:
            List of form names
        """
        data_dict = await self.get_data_dictionary()
        forms = set()
        for field in data_dict:
            form_name = field.get("form_name")
            if form_name:
                forms.add(form_name)
        return sorted(list(forms))

    async def get_instrument_labels(self) -> dict[str, str]:
        """
        Get form names with their display labels.

        Returns:
            Dict mapping form_name to form_label
        """
        instruments = await self._make_request("instrument")
        return {i.get("instrument_name"): i.get("instrument_label") for i in instruments}

    async def export_form_structure(self, form_name: str) -> REDCapForm:
        """
        Export detailed form structure for mapping.

        Args:
            form_name: Name of the form to export

        Returns:
            REDCapForm with all fields
        """
        data_dict = await self.get_data_dictionary()
        labels = await self.get_instrument_labels()

        form_fields = []
        for field in data_dict:
            if field.get("form_name") != form_name:
                continue

            form_fields.append(
                REDCapField(
                    field_name=field.get("field_name", ""),
                    field_label=field.get("field_label", ""),
                    field_type=field.get("field_type", "text"),
                    required=field.get("required_field") == "y",
                    choices=self._parse_choices(
                        field.get("select_choices_or_calculations")
                    ),
                    validation=field.get("text_validation_type_or_show_slider_number"),
                    validation_min=field.get("text_validation_min"),
                    validation_max=field.get("text_validation_max"),
                    branching_logic=field.get("branching_logic"),
                    field_note=field.get("field_note"),
                    text_validation_type=field.get("text_validation_type_or_show_slider_number"),
                    identifier=field.get("identifier") == "y",
                    section_header=field.get("section_header"),
                    matrix_group_name=field.get("matrix_group_name"),
                )
            )

        return REDCapForm(
            form_name=form_name,
            form_label=labels.get(form_name),
            fields=form_fields,
        )

    async def export_all_forms(self) -> list[REDCapForm]:
        """
        Export structure for all forms in the project.

        Returns:
            List of REDCapForm objects
        """
        form_names = await self.get_forms()
        forms = []
        for form_name in form_names:
            form = await self.export_form_structure(form_name)
            forms.append(form)
        return forms

    async def export_records(
        self,
        record_ids: list[str] = None,
        forms: list[str] = None,
        fields: list[str] = None,
        filter_logic: str = None,
    ) -> list[REDCapRecord]:
        """
        Export records from REDCap.

        Args:
            record_ids: Specific records to export (None for all)
            forms: Specific forms to include
            fields: Specific fields to include
            filter_logic: REDCap filter logic expression

        Returns:
            List of REDCapRecord objects
        """
        extra_data = {"type": "flat"}

        if record_ids:
            extra_data["records"] = ",".join(record_ids)
        if forms:
            extra_data["forms"] = ",".join(forms)
        if fields:
            extra_data["fields"] = ",".join(fields)
        if filter_logic:
            extra_data["filterLogic"] = filter_logic

        data = await self._make_request("record", extra_data, timeout=120.0)

        records = []
        for item in data:
            record_id = item.pop("record_id", item.pop("study_id", ""))
            repeat_instrument = item.pop("redcap_repeat_instrument", None)
            repeat_instance = item.pop("redcap_repeat_instance", None)

            records.append(
                REDCapRecord(
                    record_id=str(record_id),
                    data=item,
                    redcap_repeat_instrument=repeat_instrument,
                    redcap_repeat_instance=int(repeat_instance)
                    if repeat_instance
                    else None,
                )
            )

        return records

    async def import_records(
        self,
        records: list[dict],
        overwrite: str = "normal",
        return_content: str = "count",
    ) -> dict:
        """
        Import records into REDCap.

        Args:
            records: List of record data dictionaries
            overwrite: Overwrite behavior (normal, overwrite)
            return_content: What to return (count, ids, auto_ids)

        Returns:
            Import result with count or IDs
        """
        import json

        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                self.api_url,
                data={
                    "token": self.api_token,
                    "content": "record",
                    "format": "json",
                    "type": "flat",
                    "overwriteBehavior": overwrite,
                    "returnContent": return_content,
                    "returnFormat": "json",
                    "data": json.dumps(records),
                },
            )
            response.raise_for_status()
            return response.json()

    async def get_field_for_irb_mapping(self, irb_field_type: str) -> list[FieldMapping]:
        """
        Suggest REDCap field mappings for IRB form fields.

        Args:
            irb_field_type: Type of IRB field to map

        Returns:
            List of potential FieldMapping suggestions
        """
        data_dict = await self.get_data_dictionary()
        mappings = []

        # Define common IRB field patterns
        irb_patterns = {
            "study_title": ["title", "study_title", "project_title", "protocol_title"],
            "pi_name": ["pi_name", "principal_investigator", "pi", "investigator"],
            "sponsor": ["sponsor", "funding", "funder", "funding_source"],
            "start_date": ["start_date", "study_start", "begin_date"],
            "end_date": ["end_date", "study_end", "completion_date"],
            "sample_size": ["sample_size", "n_participants", "enrollment", "target_n"],
            "study_description": ["description", "abstract", "summary", "study_summary"],
        }

        patterns = irb_patterns.get(irb_field_type, [irb_field_type])

        for field in data_dict:
            field_name = field.get("field_name", "").lower()
            field_label = field.get("field_label", "").lower()

            for pattern in patterns:
                pattern_lower = pattern.lower()
                if pattern_lower in field_name or pattern_lower in field_label:
                    confidence = 0.9 if pattern_lower in field_name else 0.7
                    mappings.append(
                        FieldMapping(
                            redcap_field=field.get("field_name"),
                            irb_field=irb_field_type,
                            confidence=confidence,
                            mapping_type="direct",
                            notes=f"Matched pattern: {pattern}",
                        )
                    )
                    break

        # Sort by confidence
        mappings.sort(key=lambda m: m.confidence, reverse=True)
        return mappings[:5]  # Return top 5 suggestions

    async def sync_to_irb_form(
        self,
        record_id: str,
        field_mappings: list[FieldMapping],
    ) -> dict:
        """
        Sync a REDCap record to IRB form format.

        Args:
            record_id: REDCap record ID
            field_mappings: List of field mappings to apply

        Returns:
            Dict with mapped IRB form data
        """
        # Get the record
        records = await self.export_records(record_ids=[record_id])
        if not records:
            return {}

        record_data = records[0].data
        irb_data = {}

        for mapping in field_mappings:
            redcap_value = record_data.get(mapping.redcap_field)
            if redcap_value is not None:
                if mapping.mapping_type == "direct":
                    irb_data[mapping.irb_field] = redcap_value
                elif mapping.mapping_type == "transform" and mapping.transformation:
                    # Apply transformation (simplified - would need proper implementation)
                    irb_data[mapping.irb_field] = redcap_value

        return irb_data

    def _parse_choices(self, choices_str: str) -> Optional[dict[str, str]]:
        """
        Parse REDCap choice string into a dictionary.

        Args:
            choices_str: Pipe-separated choice string (e.g., "1, Yes | 2, No")

        Returns:
            Dict mapping codes to labels
        """
        if not choices_str:
            return None

        choices = {}
        for item in choices_str.split("|"):
            parts = item.strip().split(",", 1)
            if len(parts) == 2:
                code = parts[0].strip()
                label = parts[1].strip()
                choices[code] = label

        return choices if choices else None
