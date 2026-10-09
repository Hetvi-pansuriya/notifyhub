"""Add sendgrid sending identity, scheduled send_at, provider fields, and daily limits

Revision ID: 004_sendgrid_and_scheduling
Revises: 003_auth_and_api_keys
Create Date: 2026-10-08 23:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '004_sendgrid_and_scheduling'
down_revision: Union[str, None] = '003_auth_and_api_keys'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update clients table
    # Add from_name, backfill with name
    op.add_column('clients', sa.Column('from_name', sa.Text(), nullable=True, server_default=''))
    op.execute("UPDATE clients SET from_name = name WHERE from_name IS NULL OR from_name = ''")

    op.add_column('clients', sa.Column('reply_to_email', sa.String(length=255), nullable=True))
    op.add_column('clients', sa.Column('daily_email_limit', sa.Integer(), server_default='30', nullable=False))

    # 2. Update notification_events table
    op.add_column('notification_events', sa.Column('send_at', sa.DateTime(timezone=True), nullable=True))

    # 3. Update deliveries table
    op.add_column('deliveries', sa.Column('provider', sa.String(length=50), nullable=True))
    op.add_column('deliveries', sa.Column('provider_message_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    # 3. Revert deliveries
    op.drop_column('deliveries', 'provider_message_id')
    op.drop_column('deliveries', 'provider')

    # 2. Revert notification_events
    op.drop_column('notification_events', 'send_at')

    # 1. Revert clients
    op.drop_column('clients', 'daily_email_limit')
    op.drop_column('clients', 'reply_to_email')
    op.drop_column('clients', 'from_name')
