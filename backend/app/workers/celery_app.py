from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "screen_agent",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_routes={
        "app.workers.tasks.process_video_segment": {"queue": "video_processing"},
        "app.workers.alert_engine.check_alerts": {"queue": "default"},
    },
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule={
        "check-alerts-every-2min": {
            "task": "app.workers.alert_engine.check_alerts",
            "schedule": 120.0,  # every 2 minutes
        },
    },
    include=["app.workers.tasks", "app.workers.alert_engine"],
)
