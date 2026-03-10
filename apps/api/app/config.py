from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ectrm"
    EIA_API_KEY: str = ""
    EIA_BASE_URL: str = "https://api.eia.gov/v2"
    EIA_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)

settings = Settings()
