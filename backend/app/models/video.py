import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VideoStatusEnum(str, enum.Enum):
    uploaded = "uploaded"
    processing = "processing"
    ready = "ready"
    error = "error"


class VideoSegment(Base):
    __tablename__ = "video_segments"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agents.id"), nullable=False)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_sec: Mapped[Optional[int]] = mapped_column(Integer)

    monitor_index: Mapped[int] = mapped_column(Integer, default=0)
    resolution: Mapped[Optional[str]] = mapped_column(String(20))
    fps: Mapped[Optional[int]] = mapped_column(Integer)
    codec: Mapped[Optional[str]] = mapped_column(String(20))

    file_key: Mapped[Optional[str]] = mapped_column(String(500))
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    sha256: Mapped[Optional[str]] = mapped_column(String(64))

    hls_key: Mapped[Optional[str]] = mapped_column(String(500))
    thumbnail_key: Mapped[Optional[str]] = mapped_column(String(500))

    status: Mapped[str] = mapped_column(String(50), default=VideoStatusEnum.uploaded)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped["Employee"] = relationship("Employee", back_populates="video_segments")
    agent: Mapped["Agent"] = relationship("Agent", back_populates="video_segments")
