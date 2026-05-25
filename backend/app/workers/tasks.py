import io
import logging
import os
import tempfile

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="app.workers.tasks.process_video_segment", max_retries=3)
def process_video_segment(self, segment_id: int):
    """Download video from MinIO, generate thumbnail + HLS, upload back."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from app.core.config import settings
    from app.models.video import VideoSegment
    from app.services import storage, video as video_svc

    sync_db_url = settings.DATABASE_URL.replace("+asyncpg", "")
    engine = create_engine(sync_db_url)

    try:
        with Session(engine) as db:
            seg = db.get(VideoSegment, segment_id)
            if not seg:
                logger.error(f"Segment {segment_id} not found")
                return
            if not seg.file_key:
                logger.error(f"Segment {segment_id} has no file_key")
                return

            logger.info(f"Processing segment {segment_id}: {seg.file_key}")
            seg.status = "processing"
            db.commit()

            client = storage.get_minio_client()

            with tempfile.TemporaryDirectory() as tmpdir:
                video_path = os.path.join(tmpdir, "original.mp4")

                # Download from MinIO
                logger.info(f"Downloading {seg.file_key} from MinIO...")
                client.fget_object(settings.MINIO_BUCKET, seg.file_key, video_path)
                size_mb = os.path.getsize(video_path) / 1024 / 1024
                logger.info(f"Downloaded {size_mb:.1f} MB")

                # Generate thumbnail
                thumb_path = os.path.join(tmpdir, "thumb.jpg")
                thumb_ok = video_svc.generate_thumbnail(video_path, thumb_path)
                if thumb_ok and os.path.exists(thumb_path):
                    thumb_key = storage.build_thumbnail_key(seg.employee_id, seg.id)
                    with open(thumb_path, "rb") as f:
                        data = f.read()
                    storage.upload_bytes(thumb_key, data, "image/jpeg")
                    seg.thumbnail_key = thumb_key
                    logger.info(f"Thumbnail uploaded: {thumb_key}")
                else:
                    logger.warning("Thumbnail generation failed")

                # Convert to HLS
                hls_dir = os.path.join(tmpdir, "hls")
                playlist_path = video_svc.convert_to_hls(video_path, hls_dir)
                if playlist_path and os.path.exists(playlist_path):
                    hls_base_key = f"hls/{seg.employee_id}/{seg.id}"
                    uploaded_count = 0
                    for fname in os.listdir(hls_dir):
                        fpath = os.path.join(hls_dir, fname)
                        if not os.path.isfile(fpath):
                            continue
                        content_type = (
                            "application/vnd.apple.mpegurl" if fname.endswith(".m3u8") else "video/MP2T"
                        )
                        with open(fpath, "rb") as f:
                            data = f.read()
                        storage.upload_bytes(f"{hls_base_key}/{fname}", data, content_type)
                        uploaded_count += 1
                    seg.hls_key = f"{hls_base_key}/playlist.m3u8"
                    logger.info(f"HLS uploaded: {uploaded_count} files to {hls_base_key}/")
                else:
                    logger.warning("HLS conversion failed — video will use direct download fallback")

                # Update duration if missing
                if not seg.duration_sec:
                    duration = video_svc.get_video_duration(video_path)
                    if duration:
                        seg.duration_sec = duration

                seg.status = "ready"
                db.commit()
                logger.info(f"Segment {segment_id} processing complete")

    except Exception as e:
        logger.error(f"Error processing segment {segment_id}: {e}", exc_info=True)
        try:
            with Session(engine) as db:
                seg = db.get(VideoSegment, segment_id)
                if seg:
                    seg.status = "error"
                    db.commit()
        except Exception:
            pass
        raise self.retry(exc=e, countdown=30)
    finally:
        engine.dispose()
