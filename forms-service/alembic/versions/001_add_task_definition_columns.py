"""Add template_id and file_category columns to task_definitions

Revision ID: 001_add_task_definition_columns
Revises:
Create Date: 2026-01-15

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_add_task_definition_columns'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add template_id and file_category columns to task_definitions table."""
    # Add template_id column with foreign key to templates table
    op.add_column(
        'task_definitions',
        sa.Column('template_id', sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        'fk_task_definitions_template_id',
        'task_definitions',
        'templates',
        ['template_id'],
        ['id']
    )

    # Add file_category column for document_upload tasks
    op.add_column(
        'task_definitions',
        sa.Column('file_category', sa.String(50), nullable=True)
    )


def downgrade() -> None:
    """Remove template_id and file_category columns from task_definitions table."""
    # Remove file_category column
    op.drop_column('task_definitions', 'file_category')

    # Remove foreign key constraint and template_id column
    op.drop_constraint('fk_task_definitions_template_id', 'task_definitions', type_='foreignkey')
    op.drop_column('task_definitions', 'template_id')
