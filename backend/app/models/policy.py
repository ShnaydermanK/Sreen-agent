from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

DEFAULT_POLICY = {
    "recording": {
        "enabled": True,
        "mode": "continuous",
        "schedule": "08:00-18:00",
        "resolution": "1280x720",
        "fps": 5,
        "codec": "h264",
        "crf": 30,
        "segment_duration_min": 30,
        "max_local_buffer_gb": 10,
        "record_all_monitors": False,
        "record_audio": False,
    },
    "activity": {
        "track_apps": True,
        "track_idle": True,
        "idle_threshold_sec": 60,
        "track_web_domains": False,
        "screenshot_interval_min": 5,
        "screenshot_quality": 70,
    },
    "privacy": {
        "excluded_apps": ["keepass.exe", "1password.exe"],
        "allow_manual_pause": False,
        "show_live_preview": True,
    },
    "sync": {
        "upload_priority": "stats_first",
        "retry_max_attempts": 10,
    },
}


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500))
    config: Mapped[dict[str, Any]] = mapped_column(JSON, default=DEFAULT_POLICY)
    is_default: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
