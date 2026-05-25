from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import get_current_user
from app.core.database import get_db
from app.models.activity import ActivityEvent, DailyStat
from app.models.employee import Employee
from app.models.user import User
from app.schemas.activity import ActivityEventOut, DailyStatOut

router = APIRouter(prefix="/api/admin/stats", tags=["stats"])


@router.get("/daily/{employee_id}", response_model=list[DailyStatOut])
async def get_daily_stats(
    employee_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(DailyStat).where(DailyStat.employee_id == employee_id)
    if date_from:
        q = q.where(DailyStat.date >= date_from)
    if date_to:
        q = q.where(DailyStat.date <= date_to)
    q = q.order_by(DailyStat.date.desc()).limit(90)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/events/{employee_id}", response_model=list[ActivityEventOut])
async def get_activity_events(
    employee_id: int,
    date_from: Optional[date] = None,
    limit: int = Query(500, le=2000),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(ActivityEvent).where(ActivityEvent.employee_id == employee_id)
    if date_from:
        q = q.where(ActivityEvent.ts >= datetime.combine(date_from, datetime.min.time()))
    q = q.order_by(ActivityEvent.ts.asc()).limit(limit)
    result = await db.execute(q)
    return result.scalars().all()


@router.get("/app-usage/{employee_id}")
async def get_app_usage(
    employee_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Top apps by usage time for employee."""
    q = select(
        ActivityEvent.app_name,
        ActivityEvent.app_category,
        func.sum(ActivityEvent.duration_sec).label("total_sec"),
    ).where(
        ActivityEvent.employee_id == employee_id,
        ActivityEvent.event_type == "app_blur",
        ActivityEvent.duration_sec.isnot(None),
    )
    if date_from:
        q = q.where(ActivityEvent.ts >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.where(ActivityEvent.ts <= datetime.combine(date_to, datetime.max.time()))
    q = q.group_by(ActivityEvent.app_name, ActivityEvent.app_category).order_by(
        func.sum(ActivityEvent.duration_sec).desc()
    ).limit(20)
    result = await db.execute(q)
    return [
        {"app_name": r.app_name, "app_category": r.app_category, "total_sec": r.total_sec}
        for r in result.all()
    ]


@router.get("/hourly-heatmap/{employee_id}")
async def get_hourly_heatmap(
    employee_id: int,
    days: int = Query(14, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Returns a 2D array [day][hour] = active_minutes
    for the heatmap chart.
    """
    since = datetime.utcnow() - timedelta(days=days)
    result = await db.execute(
        select(ActivityEvent).where(
            ActivityEvent.employee_id == employee_id,
            ActivityEvent.event_type == "app_focus",
            ActivityEvent.ts >= since,
        ).order_by(ActivityEvent.ts)
    )
    events = result.scalars().all()

    # Aggregate by date + hour
    heatmap: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for ev in events:
        day_str = ev.ts.strftime("%Y-%m-%d")
        hour = ev.ts.hour
        heatmap[day_str][hour] += (ev.duration_sec or 60) // 60  # minutes

    # Build array sorted by date
    days_list = sorted(heatmap.keys())
    return {
        "days": days_list,
        "data": [
            {"date": d, "hours": [heatmap[d].get(h, 0) for h in range(24)]}
            for d in days_list
        ],
    }


@router.get("/team-comparison")
async def get_team_comparison(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    team_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """
    Compare all employees: active time, idle %, anomaly flag.
    Returns per-employee averages + team benchmark (mean ± 1σ).
    """
    import math

    d_from = date_from or (date.today().replace(day=1))
    d_to   = date_to or date.today()

    q = (
        select(
            DailyStat.employee_id,
            func.avg(DailyStat.active_time_sec).label("avg_active"),
            func.avg(DailyStat.idle_time_sec).label("avg_idle"),
            func.count().label("days"),
        )
        .where(DailyStat.date >= d_from, DailyStat.date <= d_to)
        .group_by(DailyStat.employee_id)
    )
    result = await db.execute(q)
    rows = result.all()

    if not rows:
        return {"employees": [], "benchmark": None}

    emp_ids = [r.employee_id for r in rows]
    emp_q = select(Employee).where(Employee.id.in_(emp_ids))
    if team_id:
        emp_q = emp_q.where(Employee.team_id == team_id)
    emp_res = await db.execute(emp_q)
    emp_map = {e.id: e for e in emp_res.scalars()}

    data = []
    active_vals = []
    for r in rows:
        if r.employee_id not in emp_map:
            continue
        emp = emp_map[r.employee_id]
        avg_active = float(r.avg_active or 0)
        avg_idle   = float(r.avg_idle or 0)
        total      = avg_active + avg_idle
        idle_pct   = round(avg_idle / total * 100, 1) if total > 0 else 0
        active_vals.append(avg_active)
        data.append({
            "employee_id": r.employee_id,
            "full_name": emp.full_name,
            "username": emp.username,
            "avg_active_sec": round(avg_active),
            "avg_idle_sec": round(avg_idle),
            "idle_pct": idle_pct,
            "days": r.days,
            "is_anomaly": False,
        })

    # Compute benchmark: mean ± 1σ
    if active_vals:
        mean = sum(active_vals) / len(active_vals)
        variance = sum((x - mean) ** 2 for x in active_vals) / len(active_vals)
        std = math.sqrt(variance)
        low, high = mean - std, mean + std

        for d in data:
            d["is_anomaly"] = d["avg_active_sec"] < low or d["avg_active_sec"] > high

        benchmark = {
            "mean_active_sec": round(mean),
            "std_sec": round(std),
            "low_sec": round(low),
            "high_sec": round(high),
        }
    else:
        benchmark = None

    data.sort(key=lambda x: x["avg_active_sec"], reverse=True)
    return {"employees": data, "benchmark": benchmark}


@router.get("/team-summary")
async def get_team_summary(
    team_id: Optional[int] = None,
    target_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Today's stats for all employees (or a team)."""
    today = target_date or date.today()
    q = select(DailyStat, Employee.full_name, Employee.username).join(
        Employee, Employee.id == DailyStat.employee_id
    ).where(DailyStat.date == today)
    if team_id:
        q = q.where(Employee.team_id == team_id)
    result = await db.execute(q)
    rows = result.all()
    return [
        {
            "employee_id": stat.employee_id,
            "full_name": name,
            "username": username,
            "active_time_sec": stat.active_time_sec,
            "idle_time_sec": stat.idle_time_sec,
            "session_start": stat.session_start.isoformat() if stat.session_start else None,
            "session_end": stat.session_end.isoformat() if stat.session_end else None,
        }
        for stat, name, username in rows
    ]
