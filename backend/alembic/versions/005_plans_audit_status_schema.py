"""Add plans, audit_log, rate_limit_hits, and system_status tables

Revision ID: 005_plans_audit_status_schema
Revises: 004_sendgrid_and_scheduling
Create Date: 2026-10-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '005_plans_audit_status_schema'
down_revision: Union[str, None] = '004_sendgrid_and_scheduling'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create plans table if not exists
    op.create_table(
        'plans',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(length=100), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('monthly_email_limit', sa.Integer(), nullable=False, server_default='10000'),
        sa.Column('daily_email_limit', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('rate_limit_per_sec', sa.Integer(), nullable=False, server_default='50'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 2. Seed default Starter plan
    op.execute("""
        INSERT INTO plans (id, name, description, monthly_email_limit, daily_email_limit, rate_limit_per_sec, created_at)
        VALUES (gen_random_uuid(), 'Starter', 'Default starter plan', 10000, 30, 50, NOW())
        ON CONFLICT (name) DO NOTHING;
    """)

    # 3. Add plan_id to clients table
    op.add_column('clients', sa.Column('plan_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.execute("""
        UPDATE clients
        SET plan_id = (SELECT id FROM plans ORDER BY created_at ASC LIMIT 1)
        WHERE plan_id IS NULL;
    """)
    op.create_foreign_key(
        'clients_plan_id_fkey',
        'clients',
        'plans',
        ['plan_id'],
        ['id'],
        ondelete='RESTRICT',
    )
    op.create_index('ix_clients_plan_id', 'clients', ['plan_id'])

    # 4. Create audit_log table
    op.create_table(
        'audit_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('actor_email', sa.String(length=255), nullable=False),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('detail', sa.Text(), nullable=True),
    )
    op.create_foreign_key('audit_log_client_id_fkey', 'audit_log', 'clients', ['client_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_audit_log_at', 'audit_log', ['at'])
    op.create_index('ix_audit_log_action', 'audit_log', ['action'])
    op.create_index('ix_audit_log_client_id', 'audit_log', ['client_id'])

    # 5. Create rate_limit_hits table
    op.create_table(
        'rate_limit_hits',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_foreign_key('rate_limit_hits_client_id_fkey', 'rate_limit_hits', 'clients', ['client_id'], ['id'], ondelete='CASCADE')
    op.create_index('ix_rate_limit_hits_at', 'rate_limit_hits', ['at'])
    op.create_index('ix_rate_limit_hits_client_id', 'rate_limit_hits', ['client_id'])

    # 6. Create system_status table
    op.create_table(
        'system_status',
        sa.Column('key', sa.String(length=100), primary_key=True),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('system_status')
    op.drop_table('rate_limit_hits')
    op.drop_table('audit_log')
    op.drop_constraint('clients_plan_id_fkey', 'clients', type_='foreignkey')
    op.drop_index('ix_clients_plan_id', table_name='clients')
    op.drop_column('clients', 'plan_id')
    op.drop_table('plans')
