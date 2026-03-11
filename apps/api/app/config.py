from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ALLOW_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_VERSION: str = "0.0.0-dev"
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ectrm"
    CORS_ALLOW_ORIGINS: str = ",".join(DEFAULT_CORS_ALLOW_ORIGINS)
    MUTATION_API_TOKEN: str = ""
    BOOTSTRAP_ADMIN_TOKEN: str = ""
    SESSION_TTL_HOURS: int = Field(default=12, ge=1, le=168)
    EIA_API_KEY: str = ""
    EIA_BASE_URL: str = "https://api.eia.gov/v2"
    EIA_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)

    @property
    def cors_allow_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]


settings = Settings()
