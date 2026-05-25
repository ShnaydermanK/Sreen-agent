from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://sa:sa_password@localhost:5432/screenagent"
    REDIS_URL: str = "redis://localhost:6379/0"

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET: str = "screen-agent-videos"
    MINIO_SECURE: bool = False
    MINIO_PUBLIC_ENDPOINT: str = "http://localhost:9000"  # public URL for browser presigned links

    SECRET_KEY: str = "dev-secret-key"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    BACKEND_HOST: str = "http://localhost:8000"
    AGENT_LATEST_VERSION: str = "1.0.0"
    AGENT_DOWNLOAD_URL: str = ""

    # Alert notifications
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_CHAT_ID: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    ALERT_EMAIL_TO: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
