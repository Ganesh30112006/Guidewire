from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from functools import lru_cache
from urllib.parse import quote_plus


class Settings(BaseSettings):
    # ── App ────────────────────────────────────────────────────────────────────
    APP_NAME: str = "GigGo API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"         # production | staging | development

    # ── MySQL ──────────────────────────────────────────────────────────────────
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_NAME: str = "giggo"
    DB_USER: str = "giggo_user"
    DB_PASSWORD: str                        # Required — no default
    DATABASE_URL_OVERRIDE: str | None = None

    @property
    def DATABASE_URL(self) -> str:
        if self.DATABASE_URL_OVERRIDE:
            return self.DATABASE_URL_OVERRIDE

        db_user = quote_plus(self.DB_USER)
        db_password = quote_plus(self.DB_PASSWORD)
        db_host = self.DB_HOST.strip()

        return (
            f"mysql+aiomysql://{db_user}:{db_password}"
            f"@{db_host}:{self.DB_PORT}/{self.DB_NAME}"
            "?charset=utf8mb4"
        )

    # Sync URL for Alembic migrations only
    @property
    def DATABASE_URL_SYNC(self) -> str:
        if self.DATABASE_URL_OVERRIDE:
            return self.DATABASE_URL_OVERRIDE.replace("mysql+aiomysql", "mysql+pymysql")

        db_user = quote_plus(self.DB_USER)
        db_password = quote_plus(self.DB_PASSWORD)
        db_host = self.DB_HOST.strip()

        return (
            f"mysql+pymysql://{db_user}:{db_password}"
            f"@{db_host}:{self.DB_PORT}/{self.DB_NAME}"
            "?charset=utf8mb4"
        )

    # ── JWT (RS256 — asymmetric keys) ──────────────────────────────────────────
    RSA_PRIVATE_KEY_PATH: str = "keys/private.pem"
    RSA_PUBLIC_KEY_PATH: str = "keys/public.pem"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15       # Short-lived
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── AES-256-GCM (PII encryption) ───────────────────────────────────────────
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    FIELD_ENCRYPTION_KEY: str                   # Required — 64 hex chars (32 bytes)

    @field_validator("FIELD_ENCRYPTION_KEY")
    @classmethod
    def validate_encryption_key(cls, v: str) -> str:
        if len(v) != 64:
            raise ValueError("FIELD_ENCRYPTION_KEY must be 64 hex characters (32 bytes)")
        try:
            bytes.fromhex(v)
        except ValueError:
            raise ValueError("FIELD_ENCRYPTION_KEY must be valid hex")
        return v

    # ── CORS ───────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:4173"]
    ENABLE_CSRF_PROTECTION: bool = True

    # ── Rate limits ────────────────────────────────────────────────────────────
    RATE_LIMIT_LOGIN: str = "10/minute"         # Brute-force protection
    RATE_LIMIT_REGISTER: str = "5/minute"
    RATE_LIMIT_API: str = "300/minute"          # General API

    # ── Brute-force lockout ────────────────────────────────────────────────────
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()
