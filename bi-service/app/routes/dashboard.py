import json
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


@router.get("/global")
async def get_global_dashboard(
    _=Depends(require_role(["admin", "manager", "analyste"])),
):
    cache_key = f"bi:dashboard:global:{datetime.utcnow().strftime('%Y-%m-%d-%H')}"

    async def fetch():
        db = get_db()
        async with db.acquire() as conn:
            erp_stats = await conn.fetchrow("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'active') AS active_employees,
                    COALESCE(SUM(salary) FILTER (WHERE status = 'active'), 0) AS total_payroll,
                    COUNT(DISTINCT department) AS departments
                FROM erp_db.employees
            """)

            crm_stats = await conn.fetchrow("""
                SELECT
                    COUNT(*) AS orders_today,
                    COALESCE(SUM(total_amount), 0) AS revenue_today,
                    COUNT(DISTINCT customer_id) AS unique_customers_today
                FROM crm_db.orders
                WHERE DATE(ordered_at) = CURRENT_DATE
            """)

            supply_stats = await conn.fetchrow("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'in_transit') AS shipments_in_transit,
                    COUNT(*) FILTER (WHERE status = 'delayed') AS shipments_delayed,
                    COUNT(*) FILTER (WHERE synced = false) AS pending_sync
                FROM supply_db.shipments
            """)

        return {
            "generated_at": datetime.utcnow().isoformat(),
            "erp": dict(erp_stats) if erp_stats else {},
            "crm": dict(crm_stats) if crm_stats else {},
            "supply_chain": dict(supply_stats) if supply_stats else {},
        }

    data, from_cache = await cached_query(cache_key, fetch)
    return {**data, "cached": from_cache}


@router.get("/revenue")
async def get_revenue(
    period: str = Query(default="30d"),
    _=Depends(require_role(["admin", "manager", "analyste"])),
):
    days = {"7d": 7, "30d": 30, "90d": 90}.get(period, 30)
    cache_key = f"bi:dashboard:revenue:{period}:{date.today().isoformat()}"

    async def fetch():
        db = get_db()
        async with db.acquire() as conn:
            rows = await conn.fetch(
                f"""SELECT DATE(ordered_at) AS date,
                           restaurant,
                           COUNT(*) AS orders_count,
                           COALESCE(SUM(total_amount), 0) AS revenue,
                           AVG(total_amount) AS avg_basket
                    FROM crm_db.orders
                    WHERE ordered_at >= NOW() - INTERVAL '{days} days'
                      AND status != 'cancelled'
                    GROUP BY DATE(ordered_at), restaurant
                    ORDER BY date DESC, revenue DESC"""
            )
            return {"period": period, "days": days, "series": [dict(r) for r in rows]}

    data, from_cache = await cached_query(cache_key, fetch)
    return {**data, "cached": from_cache}
