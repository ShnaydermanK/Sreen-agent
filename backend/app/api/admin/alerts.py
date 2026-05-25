from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import get_current_user
from app.core.database import get_db
from app.models.alert import Alert
from app.models.user import User
from pydantic import BaseModel

router = APIRouter(prefix="/api/admin/alerts", tags=["alerts"])


class AlertOut(BaseModel):
    id: int
    employee_id: int
    type: str
    severity: str
    message: Optional[str] = None
    payload: Optional[dict] = None
    is_resolved: bool
    created_at: datetime
    resolved_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class AlertListOut(BaseModel):
    items: list[AlertOut]
    total: int


@router.get("", response_model=AlertListOut)
async def list_alerts(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    employee_id: Optional[int] = None,
    type: Optional[str] = None,
    is_resolved: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Alert)
    if employee_id:
        q = q.where(Alert.employee_id == employee_id)
    if type:
        q = q.where(Alert.type == type)
    if is_resolved is not None:
        q = q.where(Alert.is_resolved == is_resolved)

    total_r = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_r.scalar_one()

    q = q.order_by(Alert.created_at.desc()).offset((page - 1) * size).limit(size)
    result = await db.execute(q)
    return AlertListOut(items=result.scalars().all(), total=total)


@router.get("/summary")
async def alerts_summary(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Count open alerts by type."""
    result = await db.execute(
        select(Alert.type, Alert.severity, func.count().label("count"))
        .where(Alert.is_resolved == False)
        .group_by(Alert.type, Alert.severity)
    )
    rows = result.all()
    return [{"type": r.type, "severity": r.severity, "count": r.count} for r in rows]


@router.post("/{alert_id}/resolve", response_model=AlertOut)
async def resolve_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    from datetime import timezone
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        from fastapi import HTTPException
        raise HTTPException(404, "Alert not found")
    alert.is_resolved = True
    alert.resolved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(alert)
    return alert
