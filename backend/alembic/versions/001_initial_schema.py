"""Initial schema with all eight core tables and partial claim index

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-10-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. clients table
    op.create_table(
        'clients',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('api_key_hash', sa.String(length=64), nullable=False),
        sa.Column('api_key_prefix', sa.String(length=16), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='active', nullable=False),
        sa.Column('rate_limit_per_sec', sa.Integer(), server_default='50', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_clients_api_key_hash', 'clients', ['api_key_hash'], unique=True)
    op.create_index('ix_clients_api_key_prefix', 'clients', ['api_key_prefix'], unique=False)

    # 2. recipients table
    op.create_table(
        'recipients',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('client_id', 'external_id', name='uq_recipients_client_external_id'),
    )
    op.create_index('ix_recipients_client_id', 'recipients', ['client_id'], unique=False)
    op.create_index('ix_recipients_email', 'recipients', ['email'], unique=False)
    op.create_index('ix_recipients_client_email', 'recipients', ['client_id', 'email'], unique=False)

    # 3. preferences table
    op.create_table(
        'preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('recipient_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('recipients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('recipient_id', 'event_type', name='uq_preferences_recipient_event_type'),
    )
    op.create_index('ix_preferences_recipient_id', 'preferences', ['recipient_id'], unique=False)

    # 4. templates table
    op.create_table(
        'templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('version', sa.Integer(), server_default='1', nullable=False),
        sa.Column('subject', sa.Text(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='active', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('client_id', 'event_type', 'version', name='uq_templates_client_event_version'),
    )
    op.create_index('ix_templates_client_id', 'templates', ['client_id'], unique=False)

    # 5. event_type_settings table
    op.create_table(
        'event_type_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('priority', sa.Integer(), server_default='1', nullable=False),
        sa.Column('ttl_seconds', sa.Integer(), nullable=True),
        sa.Column('retry_schedule', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('respect_opt_out', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('sensitive', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('client_id', 'event_type', name='uq_event_type_settings_client_event'),
    )
    op.create_index('ix_event_type_settings_client_id', 'event_type_settings', ['client_id'], unique=False)

    # 6. notification_events table
    op.create_table(
        'notification_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('idempotency_key', sa.String(length=255), nullable=False),
        sa.Column('request_hash', sa.String(length=64), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('recipient_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('recipients.id', ondelete='SET NULL'), nullable=True),
        sa.Column('recipient_email', sa.String(length=255), nullable=True),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('client_id', 'idempotency_key', name='uq_events_client_idempotency_key'),
    )
    op.create_index('ix_notification_events_client_id', 'notification_events', ['client_id'], unique=False)
    op.create_index('ix_notification_events_recipient_id', 'notification_events', ['recipient_id'], unique=False)
    op.create_index('ix_notification_events_event_type', 'notification_events', ['event_type'], unique=False)

    # 7. deliveries table
    op.create_table(
        'deliveries',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('notification_events.id', ondelete='CASCADE'), nullable=False),
        sa.Column('to_email', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='queued', nullable=False),
        sa.Column('priority', sa.Integer(), server_default='1', nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('retry_schedule', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('sensitive', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('attempt_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('next_attempt_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rendered_subject', sa.Text(), nullable=False),
        sa.Column('rendered_body', sa.Text(), nullable=False),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_deliveries_client_id', 'deliveries', ['client_id'], unique=False)
    op.create_index('ix_deliveries_event_id', 'deliveries', ['event_id'], unique=False)
    op.create_index('ix_deliveries_status', 'deliveries', ['status'], unique=False)

    # Partial index: idx_deliveries_claim ON deliveries (priority DESC, next_attempt_at) WHERE status = 'queued'
    op.execute(
        "CREATE INDEX idx_deliveries_claim ON deliveries (priority DESC, next_attempt_at) WHERE status = 'queued';"
    )

    # 8. delivery_attempts table
    op.create_table(
        'delivery_attempts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('delivery_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('deliveries.id', ondelete='CASCADE'), nullable=False),
        sa.Column('attempt_no', sa.Integer(), nullable=False),
        sa.Column('outcome', sa.String(length=20), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('latency_ms', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index('ix_delivery_attempts_delivery_id', 'delivery_attempts', ['delivery_id'], unique=False)


def downgrade() -> None:
    op.drop_table('delivery_attempts')
    op.execute("DROP INDEX IF EXISTS idx_deliveries_claim;")
    op.drop_table('deliveries')
    op.drop_table('notification_events')
    op.drop_table('event_type_settings')
    op.drop_table('templates')
    op.drop_table('preferences')
    op.drop_table('recipients')
    op.drop_table('clients')
