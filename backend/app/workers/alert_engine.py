"""
Alert engine — runs as a periodic Celery Beat task.
Checks for: long idle, agent offline, recording error.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

IDLE_ALERT_THRESHOLD_MIN = 30      # alert if idle > 30 min during work hours
OFFLINE_ALERT_THRESHOLD_MIN = 10   # alert if no heartbeat > 10 min
WORK_HOURS = (8, 19)               # 08:00–19:00


def _notify_alert(alert_type: str, employee_id: int, message: str, db) -> None:
    """Fire-and-forget Telegram notification (sync context inside Celery)."""
    try:
        from app.services.notifications import format_alert_message, send_email
        from app.models.employee import Employee
        emp = db.get(Employee, employee_id)
        emp_name = emp.full_name if emp else f"#{employee_id}"
        text = format_alert_message(alert_type, emp_name, message)
        # Telegram — run in thread to avoid blocking
        import threading
        def _tg():
            import asyncio
            asyncio.run(_send_tg(text))
        threading.Thread(target=_tg, daemon=True).start()
        # Email — synchronous
        send_email(f"[Screen Agent] {alert_type}", text.replace("<b>", "").replace("</b>", "").replace("<code>", "").replace("</code>", ""))
    except Exception as e:
        logger.warning(f"Notification failed: {e}")


async def _send_tg(text: str):
    from app.services.notifications import send_telegram
    await send_telegram(text)


def _is_work_hours() -> bool:
    hour = datetime.now().hour
    return WORK_HOURS[0] <= hour < WORK_HOURS[1]


@celery_app.task(name="app.workers.alert_engine.check_alerts")
def check_alerts():
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import Session
    from app.core.config import settings
    from app.models.agent import Agent
    from app.models.employee import Employee
    from app.models.alert import Alert
    from app.models.activity import ActivityEvent

    engine = create_engine(settings.DATABASE_URL.replace("+asyncpg", ""))
    now = datetime.now(timezone.utc)

    with Session(engine) as db:
        # --- Check: agent offline ---
        threshold = now - timedelta(minutes=OFFLINE_ALERT_THRESHOLD_MIN)
        agents = db.execute(select(Agent)).scalars().all()
        for agent in agents:
            if agent.status in ("offline", "error"):
                continue
            if agent.last_seen_at and agent.last_seen_at < threshold:
                # Check if we already have an unresolved alert
                existing = db.execute(
                    select(Alert).where(
                        Alert.employee_id == agent.employee_id,
                        Alert.type == "agent_offline",
                        Alert.is_resolved == False,
                    )
                ).scalar_one_or_none()
                if not existing:
                    alert = Alert(
                        employee_id=agent.employee_id,
                        type="agent_offline",
                        severity="warning",
                        message=f"Агент не выходил на связь более {OFFLINE_ALERT_THRESHOLD_MIN} мин",
                        payload={"agent_id": agent.id, "last_seen": agent.last_seen_at.isoformat() if agent.last_seen_at else None},
                    )
                    db.add(alert)
                    logger.info(f"Alert: agent_offline for employee {agent.employee_id}")
                    _notify_alert("agent_offline", agent.employee_id, alert.message or "", db)
                # Mark agent as offline
                agent.status = "offline"

            elif agent.last_seen_at and agent.last_seen_at >= threshold:
                # Agent is back online — resolve offline alerts
                db.execute(
                    select(Alert).where(
                        Alert.employee_id == agent.employee_id,
                        Alert.type == "agent_offline",
                        Alert.is_resolved == False,
                    )
                )
                offline_alerts = db.execute(
                    select(Alert).where(
                        Alert.employee_id == agent.employee_id,
                        Alert.type == "agent_offline",
                        Alert.is_resolved == False,
                    )
                ).scalars().all()
                for a in offline_alerts:
                    a.is_resolved = True
                    a.resolved_at = now

        # --- Check: long idle (only during work hours) ---
        if _is_work_hours():
            idle_threshold = now - timedelta(minutes=IDLE_ALERT_THRESHOLD_MIN)
            # Find employees whose last event was idle_start > threshold ago
            online_agents = db.execute(
                select(Agent).where(Agent.status.in_(["recording", "online"]))
            ).scalars().all()

            for agent in online_agents:
                # Get last activity event for this employee
                last_event = db.execute(
                    select(ActivityEvent)
                    .where(ActivityEvent.employee_id == agent.employee_id)
                    .order_by(ActivityEvent.ts.desc())
                    .limit(1)
                ).scalar_one_or_none()

                if last_event and last_event.event_type == "idle_start":
                    if last_event.ts < idle_threshold:
                        existing = db.execute(
                            select(Alert).where(
                                Alert.employee_id == agent.employee_id,
                                Alert.type == "long_idle",
                                Alert.is_resolved == False,
                            )
                        ).scalar_one_or_none()
                        if not existing:
                            idle_min = int((now - last_event.ts).total_seconds() / 60)
                            alert = Alert(
                                employee_id=agent.employee_id,
                                type="long_idle",
                                severity="warning",
                                message=f"Сотрудник не активен {idle_min} мин",
                                payload={"idle_since": last_event.ts.isoformat(), "minutes": idle_min},
                            )
                            db.add(alert)
                            logger.info(f"Alert: long_idle for employee {agent.employee_id} ({idle_min} min)")

                elif last_event and last_event.event_type not in ("idle_start",):
                    # Employee is active — resolve long_idle alerts
                    idle_alerts = db.execute(
                        select(Alert).where(
                            Alert.employee_id == agent.employee_id,
                            Alert.type == "long_idle",
                            Alert.is_resolved == False,
                        )
                    ).scalars().all()
                    for a in idle_alerts:
                        a.is_resolved = True
                        a.resolved_at = now

        db.commit()
    engine.dispose()
