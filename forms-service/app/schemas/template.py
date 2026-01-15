"""Pydantic schemas for templates."""

from pydantic import BaseModel
from typing import Optional, Any, Dict, List
from datetime import datetime


class TemplateSchemaField(BaseModel):
    """Schema for a template field definition."""
    id: str
    type: str
    label: str
    section_id: str
    required: Optional[bool] = False
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    default_value: Optional[Any] = None
    options: Optional[List[Dict[str, str]]] = None
    validation: Optional[Dict[str, Any]] = None
    anchor: Optional[Dict[str, Any]] = None
    repeatable_config: Optional[Dict[str, Any]] = None
    order: Optional[int] = None
    indent: Optional[int] = None
    group_start: Optional[str] = None
    group_end: Optional[bool] = None
    table_group: Optional[str] = None
    table_row: Optional[int] = None
    table_col: Optional[int] = None
    table_config: Optional[Dict[str, Any]] = None
    column_group: Optional[str] = None
    column_index: Optional[int] = None


class TemplateSchemaSection(BaseModel):
    """Schema for a template section definition."""
    id: str
    title: str
    description: Optional[str] = None
    order: int
    collapsible: Optional[bool] = False
    collapsed_by_default: Optional[bool] = False


class TemplateSchemaRule(BaseModel):
    """Schema for a template conditional rule."""
    id: str
    conditions: List[Dict[str, Any]]
    then_actions: List[Dict[str, Any]]
    else_actions: Optional[List[Dict[str, Any]]] = None


class TemplateSchema(BaseModel):
    """Complete template schema."""
    sections: List[TemplateSchemaSection] = []
    fields: List[TemplateSchemaField] = []
    rules: List[TemplateSchemaRule] = []


class TemplateCreate(BaseModel):
    """Schema for creating a template."""
    name: str
    description: Optional[str] = None
    version: str = "1.0"
    schema: TemplateSchema = TemplateSchema()


class TemplateUpdate(BaseModel):
    """Schema for updating a template."""
    name: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    schema: Optional[TemplateSchema] = None
    is_active: Optional[bool] = None
    is_published: Optional[bool] = None


class TemplateResponse(BaseModel):
    """Schema for template response."""
    id: int
    name: str
    description: Optional[str]
    version: str
    original_file_name: Optional[str]
    schema: Dict[str, Any]
    is_active: bool
    is_published: bool
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True
