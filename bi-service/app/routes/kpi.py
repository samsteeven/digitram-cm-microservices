import json
import random
from datetime import date, datetime

from fastapi import APIRouter, Depends, Query

from app.config import settings
from app.database import get_db
from app.middleware.user_middleware import require_role
from app.redis_client import get_redis

router = APIRouter()


async def cached_query(cache_key: str, query_fn):
    redis = get_redis()
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached), True
    data = await query_fn()
    await redis.setex(cache_key, settings.CACHE_TTL, json.dumps(data, default=str))
    return data, False


@router.get("/snapshot")
async def get_snapshot(
    date_str: str = Query(default=None, alias="date"),
    _=Depends(require_role(["admin", "manager", "analyste"])),
):
    snap_date = date_str or date.today().isoformat()
    cache_key = f"bi:kpis:snapshot:{snap_date}"

    async def fetch():
        db = get_db()
        async with db.acquire() as conn:
            rows = await conn.fetch(
                "SELECT * FROM kpi_snapshots WHERE snapshot_date = $1 ORDER BY module, metric_name",
                snap_date,
            )
            return {"date": snap_date, "metrics": [dict(r) for r in rows], "count": len(rows)}

    data, from_cache = await cached_query(cache_key, fetch)
    return {**data, "cached": from_cache}


@router.get("/trend")
async def get_trend(
    metric: str = Query(),
    module: str = Query(),
    days: int = Query(default=30),
    _=Depends(require_role(["admin", "manager", "analyste"])),
):
    cache_key = f"bi:kpis:trend:{module}:{metric}:{days}"

    async def fetch():
        db = get_db()
        async with db.acquire() as conn:
            rows = await conn.fetch(
                """SELECT snapshot_date, metric_value, metric_unit
                   FROM kpi_snapshots
                   WHERE metric_name = $1 AND module = $2
                     AND snapshot_date >= CURRENT_DATE - $3::integer
                   ORDER BY snapshot_date ASC""",
                metric, module, days,
            )
            return {"metric": metric, "module": module, "days": days, "series": [dict(r) for r in rows]}

    data, from_cache = await cached_query(cache_key, fetch)
    return {**data, "cached": from_cache}


@router.post("/snapshot", status_code=201)
async def create_snapshot(
    _=Depends(require_role(["admin"])),
):
    import httpx

    today = date.today().isoformat()
    db = get_db()
    metrics = []

    services = {
        "erp": settings.ERP_SERVICE_URL,
        "crm": settings.CRM_SERVICE_URL,
        "supply_chain": settings.SUPPLY_CHAIN_SERVICE_URL,
    }

    online = 0
    async with httpx.AsyncClient(timeout=5.0) as client:
        for name, url in services.items():
            try:
                resp = await client.get(f"{url}/health")
                if resp.json().get("status") == "ok":
                    online += 1
            except Exception:
                pass

    metrics.append({"module": "global", "metric_name": "services_online", "metric_value": online, "metric_unit": "count"})
    metrics.append({"module": "global", "metric_name": "uptime_pct", "metric_value": (online / 3) * 100, "metric_unit": "%"})

    async with db.acquire() as conn:
        for m in metrics:
            await conn.execute(
                """INSERT INTO kpi_snapshots (snapshot_date, module, metric_name, metric_value, metric_unit)
                   VALUES ($1, $2, $3, $4, $5)
                   ON CONFLICT (snapshot_date, module, metric_name)
                   DO UPDATE SET metric_value = EXCLUDED.metric_value, created_at = NOW()""",
                today, m["module"], m["metric_name"], m["metric_value"], m["metric_unit"],
            )

        rows = await conn.fetch(
            "SELECT * FROM kpi_snapshots WHERE snapshot_date = $1 ORDER BY module, metric_name",
            today,
        )

    return {
        "message": "Snapshot manuel créé avec succès.",
        "date": today,
        "metrics_count": len(rows),
        "metrics": [dict(r) for r in rows],
    }


@router.get("/summary")
async def get_summary(
    _=Depends(require_role(["admin", "manager", "analyste"])),
):
    today_str = date.today().isoformat()
    cache_key = f"bi:kpis:summary:{today_str}"

    async def fetch():
        db = get_db()
        async with db.acquire() as conn:
            db_rows = await conn.fetch(
                "SELECT snapshot_date, module, metric_name, metric_value, metric_unit FROM kpi_snapshots WHERE snapshot_date = CURRENT_DATE"
            )

        simulated = {
            "uptime_pct": round(99.5 + random.random() * 0.5, 2),
            "latency_p95_ms": round(150 + random.random() * 350),
            "error_rate_pct": round(random.random() * 2, 2),
            "total_requests_24h": int(5000 + random.random() * 15000),
            "active_users": int(50 + random.random() * 200),
            "generated_at": datetime.utcnow().isoformat(),
        }

        return {
            "date": today_str,
            "simulated": simulated,
            "from_db": [dict(r) for r in db_rows],
        }

    data, from_cache = await cached_query(cache_key, fetch)
    return {**data, "cached": from_cache}
