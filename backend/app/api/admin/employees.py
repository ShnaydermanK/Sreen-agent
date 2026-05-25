from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.admin.deps import get_current_user, get_visible_team_id
from app.core.database import get_db
from app.models.agent import Agent
from app.models.employee import Employee, Team
from app.models.user import User
from app.schemas.employee import (
    AgentStatusInfo,
    EmployeeCreate,
    EmployeeListOut,
    EmployeeOut,
    EmployeeUpdate,
    TeamCreate,
    TeamOut,
)

router = APIRouter(prefix="/api/admin/employees", tags=["employees"])


@router.get("", response_model=EmployeeListOut)
async def list_employees(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    team_id: Optional[int] = None,
    search: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Employee).options(selectinload(Employee.team), selectinload(Employee.agents))
    # RBAC: supervisor sees only their team
    effective_team = team_id or get_visible_team_id(current_user)
    if effective_team:
        q = q.where(Employee.team_id == effective_team)
    if search:
        q = q.where(
            Employee.full_name.ilike(f"%{search}%") | Employee.username.ilike(f"%{search}%")
        )
    if is_active is not None:
        q = q.where(Employee.is_active == is_active)

    count_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = count_result.scalar_one()

    q = q.offset((page - 1) * size).limit(size).order_by(Employee.full_name)
    result = await db.execute(q)
    employees = result.scalars().all()

    items = []
    for emp in employees:
        emp_out = EmployeeOut.model_validate(emp)
        latest_agent = max(emp.agents, key=lambda a: a.last_seen_at or emp.created_at, default=None)
        if latest_agent:
            emp_out.agent_status = AgentStatusInfo.model_validate(latest_agent)
        items.append(emp_out)

    return EmployeeListOut(items=items, total=total, page=page, size=size)


@router.post("", response_model=EmployeeOut, status_code=201)
async def create_employee(
    body: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    emp = Employee(**body.model_dump())
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return emp


@router.get("/{employee_id}", response_model=EmployeeOut)
async def get_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.team), selectinload(Employee.agents))
        .where(Employee.id == employee_id)
    )
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp_out = EmployeeOut.model_validate(emp)
    latest_agent = max(emp.agents, key=lambda a: a.last_seen_at or emp.created_at, default=None)
    if latest_agent:
        emp_out.agent_status = AgentStatusInfo.model_validate(latest_agent)
    return emp_out


@router.patch("/{employee_id}", response_model=EmployeeOut)
async def update_employee(
    employee_id: int,
    body: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(emp, field, value)
    await db.commit()
    await db.refresh(emp)
    return emp


@router.delete("/{employee_id}", status_code=204)
async def delete_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    emp = result.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp.is_active = False
    await db.commit()


# Teams
teams_router = APIRouter(prefix="/api/admin/teams", tags=["teams"])


@teams_router.get("", response_model=list[TeamOut])
async def list_teams(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Team).order_by(Team.name))
    return result.scalars().all()


@teams_router.post("", response_model=TeamOut, status_code=201)
async def create_team(
    body: TeamCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    team = Team(**body.model_dump())
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return team
