from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class TeamBase(BaseModel):
    name: str
    description: Optional[str] = None


class TeamCreate(TeamBase):
    pass


class TeamOut(TeamBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class EmployeeBase(BaseModel):
    username: str
    full_name: str
    email: Optional[str] = None
    position: Optional[str] = None
    team_id: Optional[int] = None
    policy_id: Optional[int] = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    position: Optional[str] = None
    team_id: Optional[int] = None
    policy_id: Optional[int] = None
    is_active: Optional[bool] = None


class AgentStatusInfo(BaseModel):
    status: str
    hostname: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    agent_version: Optional[str] = None

    model_config = {"from_attributes": True}


class EmployeeOut(EmployeeBase):
    id: int
    is_active: bool
    created_at: datetime
    team: Optional[TeamOut] = None
    agent_status: Optional[AgentStatusInfo] = None

    model_config = {"from_attributes": True}


class EmployeeListOut(BaseModel):
    items: list[EmployeeOut]
    total: int
    page: int
    size: int
