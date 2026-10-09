"""NotifyHub FastAPI application entry point."""

from fastapi import Depends, FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.exceptions import DailyLimitExceeded

from app.db import get_db
from app.deps import get_current_client
from app.routers import (
    admin,
    console_auth,
    console_client,
    console_keys,
    console_plan,
    deliveries,
    event_types,
    events,
    metrics,
    recipients,
    stats,
    templates,
)

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="NotifyHub API",
    description="Multi-tenant email notification service with durable PostgreSQL queue.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(DailyLimitExceeded)
def daily_limit_handler(request: Request, exc: DailyLimitExceeded):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "retry_after_seconds": exc.retry_after_seconds,
        },
        headers=exc.headers,
    )

# Register Routers
app.include_router(console_auth.router)
app.include_router(console_client.router)
app.include_router(console_plan.router)
app.include_router(console_keys.router)
app.include_router(admin.router)
app.include_router(stats.client_stats_router)
app.include_router(stats.admin_stats_router)
app.include_router(events.router)
app.include_router(deliveries.router)
app.include_router(metrics.router)
app.include_router(recipients.router)
app.include_router(templates.router)
app.include_router(event_types.router)


@app.get("/api/me", tags=["Client"])
def get_me(client = Depends(get_current_client)):
    """Returns the authenticated client's tenant profile."""
    return {
        "id": client.id,
        "name": client.name,
        "status": client.status,
        "rate_limit_per_sec": client.rate_limit_per_sec,
        "created_at": client.created_at,
    }


@app.get("/api/health", status_code=status.HTTP_200_OK, tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    """Health check endpoint returning API and database status."""
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
        app_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
        app_status = "degraded"

    return {
        "status": app_status,
        "database": db_status,
    }


@app.get("/console/system/status", tags=["System"])
@app.get("/api/system/status", tags=["System"])
def get_public_system_status(db: Session = Depends(get_db)):
    """Returns platform operational and maintenance status for clients."""
    from app.models import SystemStatus
    st = db.query(SystemStatus).filter(SystemStatus.key == "maintenance_mode").first()
    maintenance_mode = (st.value.lower() == "true") if st and st.value else False
    return {
        "maintenance_mode": maintenance_mode,
        "status": "maintenance" if maintenance_mode else "operational",
        "message": "Platform maintenance is currently active. New email queueing is temporarily paused while upgrades are in progress.",
    }

