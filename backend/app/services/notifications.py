"""
Alert notification channels: Telegram, Email.
Configure in .env or docker-compose environment.
"""
import logging
import smtplib
from email.message import EmailMessage

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_telegram(message: str) -> bool:
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_CHAT_ID:
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": settings.TELEGRAM_CHAT_ID, "text": message, "parse_mode": "HTML"},
            )
            return resp.status_code == 200
    except Exception as e:
        logger.warning(f"Telegram notification failed: {e}")
        return False


def send_email(subject: str, body: str) -> bool:
    if not settings.SMTP_HOST or not settings.ALERT_EMAIL_TO:
        return False
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_USER or "noreply@screenagent.local"
        msg["To"] = settings.ALERT_EMAIL_TO
        msg.set_content(body)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as smtp:
            if settings.SMTP_USER:
                smtp.starttls()
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
        return True
    except Exception as e:
        logger.warning(f"Email notification failed: {e}")
        return False


def format_alert_message(alert_type: str, employee_name: str, detail: str) -> str:
    icons = {
        "long_idle": "🟡",
        "agent_offline": "🔴",
        "recording_error": "⚠️",
        "buffer_full": "💾",
        "forbidden_app": "🚫",
    }
    icon = icons.get(alert_type, "📢")
    return (
        f"{icon} <b>Screen Agent Alert</b>\n"
        f"Тип: <code>{alert_type}</code>\n"
        f"Сотрудник: {employee_name}\n"
        f"Детали: {detail}"
    )
