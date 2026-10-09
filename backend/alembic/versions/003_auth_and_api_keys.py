"""Create users, sessions, api_keys tables and migrate client api keys

Revision ID: 003_auth_and_api_keys
Revises: 002_reliability_indexes
Create Date: 2026-10-08 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '003_auth_and_api_keys'
down_revision: Union[str, None] = '002_reliability_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_users_client_id', 'users', ['client_id'], unique=False)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # 2. sessions table
    op.create_table(
        'sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('user_agent', sa.String(length=512), nullable=True),
    )
    op.create_index('ix_sessions_user_id', 'sessions', ['user_id'], unique=False)
    op.create_index('ix_sessions_token_hash', 'sessions', ['token_hash'], unique=True)
    op.create_index('ix_sessions_expires_at', 'sessions', ['expires_at'], unique=False)

    # 3. api_keys table
    op.create_table(
        'api_keys',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('client_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('key_prefix', sa.String(length=16), nullable=False),
        sa.Column('key_hash', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=20), server_default='active', nullable=False),
        sa.Column('created_by_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_api_keys_client_id', 'api_keys', ['client_id'], unique=False)
    op.create_index('ix_api_keys_key_prefix', 'api_keys', ['key_prefix'], unique=False)
    op.create_index('ix_api_keys_key_hash', 'api_keys', ['key_hash'], unique=True)
    op.create_index('ix_api_keys_status', 'api_keys', ['status'], unique=False)

    # 4. Copy existing clients.api_key_hash and clients.api_key_prefix into api_keys
    op.execute("""
        INSERT INTO api_keys (id, client_id, name, key_prefix, key_hash, status, created_at)
        SELECT gen_random_uuid(), id, 'Default key', api_key_prefix, api_key_hash, 'active', NOW()
        FROM clients
        WHERE api_key_hash IS NOT NULL;
    """)

    # 5. Drop old indexes and columns from clients
    op.drop_index('ix_clients_api_key_hash', table_name='clients')
    op.drop_index('ix_clients_api_key_prefix', table_name='clients')
    op.drop_column('clients', 'api_key_hash')
    op.drop_column('clients', 'api_key_prefix')


def downgrade() -> None:
    # 1. Restore columns on clients
    op.add_column('clients', sa.Column('api_key_hash', sa.String(length=64), nullable=True))
    op.add_column('clients', sa.Column('api_key_prefix', sa.String(length=16), nullable=True))

    # 2. Populate columns from each client's oldest active key
    op.execute("""
        UPDATE clients c
        SET api_key_hash = k.key_hash,
            api_key_prefix = k.key_prefix
        FROM (
            SELECT DISTINCT ON (client_id) client_id, key_hash, key_prefix
            FROM api_keys
            WHERE status = 'active'
            ORDER BY client_id, created_at ASC
        ) k
        WHERE c.id = k.client_id;
    """)

    # 3. For any client that didn't have an active key, populate fallback placeholder
    op.execute("""
        UPDATE clients
        SET api_key_hash = 'missing_' || SUBSTRING(id::text, 1, 32),
            api_key_prefix = 'nh_live_miss'
        WHERE api_key_hash IS NULL;
    """)

    # 4. Alter columns to NOT NULL and recreate indexes
    op.alter_column('clients', 'api_key_hash', nullable=False)
    op.alter_column('clients', 'api_key_prefix', nullable=False)
    op.create_index('ix_clients_api_key_hash', 'clients', ['api_key_hash'], unique=True)
    op.create_index('ix_clients_api_key_prefix', 'clients', ['api_key_prefix'], unique=False)

    # 5. Drop api_keys, sessions, users tables
    op.drop_table('api_keys')
    op.drop_table('sessions')
    op.drop_table('users')
