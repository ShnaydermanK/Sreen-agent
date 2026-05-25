import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import get_current_user
from app.core.database import get_db
from app.models.agent import Agent
from app.models.user import User

router = APIRouter(prefix="/api/admin/agents", tags=["agents"])


class AgentCreate(BaseModel):
    employee_id: int


class AgentOut(BaseModel):
    id: int
    employee_id: int
    agent_token: str
    hostname: str | None = None
    status: str
    last_seen_at: str | None = None
    agent_version: str | None = None

    model_config = {"from_attributes": True}


@router.post("", response_model=AgentOut, status_code=201)
async def create_agent(
    body: AgentCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    token = uuid.uuid4().hex + uuid.uuid4().hex
    agent = Agent(employee_id=body.employee_id, agent_token=token)
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


@router.get("/by-employee/{employee_id}", response_model=list[AgentOut])
async def list_agents_for_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Agent).where(Agent.employee_id == employee_id))
    return result.scalars().all()
