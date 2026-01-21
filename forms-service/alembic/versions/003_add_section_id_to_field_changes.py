"""Add section_id to field_changes table

Revision ID: 003_add_section_id_to_field_changes
Revises: 002_add_project_approval_columns
Create Date: 2026-01-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003_add_section_id_to_field_changes'
down_revision: Union[str, None] = '002_add_project_approval_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add section_id column to field_changes table."""
    op.add_column('field_changes', sa.Column('section_id', sa.String(100), nullable=True))
    op.create_index('idx_field_changes_section', 'field_changes', ['form_instance_id', 'section_id'])


def downgrade() -> None:
    """Remove section_id column from field_changes table."""
    op.drop_index('idx_field_changes_section', table_name='field_changes')
    op.drop_column('field_changes', 'section_id')
