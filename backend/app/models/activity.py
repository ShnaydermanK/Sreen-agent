import enum
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EventTypeEnum(str, enum.Enum):
    app_focus = "app_focus"
    app_blur = "app_blur"
    idle_start = "idle_start"
    idle_end = "idle_end"
    screen_lock = "screen_lock"
    screen_unlock = "screen_unlock"
    call_start = "call_start"
    call_end = "call_end"
    session_start = "session_start"
    session_end = "session_end"


class ActivityEvent(Base):
    __tablename__ = "activity_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    app_name: Mapped[Optional[str]] = mapped_column(String(255))
    window_title: Mapped[Optional[str]] = mapped_column(String(500))
    app_category: Mapped[Optional[str]] = mapped_column(String(100))
    duration_sec: Mapped[Optional[int]] = mapped_column(Integer)


class DailyStat(Base):
    __tablename__ = "daily_stats"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)

    active_time_sec: Mapped[int] = mapped_column(Integer, default=0)
    idle_time_sec: Mapped[int] = mapped_column(Integer, default=0)
    locked_time_sec: Mapped[int] = mapped_column(Integer, default=0)

    session_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    session_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    app_usage: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
