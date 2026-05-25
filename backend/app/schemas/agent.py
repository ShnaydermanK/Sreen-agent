from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class HeartbeatRequest(BaseModel):
    hostname: str
    os_version: Optional[str] = None
    agent_version: Optional[str] = None
    status: str = "recording"
    buffer_size_bytes: Optional[int] = None


class HeartbeatResponse(BaseModel):
    ok: bool
    server_time: datetime


class PolicyResponse(BaseModel):
    policy_id: int
    config: dict[str, Any]


class StatsEvent(BaseModel):
    ts: datetime
    event_type: str
    app_name: Optional[str] = None
    window_title: Optional[str] = None
    app_category: Optional[str] = None
    duration_sec: Optional[int] = None


class StatsPushRequest(BaseModel):
    events: list[StatsEvent]
    date: Optional[str] = None
    active_time_sec: Optional[int] = None
    idle_time_sec: Optional[int] = None


class StatsPushResponse(BaseModel):
    ok: bool
    received: int


class VideoUploadResponse(BaseModel):
    ok: bool
    segment_id: int
    message: str
