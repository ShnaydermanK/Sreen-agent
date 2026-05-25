import io

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.agent.deps import get_current_agent
from app.core.database import get_db
from app.models.agent import Agent
from app.services import storage

router = APIRouter(prefix="/api/v1", tags=["agent-screenshot"])


@router.post("/screenshot/upload")
async def upload_screenshot(
    file: UploadFile = File(...),
    agent: Agent = Depends(get_current_agent),
    db: AsyncSession = Depends(get_db),
):
    """Upload live screenshot — overwrites current.jpg for this employee."""
    content = await file.read()
    if len(content) < 500:
        return {"ok": False, "reason": "too small"}

    key = f"live_screenshots/{agent.employee_id}/current.jpg"
    storage.upload_bytes(key, content, "image/jpeg")
    return {"ok": True}
