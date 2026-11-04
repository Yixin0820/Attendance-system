"""security hardening: force password change + login attempt lock

Revision ID: c41f8b90d2a6
Revises: f2aba365c00c
Create Date: 2026-11-04

新增：
- accounts.must_change_password：运维下发随机口令后强制用户首次登录改密
- login_attempts：登录失败计数与临时锁定（落库，多 worker 共享）
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c41f8b90d2a6'
down_revision: Union[str, Sequence[str], None] = 'f2aba365c00c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'accounts',
        sa.Column('must_change_password', sa.Boolean(), nullable=False,
                  server_default=sa.false()),
    )
    op.create_table(
        'login_attempts',
        sa.Column('key', sa.String(length=128), nullable=False),
        sa.Column('failures', sa.Integer(), nullable=False),
        sa.Column('locked_until', sa.String(length=32), nullable=False),
        sa.Column('updated_at', sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint('key'),
    )


def downgrade() -> None:
    op.drop_table('login_attempts')
    op.drop_column('accounts', 'must_change_password')
