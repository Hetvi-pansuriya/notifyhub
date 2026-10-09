"""Add reliability and visibility indexes to deliveries table

Revision ID: 002_reliability_indexes
Revises: 001_initial_schema
Create Date: 2026-10-08 10:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '002_reliability_indexes'
down_revision: Union[str, None] = '001_initial_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Index for client-scoped status filtering
    op.create_index(
        'ix_deliveries_client_id_status',
        'deliveries',
        ['client_id', 'status'],
        unique=False,
    )
    # Index for client-scoped chronological ordering
    op.create_index(
        'ix_deliveries_client_id_created_at',
        'deliveries',
        ['client_id', sa.text('created_at DESC')],
        unique=False,
    )
    # Partial index for reaper lock timeout recovery
    op.create_index(
        'ix_deliveries_reaper',
        'deliveries',
        ['locked_until'],
        unique=False,
        postgresql_where=sa.text("status = 'processing'"),
    )


def downgrade() -> None:
    op.drop_index('ix_deliveries_reaper', table_name='deliveries')
    op.drop_index('ix_deliveries_client_id_created_at', table_name='deliveries')
    op.drop_index('ix_deliveries_client_id_status', table_name='deliveries')
