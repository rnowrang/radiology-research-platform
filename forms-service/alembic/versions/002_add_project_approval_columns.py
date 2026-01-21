"""Add project approval workflow columns

Revision ID: 002_add_project_approval_columns
Revises: 001_add_task_definition_columns
Create Date: 2026-01-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '002_add_project_approval_columns'
down_revision: Union[str, None] = '001_add_task_definition_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add project approval workflow columns to projects table."""
    # Add submitted_for_approval_at column
    op.add_column(
        'projects',
        sa.Column('submitted_for_approval_at', sa.DateTime(timezone=True), nullable=True)
    )

    # Add approved_at column
    op.add_column(
        'projects',
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True)
    )

    # Add approved_by_id column (UUID for admin user who approved)
    op.add_column(
        'projects',
        sa.Column('approved_by_id', postgresql.UUID(as_uuid=True), nullable=True)
    )

    # Add rejected_at column
    op.add_column(
        'projects',
        sa.Column('rejected_at', sa.DateTime(timezone=True), nullable=True)
    )

    # Add rejected_by_id column (UUID for admin user who rejected)
    op.add_column(
        'projects',
        sa.Column('rejected_by_id', postgresql.UUID(as_uuid=True), nullable=True)
    )

    # Add rejection_notes column
    op.add_column(
        'projects',
        sa.Column('rejection_notes', sa.Text(), nullable=True)
    )


def downgrade() -> None:
    """Remove project approval workflow columns from projects table."""
    op.drop_column('projects', 'rejection_notes')
    op.drop_column('projects', 'rejected_by_id')
    op.drop_column('projects', 'rejected_at')
    op.drop_column('projects', 'approved_by_id')
    op.drop_column('projects', 'approved_at')
    op.drop_column('projects', 'submitted_for_approval_at')
