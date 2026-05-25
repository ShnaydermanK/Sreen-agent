import io
from datetime import timedelta
from typing import BinaryIO, Optional

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

_client: Optional[Minio] = None


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


def build_video_key(employee_id: int, segment_id: int, filename: str) -> str:
    return f"videos/{employee_id}/{segment_id}/{filename}"


def build_hls_key(employee_id: int, segment_id: int) -> str:
    return f"hls/{employee_id}/{segment_id}/playlist.m3u8"


def build_thumbnail_key(employee_id: int, segment_id: int) -> str:
    return f"thumbnails/{employee_id}/{segment_id}/thumb.jpg"


def upload_file(key: str, data: BinaryIO, size: int, content_type: str = "application/octet-stream") -> None:
    client = get_minio_client()
    client.put_object(
        settings.MINIO_BUCKET,
        key,
        data,
        size,
        content_type=content_type,
    )


def upload_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    client = get_minio_client()
    client.put_object(
        settings.MINIO_BUCKET,
        key,
        io.BytesIO(data),
        len(data),
        content_type=content_type,
    )


_PUBLIC_PREFIXES = ("hls/", "thumbnails/", "live_screenshots/")


def get_presigned_url(key: str, expires: timedelta = timedelta(minutes=30)) -> str:
    # HLS and thumbnails are publicly readable — return direct URL (no presigned)
    if any(key.startswith(p) for p in _PUBLIC_PREFIXES):
        public = settings.MINIO_PUBLIC_ENDPOINT or f"http://{settings.MINIO_ENDPOINT}"
        return f"{public}/{settings.MINIO_BUCKET}/{key}"

    # Private objects (raw video) — use presigned URL
    client = get_minio_client()
    url = client.presigned_get_object(settings.MINIO_BUCKET, key, expires=expires)
    if settings.MINIO_PUBLIC_ENDPOINT:
        url = url.replace(f"http://{settings.MINIO_ENDPOINT}", settings.MINIO_PUBLIC_ENDPOINT)
        url = url.replace(f"https://{settings.MINIO_ENDPOINT}", settings.MINIO_PUBLIC_ENDPOINT)
    return url


def object_exists(key: str) -> bool:
    client = get_minio_client()
    try:
        client.stat_object(settings.MINIO_BUCKET, key)
        return True
    except S3Error:
        return False


def list_objects_with_prefix(prefix: str) -> list[str]:
    client = get_minio_client()
    objects = client.list_objects(settings.MINIO_BUCKET, prefix=prefix, recursive=True)
    return [obj.object_name for obj in objects]
