from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ALLOW_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
API_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(API_ENV_FILE), extra="ignore")

    APP_VERSION: str = "0.0.0-dev"
    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/ectrm"
    CORS_ALLOW_ORIGINS: str = ",".join(DEFAULT_CORS_ALLOW_ORIGINS)
    MUTATION_API_TOKEN: str = ""
    BOOTSTRAP_ADMIN_TOKEN: str = ""
    SINGLE_USER_AUTH_ENABLED: bool = False
    SINGLE_USER_AUTH_USER_ID: str = "local_admin"
    SINGLE_USER_AUTH_EMAIL: str = "local-admin@example.com"
    SINGLE_USER_AUTH_DISPLAY_NAME: str = "Local Admin"
    GOOGLE_AUTH_ENABLED: bool = False
    GOOGLE_AUTH_CLIENT_ID: str = ""
    GOOGLE_AUTH_AUTO_CREATE_USERS: bool = False
    GOOGLE_AUTH_DEFAULT_ROLE: str = "TRADER"
    GOOGLE_AUTH_TIMEOUT_SECONDS: int = Field(default=10, ge=1, le=60)
    GOOGLE_AUTH_TOKENINFO_URL: str = "https://oauth2.googleapis.com/tokeninfo"
    SESSION_TTL_HOURS: int = Field(default=12, ge=1, le=168)
    ASSISTANT_ENABLED: bool = True
    ASSISTANT_DEFAULT_PROVIDER: str = "openai"
    ASSISTANT_SYSTEM_PROMPT: str = (
        "You are the E/CTRM assistant. Help operators understand trades, positions, "
        "events, reference data, and runtime settings. Use the provided application "
        "context as the source of truth and say clearly when more context is needed."
    )
    ASSISTANT_COMPANY_NAME: str = "ECTRM"
    ASSISTANT_COMPANY_CONTEXT: str = (
        "ECTRM is a prototype commodity trading and risk platform for traders, "
        "operations, risk, data stewards, and administrators. The organization values "
        "auditability, explainability, governed reference data, and exposure visibility."
    )
    ASSISTANT_BUSINESS_CONTEXT: str = (
        "The operating model is event-led. Trade capture, amendments, cancellations, "
        "projection rebuilds, reference data stewardship, user administration, and "
        "external market-data ingestion are treated as explicit workflows instead of "
        "implicit row edits."
    )
    ASSISTANT_TIMEOUT_SECONDS: int = Field(default=60, ge=5, le=300)
    ASSISTANT_MAX_OUTPUT_TOKENS: int = Field(default=1200, ge=128, le=8192)
    ASSISTANT_MAX_TOOL_ROUNDS: int = Field(default=4, ge=0, le=12)
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-5-mini"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_BASE_URL: str = "https://api.anthropic.com"
    ANTHROPIC_MODEL: str = "claude-sonnet-4-5"
    GOOGLE_API_KEY: str = ""
    GOOGLE_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GOOGLE_MODEL: str = "gemini-2.5-flash"
    EIA_API_KEY: str = ""
    EIA_BASE_URL: str = "https://api.eia.gov/v2"
    EIA_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)
    NWS_BASE_URL: str = "https://api.weather.gov"
    NWS_USER_AGENT: str = ""
    NWS_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)

    @property
    def cors_allow_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]


settings = Settings()
