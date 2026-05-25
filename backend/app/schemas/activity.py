from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel


class DailyStatOut(BaseModel):
    date: date
    employee_id: int
    active_time_sec: int
    idle_time_sec: int
    locked_time_sec: int
    session_start: Optional[datetime] = None
    session_end: Optional[datetime] = None
    app_usage: Optional[dict[str, Any]] = None

    model_config = {"from_attributes": True}


class ActivityEventOut(BaseModel):
    id: int
    ts: datetime
    employee_id: int
    event_type: str
    app_name: Optional[str] = None
    window_title: Optional[str] = None
    app_category: Optional[str] = None
    duration_sec: Optional[int] = None

    model_config = {"from_attributes": True}
