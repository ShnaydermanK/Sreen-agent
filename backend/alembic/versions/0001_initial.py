"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="supervisor"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "policies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.String(500)),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("position", sa.String(255)),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
        sa.Column("policy_id", sa.Integer(), sa.ForeignKey("policies.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_employees_username", "employees", ["username"])

    op.create_table(
        "agents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_token", sa.String(64), nullable=False, unique=True),
        sa.Column("hostname", sa.String(255)),
        sa.Column("os_version", sa.String(255)),
        sa.Column("agent_version", sa.String(50)),
        sa.Column("status", sa.String(50), nullable=False, server_default="offline"),
        sa.Column("last_seen_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_agents_agent_token", "agents", ["agent_token"])

    op.create_table(
        "video_segments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agent_id", sa.Integer(), sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("duration_sec", sa.Integer()),
        sa.Column("monitor_index", sa.Integer(), server_default="0"),
        sa.Column("resolution", sa.String(20)),
        sa.Column("fps", sa.Integer()),
        sa.Column("codec", sa.String(20)),
        sa.Column("file_key", sa.String(500)),
        sa.Column("file_size_bytes", sa.BigInteger()),
        sa.Column("sha256", sa.String(64)),
        sa.Column("hls_key", sa.String(500)),
        sa.Column("thumbnail_key", sa.String(500)),
        sa.Column("status", sa.String(50), nullable=False, server_default="uploaded"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_video_segments_employee_id", "video_segments", ["employee_id"])
    op.create_index("ix_video_segments_started_at", "video_segments", ["started_at"])

    op.create_table(
        "activity_events",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("app_name", sa.String(255)),
        sa.Column("window_title", sa.String(500)),
        sa.Column("app_category", sa.String(100)),
        sa.Column("duration_sec", sa.Integer()),
    )
    op.create_index("ix_activity_events_employee_ts", "activity_events", ["employee_id", "ts"])

    op.create_table(
        "daily_stats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("active_time_sec", sa.Integer(), server_default="0"),
        sa.Column("idle_time_sec", sa.Integer(), server_default="0"),
        sa.Column("locked_time_sec", sa.Integer(), server_default="0"),
        sa.Column("session_start", sa.DateTime(timezone=True)),
        sa.Column("session_end", sa.DateTime(timezone=True)),
        sa.Column("app_usage", sa.JSON()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_daily_stats_employee_date", "daily_stats", ["employee_id", "date"])

    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(50), nullable=False, server_default="warning"),
        sa.Column("message", sa.String(500)),
        sa.Column("payload", sa.JSON()),
        sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_alerts_employee_id", "alerts", ["employee_id"])


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_table("daily_stats")
    op.drop_table("activity_events")
    op.drop_table("video_segments")
    op.drop_table("agents")
    op.drop_table("employees")
    op.drop_table("policies")
    op.drop_table("teams")
    op.drop_table("users")
