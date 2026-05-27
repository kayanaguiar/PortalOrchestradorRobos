"""add robot_logs table

Revision ID: b5c1f9e4a2d8
Revises: a3f8e2c91d47
Create Date: 2026-05-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b5c1f9e4a2d8'
down_revision: Union[str, Sequence[str], None] = 'a3f8e2c91d47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'robot_logs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('orchestrator_id', sa.String(), nullable=True),
        sa.Column('process_name', sa.String(), nullable=True),
        sa.Column('robot_name', sa.String(), nullable=True),
        sa.Column('job_key', sa.String(), nullable=True),
        sa.Column('level', sa.String(), nullable=True),
        sa.Column('message', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.Column('raw', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_robot_logs_orchestrator_id', 'robot_logs', ['orchestrator_id'])
    op.create_index('ix_robot_logs_process_name', 'robot_logs', ['process_name'])
    op.create_index('ix_robot_logs_job_key', 'robot_logs', ['job_key'])
    op.create_index('ix_robot_logs_timestamp', 'robot_logs', ['timestamp'])
    op.create_index('ix_robot_logs_process_timestamp', 'robot_logs', ['process_name', 'timestamp'])


def downgrade() -> None:
    op.drop_index('ix_robot_logs_process_timestamp', table_name='robot_logs')
    op.drop_index('ix_robot_logs_timestamp', table_name='robot_logs')
    op.drop_index('ix_robot_logs_job_key', table_name='robot_logs')
    op.drop_index('ix_robot_logs_process_name', table_name='robot_logs')
    op.drop_index('ix_robot_logs_orchestrator_id', table_name='robot_logs')
    op.drop_table('robot_logs')
