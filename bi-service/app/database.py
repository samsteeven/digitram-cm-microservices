import asyncpg

from app.config import settings

pool = None


async def connect_db():
    global pool
    pool = await asyncpg.create_pool(
        host=settings.DB_HOST,
        port=settings.DB_PORT,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        database=settings.DB_NAME,
        min_size=2,
        max_size=10,
    )


async def close_db():
    global pool
    if pool:
        await pool.close()
        pool = None


def get_db():
    if pool is None:
        raise RuntimeError("Base de données non initialisée.")
    return pool
