"""Add delivery_attachments table

Revision ID: 006_delivery_attachments
Revises: 005_plans_audit_status_schema
Create Date: 2026-10-09 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '006_delivery_attachments'
down_revision: Union[str, None] = '005_plans_audit_status_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'delivery_attachments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('delivery_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('deliveries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(length=255), nullable=False),
        sa.Column('content_type', sa.String(length=100), nullable=False),
        sa.Column('size_bytes', sa.Integer(), nullable=False),
        sa.Column('content', sa.LargeBinary(), nullable=True),
        sa.Column('content_removed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_delivery_attachments_delivery_id', 'delivery_attachments', ['delivery_id'])


def downgrade() -> None:
    op.drop_index('ix_delivery_attachments_delivery_id', table_name='delivery_attachments')
    op.drop_table('delivery_attachments')
