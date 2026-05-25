from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import get_current_user
from app.core.database import get_db
from app.models.policy import Policy, DEFAULT_POLICY
from app.models.user import User

router = APIRouter(prefix="/api/admin/policies", tags=["policies"])


class PolicyOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    config: dict[str, Any]
    is_default: bool
    model_config = {"from_attributes": True}


class PolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    is_default: bool = False


class PolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    is_default: Optional[bool] = None


@router.get("", response_model=list[PolicyOut])
async def list_policies(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Policy).order_by(Policy.is_default.desc(), Policy.name))
    return result.scalars().all()


@router.post("", response_model=PolicyOut, status_code=201)
async def create_policy(
    body: PolicyCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    policy = Policy(
        name=body.name,
        description=body.description,
        config=body.config or DEFAULT_POLICY,
        is_default=body.is_default,
    )
    db.add(policy)
    await db.commit()
    await db.refresh(policy)
    return policy


@router.get("/{policy_id}", response_model=PolicyOut)
async def get_policy(policy_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Policy not found")
    return p


@router.patch("/{policy_id}", response_model=PolicyOut)
async def update_policy(
    policy_id: int,
    body: PolicyUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Policy not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(Policy).where(Policy.id == policy_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Policy not found")
    if p.is_default:
        raise HTTPException(400, "Cannot delete the default policy")
    await db.delete(p)
    await db.commit()
