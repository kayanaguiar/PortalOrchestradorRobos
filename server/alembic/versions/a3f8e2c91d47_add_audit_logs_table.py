"""add audit_logs table

Revision ID: a3f8e2c91d47
Revises: 0147192ab2d8
Create Date: 2026-04-13 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f8e2c91d47'
down_revision: Union[str, Sequence[str], None] = '0147192ab2d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('user_name', sa.String(), nullable=False),
        sa.Column('action', sa.String(), nullable=False),
        sa.Column('robot_name', sa.String(), nullable=False),
        sa.Column('orchestrator_id', sa.String(), nullable=True),
        sa.Column('orchestrator_name', sa.String(), nullable=True),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('audit_logs')
