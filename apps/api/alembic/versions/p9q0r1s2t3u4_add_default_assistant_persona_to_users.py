"""add default assistant persona to users

Revision ID: p9q0r1s2t3u4
Revises: z8a9b0c1d2e3
Create Date: 2026-05-22 10:00:00.000000
"""

from __future__ import annotations

from typing import Sequence
from typing import Union

from alembic import op
import sqlalchemy as sa


revision: str = "p9q0r1s2t3u4"
down_revision: Union[str, Sequence[str], None] = "z8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_accounts",
        sa.Column(
            "default_assistant_persona",
            sa.String(length=32),
            nullable=False,
            server_default="operator",
        ),
    )
    op.execute(
        """
        UPDATE user_accounts
        SET default_assistant_persona =
            CASE UPPER(role)
                WHEN 'TRADER' THEN 'trader'
                WHEN 'DESK_LEAD' THEN 'trader'
                WHEN 'RISK' THEN 'risk'
                WHEN 'RISK_MANAGER' THEN 'risk'
                WHEN 'CREDIT_APPROVER' THEN 'risk'
                WHEN 'CREDIT' THEN 'risk'
                WHEN 'OPS_ADMIN' THEN 'admin'
                WHEN 'ADMIN' THEN 'admin'
                WHEN 'OPERATIONS' THEN 'operations'
                WHEN 'SETTLEMENT' THEN 'settlement'
                WHEN 'ACCOUNTING' THEN 'settlement'
                WHEN 'ACCOUNTANT' THEN 'settlement'
                WHEN 'CONTROLLER' THEN 'settlement'
                WHEN 'REFERENCE_DATA' THEN 'reference_data'
                WHEN 'DATA_STEWARD' THEN 'reference_data'
                ELSE 'operator'
            END
        """
    )


def downgrade() -> None:
    op.drop_column("user_accounts", "default_assistant_persona")
