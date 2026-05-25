from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.admin.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.services import storage

router = APIRouter(prefix="/api/admin/live", tags=["live-screenshots"])


@router.get("/screenshot/{employee_id}")
async def get_live_screenshot(
    employee_id: int,
    _: User = Depends(get_current_user),
):
    """Return URL of the latest live screenshot for an employee."""
    key = f"live_screenshots/{employee_id}/current.jpg"
    if not storage.object_exists(key):
        return {"url": None}
    # Make live_screenshots public too
    url = f"{storage.settings.MINIO_PUBLIC_ENDPOINT or 'http://localhost:9000'}/{storage.settings.MINIO_BUCKET}/{key}"
    return {"url": url, "key": key}


@router.get("/screenshots")
async def get_all_live_screenshots(
    _: User = Depends(get_current_user),
):
    """Return URLs for all employees that have a current screenshot."""
    keys = storage.list_objects_with_prefix("live_screenshots/")
    result = {}
    for key in keys:
        if key.endswith("/current.jpg"):
            emp_id = key.split("/")[1]
            url = f"{storage.settings.MINIO_PUBLIC_ENDPOINT or 'http://localhost:9000'}/{storage.settings.MINIO_BUCKET}/{key}"
            result[emp_id] = url
    return result
