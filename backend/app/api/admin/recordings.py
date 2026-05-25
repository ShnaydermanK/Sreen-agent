from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import get_current_user, can_view_video
from app.core.database import get_db
from app.models.user import User
from app.models.video import VideoSegment
from app.schemas.video import VideoListOut, VideoSegmentDetail, VideoSegmentOut
from app.services import storage

router = APIRouter(prefix="/api/admin/recordings", tags=["recordings"])


def _enrich_segment(seg: VideoSegment) -> VideoSegmentOut:
    out = VideoSegmentOut.model_validate(seg)
    if seg.thumbnail_key and storage.object_exists(seg.thumbnail_key):
        out.thumbnail_url = storage.get_presigned_url(seg.thumbnail_key)
    return out


@router.get("", response_model=VideoListOut)
async def list_recordings(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    employee_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(VideoSegment)
    if employee_id:
        q = q.where(VideoSegment.employee_id == employee_id)
    if date_from:
        q = q.where(VideoSegment.started_at >= date_from)
    if date_to:
        from datetime import datetime, timedelta
        q = q.where(VideoSegment.started_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time()))
    if status:
        q = q.where(VideoSegment.status == status)

    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()

    q = q.offset((page - 1) * size).limit(size).order_by(VideoSegment.started_at.desc())
    result = await db.execute(q)
    segments = result.scalars().all()

    items = [_enrich_segment(s) for s in segments]
    return VideoListOut(items=items, total=total, page=page, size=size)


@router.get("/{segment_id}", response_model=VideoSegmentDetail)
async def get_recording(
    segment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(VideoSegment).where(VideoSegment.id == segment_id))
    seg = result.scalar_one_or_none()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")

    detail = VideoSegmentDetail.model_validate(seg)
    if seg.thumbnail_key and storage.object_exists(seg.thumbnail_key):
        detail.thumbnail_url = storage.get_presigned_url(seg.thumbnail_key)

    # RBAC: analyst role cannot access raw video / HLS
    if can_view_video(current_user):
        if seg.hls_key and storage.object_exists(seg.hls_key):
            detail.hls_url = storage.get_presigned_url(seg.hls_key)
        if seg.file_key and storage.object_exists(seg.file_key):
            detail.download_url = storage.get_presigned_url(seg.file_key)

        # Write audit log entry
        from app.models.audit import AuditLog
        audit = AuditLog(
            user_id=current_user.id,
            action="view_recording",
            resource_type="video_segment",
            resource_id=segment_id,
            detail=f"segment employee_id={seg.employee_id}",
        )
        db.add(audit)
        await db.commit()

    return detail


@router.get("/{segment_id}/events")
async def get_recording_events(
    segment_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Activity events that fall within this segment's timeframe — for timeline overlay."""
    from app.models.activity import ActivityEvent

    result = await db.execute(select(VideoSegment).where(VideoSegment.id == segment_id))
    seg = result.scalar_one_or_none()
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")

    if not seg.started_at:
        return []

    end_ts = seg.ended_at or datetime.utcnow()
    events_q = (
        select(ActivityEvent)
        .where(
            ActivityEvent.employee_id == seg.employee_id,
            ActivityEvent.ts >= seg.started_at,
            ActivityEvent.ts <= end_ts,
        )
        .order_by(ActivityEvent.ts)
        .limit(2000)
    )
    ev_result = await db.execute(events_q)
    events = ev_result.scalars().all()

    seg_start = seg.started_at.timestamp()
    seg_duration = (end_ts.timestamp() - seg_start) or 1

    return [
        {
            "event_type": e.event_type,
            "ts": e.ts.isoformat(),
            "offset_sec": max(0.0, e.ts.timestamp() - seg_start),
            "offset_pct": round((e.ts.timestamp() - seg_start) / seg_duration * 100, 2),
            "app_name": e.app_name,
            "app_category": e.app_category,
            "duration_sec": e.duration_sec,
        }
        for e in events
    ]
