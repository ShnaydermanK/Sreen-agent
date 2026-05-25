from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agent.router import router as agent_router
from app.api.admin.auth import router as auth_router, users_router
from app.api.admin.employees import router as employees_router, teams_router
from app.api.admin.recordings import router as recordings_router
from app.api.admin.stats import router as stats_router
from app.api.admin.agents_mgmt import router as agents_mgmt_router
from app.api.admin.alerts import router as alerts_router
from app.api.admin.reports import router as reports_router
from app.api.admin.policies import router as policies_router
from app.api.admin.ws_router import router as ws_router
from app.api.admin.audit import router as audit_router
from app.api.admin.live_screenshots import router as live_screenshots_router
from app.api.agent.screenshot import router as agent_screenshot_router
from app.core.database import engine
from app.models import *  # noqa: import all models for Alembic


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Screen Agent API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agent_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(employees_router)
app.include_router(teams_router)
app.include_router(recordings_router)
app.include_router(stats_router)
app.include_router(agents_mgmt_router)
app.include_router(alerts_router)
app.include_router(reports_router)
app.include_router(policies_router)
app.include_router(ws_router)
app.include_router(audit_router)
app.include_router(live_screenshots_router)
app.include_router(agent_screenshot_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}
