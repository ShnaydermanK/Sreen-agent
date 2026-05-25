import enum
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AlertTypeEnum(str, enum.Enum):
    long_idle = "long_idle"
    forbidden_app = "forbidden_app"
    agent_offline = "agent_offline"
    recording_error = "recording_error"
    buffer_full = "buffer_full"


class AlertSeverityEnum(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    employee_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(50), default=AlertSeverityEnum.warning)
    message: Mapped[Optional[str]] = mapped_column(String(500))
    payload: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON)
    is_resolved: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
