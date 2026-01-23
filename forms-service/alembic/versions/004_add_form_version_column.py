"""Add version column to form_data table for optimistic locking

Revision ID: 004_add_form_version_column
Revises: 003_add_section_id_to_field_changes
Create Date: 2026-01-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004_add_form_version_column'
down_revision: Union[str, None] = '003_add_section_id_to_field_changes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add version column to form_data table for optimistic locking."""
    op.add_column('form_data', sa.Column('version', sa.Integer(), nullable=False, server_default='1'))


def downgrade() -> None:
    """Remove version column from form_data table."""
    op.drop_column('form_data', 'version')
