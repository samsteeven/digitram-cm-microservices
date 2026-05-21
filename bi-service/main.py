import os
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from app.config import settings
from app.database import connect_db, close_db
from app.redis_client import connect_redis, close_redis
from app.routes import kpi, dashboard
from app.middleware.user_middleware import UserMiddleware

app = FastAPI(
    title="DIGITRANS-CM — BI Service API",
    version="1.0.0",
    description="API REST pour les tableaux de bord et KPIs AGROCAM S.A.",
    docs_url="/api-docs",
)

app.add_middleware(UserMiddleware)

app.include_router(kpi.router, prefix="/kpis", tags=["BI - KPIs"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["BI - Tableaux de bord"])


@app.get("/health")
async def health():
    return {"service": "bi-service", "status": "ok", "timestamp": __import__("datetime").datetime.utcnow().isoformat()}


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    status = getattr(exc, "status_code", 500)
    detail = str(exc)
    if settings.ENV == "production" and status == 500:
        detail = "Erreur interne."
    return JSONResponse(status_code=status, content={"error": detail})


@app.on_event("startup")
async def startup():
    await connect_db()
    await connect_redis()


@app.on_event("shutdown")
async def shutdown():
    await close_db()
    await close_redis()


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "3004")), reload=settings.ENV != "production")
