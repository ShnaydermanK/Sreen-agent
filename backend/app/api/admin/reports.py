import csv
import io
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import get_current_user
from app.core.database import get_db
from app.models.activity import ActivityEvent, DailyStat
from app.models.employee import Employee
from app.models.user import User

router = APIRouter(prefix="/api/admin/reports", tags=["reports"])


def _fmt_time(sec: Optional[int]) -> str:
    if not sec:
        return "0ч 0м"
    h = sec // 3600
    m = (sec % 3600) // 60
    return f"{h}ч {m}м"


@router.get("/daily-activity")
async def daily_activity_report(
    date_from: date = Query(...),
    date_to: date = Query(...),
    employee_id: Optional[int] = None,
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Daily Activity Report — active/idle/locked time per employee per day."""
    q = select(DailyStat, Employee.full_name, Employee.username).join(
        Employee, Employee.id == DailyStat.employee_id
    ).where(DailyStat.date >= date_from, DailyStat.date <= date_to)

    if employee_id:
        q = q.where(DailyStat.employee_id == employee_id)

    q = q.order_by(DailyStat.date, Employee.full_name)
    result = await db.execute(q)
    rows = result.all()

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Дата", "Сотрудник", "Логин", "Активное время", "Idle", "Заблокировано", "Начало сессии", "Конец сессии"])
        for stat, name, username in rows:
            writer.writerow([
                stat.date,
                name,
                username,
                _fmt_time(stat.active_time_sec),
                _fmt_time(stat.idle_time_sec),
                _fmt_time(stat.locked_time_sec),
                stat.session_start.strftime("%H:%M") if stat.session_start else "",
                stat.session_end.strftime("%H:%M") if stat.session_end else "",
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": f"attachment; filename=daily_activity_{date_from}_{date_to}.csv"},
        )

    return [
        {
            "date": str(stat.date),
            "employee_id": stat.employee_id,
            "full_name": name,
            "username": username,
            "active_time_sec": stat.active_time_sec,
            "idle_time_sec": stat.idle_time_sec,
            "locked_time_sec": stat.locked_time_sec,
            "session_start": stat.session_start.isoformat() if stat.session_start else None,
            "session_end": stat.session_end.isoformat() if stat.session_end else None,
            "app_usage": stat.app_usage or {},
        }
        for stat, name, username in rows
    ]


@router.get("/app-usage")
async def app_usage_report(
    date_from: date = Query(...),
    date_to: date = Query(...),
    employee_id: Optional[int] = None,
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Application Usage Report — total time per app per employee."""
    q = select(
        ActivityEvent.employee_id,
        ActivityEvent.app_name,
        ActivityEvent.app_category,
        func.sum(ActivityEvent.duration_sec).label("total_sec"),
    ).where(
        ActivityEvent.event_type == "app_blur",
        ActivityEvent.ts >= datetime.combine(date_from, datetime.min.time()),
        ActivityEvent.ts <= datetime.combine(date_to, datetime.max.time()),
        ActivityEvent.duration_sec.isnot(None),
    )
    if employee_id:
        q = q.where(ActivityEvent.employee_id == employee_id)
    q = q.group_by(
        ActivityEvent.employee_id, ActivityEvent.app_name, ActivityEvent.app_category
    ).order_by(func.sum(ActivityEvent.duration_sec).desc())

    result = await db.execute(q)
    rows = result.all()

    # Fetch employee names
    emp_ids = {r.employee_id for r in rows}
    emp_result = await db.execute(select(Employee).where(Employee.id.in_(emp_ids)))
    emp_map = {e.id: e.full_name for e in emp_result.scalars()}

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Сотрудник", "Приложение", "Категория", "Время"])
        for r in rows:
            writer.writerow([emp_map.get(r.employee_id, ""), r.app_name or "", r.app_category or "", _fmt_time(r.total_sec)])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": f"attachment; filename=app_usage_{date_from}_{date_to}.csv"},
        )

    return [
        {
            "employee_id": r.employee_id,
            "full_name": emp_map.get(r.employee_id, ""),
            "app_name": r.app_name,
            "app_category": r.app_category,
            "total_sec": r.total_sec,
        }
        for r in rows
    ]


@router.get("/idle-time")
async def idle_time_report(
    date_from: date = Query(...),
    date_to: date = Query(...),
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Idle Time Report — idle periods per employee."""
    q = select(DailyStat, Employee.full_name).join(
        Employee, Employee.id == DailyStat.employee_id
    ).where(
        DailyStat.date >= date_from,
        DailyStat.date <= date_to,
        DailyStat.idle_time_sec > 0,
    ).order_by(DailyStat.idle_time_sec.desc())
    result = await db.execute(q)
    rows = result.all()

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Дата", "Сотрудник", "Idle время", "Активное время", "% Idle"])
        for stat, name in rows:
            total = (stat.active_time_sec or 0) + (stat.idle_time_sec or 0)
            pct = round(stat.idle_time_sec / total * 100, 1) if total else 0
            writer.writerow([stat.date, name, _fmt_time(stat.idle_time_sec), _fmt_time(stat.active_time_sec), f"{pct}%"])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv; charset=utf-8-sig",
            headers={"Content-Disposition": f"attachment; filename=idle_time_{date_from}_{date_to}.csv"},
        )

    return [
        {
            "date": str(stat.date),
            "employee_id": stat.employee_id,
            "full_name": name,
            "idle_time_sec": stat.idle_time_sec,
            "active_time_sec": stat.active_time_sec,
        }
        for stat, name in rows
    ]
