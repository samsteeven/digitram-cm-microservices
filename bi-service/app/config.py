import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    ENV: str = os.getenv("NODE_ENV", "development")
    PORT: int = int(os.getenv("PORT", "3004"))

    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: int = int(os.getenv("DB_PORT", "5432"))
    DB_USER: str = os.getenv("DB_USER", "digitrans")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "digitrans_dev_pwd")
    DB_NAME: str = os.getenv("DB_NAME", "bi_db")

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    ERP_SERVICE_URL: str = os.getenv("ERP_SERVICE_URL", "http://erp-service:3001")
    CRM_SERVICE_URL: str = os.getenv("CRM_SERVICE_URL", "http://crm-service:3002")
    SUPPLY_CHAIN_SERVICE_URL: str = os.getenv("SUPPLY_CHAIN_SERVICE_URL", "http://supply-chain-service:3003")

    CACHE_TTL: int = 300

    @property
    def db_dsn(self) -> str:
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


settings = Settings()
