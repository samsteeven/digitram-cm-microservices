import redis.asyncio as aioredis
from app.config import settings

redis_client = None


async def connect_redis():
    global redis_client
    redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)


async def close_redis():
    global redis_client
    if redis_client:
        await redis_client.close()
        redis_client = None


def get_redis():
    if redis_client is None:
        raise RuntimeError("Redis non initialisé.")
    return redis_client
