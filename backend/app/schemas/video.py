from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class VideoSegmentOut(BaseModel):
    id: int
    employee_id: int
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_sec: Optional[int] = None
    monitor_index: int
    resolution: Optional[str] = None
    fps: Optional[int] = None
    codec: Optional[str] = None
    file_size_bytes: Optional[int] = None
    status: str
    thumbnail_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VideoSegmentDetail(VideoSegmentOut):
    hls_url: Optional[str] = None
    download_url: Optional[str] = None


class VideoListOut(BaseModel):
    items: list[VideoSegmentOut]
    total: int
    page: int
    size: int
