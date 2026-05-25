import hashlib
import os
import tempfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.agent.deps import get_current_agent
from app.core.database import get_db
from app.models.agent import Agent
from app.models.policy import Policy
from app.models.video import VideoSegment
from app.models.activity import ActivityEvent, DailyStat
from app.schemas.agent import (
    HeartbeatRequest,
    HeartbeatResponse,
    PolicyResponse,
    StatsPushRequest,
    StatsPushResponse,
    VideoUploadResponse,
)
from app.services import storage
from app.workers.tasks import process_video_segment

router = APIRouter(prefix="/api/v1", tags=["agent"])


@router.get("/agent/version")
async def agent_version():
    """Returns latest agent version info for auto-update."""
    from app.core.config import settings
    return {
        "version": settings.AGENT_LATEST_VERSION,
        "download_url": settings.AGENT_DOWNLOAD_URL or None,
        "release_notes": "Latest stable release",
    }


@router.post("/agent/heartbeat", response_model=HeartbeatResponse)
async def heartbeat(
    body: HeartbeatRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    agent.last_seen_at = datetime.now(timezone.utc)
    agent.hostname = body.hostname
    if body.os_version:
        agent.os_version = body.os_version
    if body.agent_version:
        agent.agent_version = body.agent_version
    valid_statuses = {"online", "recording", "paused", "error", "offline"}
    agent.status = body.status if body.status in valid_statuses else "online"
    await db.commit()

    # Broadcast live status update to admin WebSocket clients
    from app.core.ws import manager
    import asyncio
    asyncio.create_task(manager.broadcast("agent_status", {
        "employee_id": agent.employee_id,
        "agent_id": agent.id,
        "status": agent.status,
        "hostname": agent.hostname,
        "last_seen_at": agent.last_seen_at.isoformat(),
        "buffer_size_bytes": body.buffer_size_bytes,
    }))

    return HeartbeatResponse(ok=True, server_time=datetime.now(timezone.utc))


@router.get("/policy/get", response_model=PolicyResponse)
async def get_policy(
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(Agent)
        .options(selectinload(Agent.employee))
        .where(Agent.id == agent.id)
    )
    agent_with_emp = result.scalar_one()
    employee = agent_with_emp.employee

    policy = None
    if employee.policy_id:
        p_result = await db.execute(select(Policy).where(Policy.id == employee.policy_id))
        policy = p_result.scalar_one_or_none()

    if not policy:
        p_result = await db.execute(select(Policy).where(Policy.is_default == True))
        policy = p_result.scalar_one_or_none()

    if not policy:
        from app.models.policy import DEFAULT_POLICY
        return PolicyResponse(policy_id=0, config=DEFAULT_POLICY)

    return PolicyResponse(policy_id=policy.id, config=policy.config)


@router.post("/upload/video", response_model=VideoUploadResponse)
async def upload_video(
    file: UploadFile = File(...),
    started_at: str = Form(...),
    ended_at: str = Form(None),
    monitor_index: int = Form(0),
    resolution: str = Form(None),
    fps: int = Form(None),
    codec: str = Form(None),
    sha256: str = Form(None),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    started_dt = datetime.fromisoformat(started_at)
    ended_dt = datetime.fromisoformat(ended_at) if ended_at else None
    duration = int((ended_dt - started_dt).total_seconds()) if ended_dt else None

    segment = VideoSegment(
        employee_id=agent.employee_id,
        agent_id=agent.id,
        started_at=started_dt,
        ended_at=ended_dt,
        duration_sec=duration,
        monitor_index=monitor_index,
        resolution=resolution,
        fps=fps,
        codec=codec,
        status="uploaded",
    )
    db.add(segment)
    await db.flush()

    content = await file.read()
    actual_hash = hashlib.sha256(content).hexdigest()
    if sha256 and sha256 != actual_hash:
        await db.rollback()
        raise HTTPException(status_code=400, detail="SHA256 mismatch")

    ext = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    file_key = storage.build_video_key(agent.employee_id, segment.id, f"original{ext}")

    import io
    storage.upload_file(file_key, io.BytesIO(content), len(content), "video/mp4")

    segment.file_key = file_key
    segment.file_size_bytes = len(content)
    segment.sha256 = actual_hash
    await db.commit()
    await db.refresh(segment)

    process_video_segment.delay(segment.id)

    return VideoUploadResponse(ok=True, segment_id=segment.id, message="Uploaded, processing queued")


@router.post("/stats/push", response_model=StatsPushResponse)
async def push_stats(
    body: StatsPushRequest,
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    events = []
    for ev in body.events:
        event = ActivityEvent(
            ts=ev.ts,
            employee_id=agent.employee_id,
            event_type=ev.event_type,
            app_name=ev.app_name,
            window_title=ev.window_title,
            app_category=ev.app_category,
            duration_sec=ev.duration_sec,
        )
        events.append(event)

    if events:
        db.add_all(events)

    if body.date and (body.active_time_sec is not None or body.idle_time_sec is not None):
        from datetime import date as date_type
        stat_date = date_type.fromisoformat(body.date)
        result = await db.execute(
            select(DailyStat).where(
                DailyStat.employee_id == agent.employee_id,
                DailyStat.date == stat_date,
            )
        )
        stat = result.scalar_one_or_none()
        if not stat:
            stat = DailyStat(employee_id=agent.employee_id, date=stat_date)
            db.add(stat)

        if body.active_time_sec is not None:
            stat.active_time_sec = body.active_time_sec
        if body.idle_time_sec is not None:
            stat.idle_time_sec = body.idle_time_sec

    await db.commit()

    # Broadcast current app/status to live dashboard via WebSocket
    focus_events = [e for e in body.events if e.event_type == "app_focus"]
    idle_events = [e for e in body.events if e.event_type in ("idle_start", "idle_end")]
    if focus_events or idle_events:
        last_focus = focus_events[-1] if focus_events else None
        last_idle = idle_events[-1] if idle_events else None
        from app.core.ws import manager
        import asyncio
        asyncio.create_task(manager.broadcast("activity_update", {
            "employee_id": agent.employee_id,
            "current_app": last_focus.app_name if last_focus else None,
            "current_app_category": last_focus.app_category if last_focus else None,
            "is_idle": last_idle.event_type == "idle_start" if last_idle else None,
        }))

    return StatsPushResponse(ok=True, received=len(events))
