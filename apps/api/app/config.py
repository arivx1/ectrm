import re
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


LOOPBACK_CORS_HOSTS = frozenset({"localhost", "127.0.0.1"})
LOOPBACK_CORS_ORIGIN_REGEX = r"^https?://(?:localhost|127\.0\.0\.1)(?::\d+)?$"

DEFAULT_CORS_ALLOW_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)
API_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def _origin_is_loopback(origin: str) -> bool:
    parsed = urlparse(origin)
    return parsed.scheme in {"http", "https"} and (parsed.hostname or "").strip().lower() in LOOPBACK_CORS_HOSTS


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
    DOCUMENT_STORAGE_ROOT: Path = API_ENV_FILE.parent / ".data" / "documents"
    DOCUMENT_MAX_UPLOAD_BYTES: int = Field(default=25 * 1024 * 1024, ge=1, le=250 * 1024 * 1024)
    DOCUMENT_PAGE_RENDER_DPI: int = Field(default=144, ge=72, le=300)
    DOCUMENT_OCR_ENABLED: bool = True
    DOCUMENT_AI_ENABLED: bool = True
    DOCUMENT_AI_DEFAULT_PROVIDER: str = "openai"
    DOCUMENT_AI_TIMEOUT_SECONDS: int = Field(default=120, ge=5, le=600)
    DOCUMENT_AI_MAX_OUTPUT_TOKENS: int = Field(default=3200, ge=256, le=8192)
    DOCUMENT_AI_OPENAI_INLINE_FILE_MAX_BYTES: int = Field(default=8 * 1024 * 1024, ge=0, le=50 * 1024 * 1024)
    DOCUMENT_AI_OPENAI_MODEL: str = ""
    DOCUMENT_AI_ANTHROPIC_MODEL: str = ""
    DOCUMENT_AI_GOOGLE_MODEL: str = ""
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
    ASSISTANT_AGENT_DAILY_TOKEN_ALLOCATION: int = Field(default=100_000, ge=0, le=100_000_000)
    CODEX_TASKS_ENABLED: bool = False
    CODEX_GITHUB_REPOSITORY: str = ""
    CODEX_GITHUB_WORKFLOW_ID: str = ""
    CODEX_GITHUB_REF: str = "main"
    CODEX_GITHUB_PROMPT_INPUT: str = "prompt"
    CODEX_GITHUB_TOKEN: str = ""
    CODEX_REQUEST_TIMEOUT_SECONDS: int = Field(default=20, ge=5, le=120)
    CODEX_CALLBACK_BASE_URL: str = ""
    CODEX_CALLBACK_TOKEN: str = ""
    CODEX_LONG_RUNNING_DEFAULT_MAX_ITERATIONS: int = Field(default=5, ge=2, le=25)
    CODEX_LONG_RUNNING_MAX_ITERATIONS: int = Field(default=10, ge=2, le=50)
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_MODEL: str = "gpt-5-mini"
    OPENAI_AGENT_BUILDER_MODEL: str = ""
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_BASE_URL: str = "https://api.anthropic.com"
    ANTHROPIC_MODEL: str = "claude-sonnet-4-5"
    GOOGLE_API_KEY: str = ""
    GOOGLE_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GOOGLE_MODEL: str = "gemini-2.5-flash"
    EIA_API_KEY: str = ""
    EIA_BASE_URL: str = "https://api.eia.gov/v2"
    EIA_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)
    EIA_SYNC_INTERVAL_MINUTES: int = Field(default=360, ge=5, le=10080)
    EIA_SYNC_DEFAULT_LOOKBACK_DAYS: int = Field(default=30, ge=1, le=3650)
    EIA_SYNC_SUCCESS_SLA_HOURS: int = Field(default=48, ge=1, le=336)
    EIA_FUNDAMENTALS_SYNC_INTERVAL_MINUTES: int = Field(default=1440, ge=5, le=10080)
    EIA_FUNDAMENTALS_SYNC_DEFAULT_LOOKBACK_DAYS: int = Field(default=120, ge=1, le=3650)
    EIA_FUNDAMENTALS_SYNC_SUCCESS_SLA_HOURS: int = Field(default=240, ge=1, le=336)
    FRED_API_KEY: str = ""
    FRED_BASE_URL: str = "https://api.stlouisfed.org/fred"
    FRED_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)
    FRED_SYNC_INTERVAL_MINUTES: int = Field(default=360, ge=5, le=10080)
    FRED_SYNC_DEFAULT_LOOKBACK_DAYS: int = Field(default=30, ge=1, le=3650)
    FRED_SYNC_SUCCESS_SLA_HOURS: int = Field(default=48, ge=1, le=336)
    CFTC_BASE_URL: str = "https://publicreporting.cftc.gov"
    CFTC_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)
    CFTC_SYNC_INTERVAL_MINUTES: int = Field(default=1440, ge=5, le=10080)
    CFTC_SYNC_DEFAULT_LOOKBACK_DAYS: int = Field(default=60, ge=1, le=3650)
    CFTC_SYNC_SUCCESS_SLA_HOURS: int = Field(default=192, ge=1, le=336)
    CAISO_BASE_URL: str = "https://oasis.caiso.com/oasisapi"
    CAISO_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)
    CAISO_SYNC_INTERVAL_MINUTES: int = Field(default=15, ge=5, le=1440)
    CAISO_SYNC_SUCCESS_SLA_HOURS: int = Field(default=2, ge=1, le=24)
    ERCOT_BASE_URL: str = "https://www.ercot.com/content/cdr/html"
    ERCOT_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)
    ERCOT_SYNC_INTERVAL_MINUTES: int = Field(default=15, ge=5, le=1440)
    ERCOT_SYNC_SUCCESS_SLA_HOURS: int = Field(default=2, ge=1, le=24)
    KALSHI_BASE_URL: str = "https://api.elections.kalshi.com/trade-api/v2"
    KALSHI_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)
    KALSHI_SYNC_INTERVAL_MINUTES: int = Field(default=360, ge=5, le=10080)
    KALSHI_DEFAULT_LOOKBACK_DAYS: int = Field(default=90, ge=1, le=3650)
    KALSHI_SYNC_SUCCESS_SLA_HOURS: int = Field(default=24, ge=1, le=336)
    NWS_BASE_URL: str = "https://api.weather.gov"
    NWS_USER_AGENT: str = ""
    NWS_TIMEOUT_SECONDS: int = Field(default=30, ge=1, le=300)
    NWS_SYNC_INTERVAL_MINUTES: int = Field(default=60, ge=1, le=1440)
    NWS_SYNC_OBSERVATION_LIMIT: int = Field(default=24, ge=1, le=168)
    NWS_SYNC_SUCCESS_SLA_HOURS: int = Field(default=6, ge=1, le=168)
    NWS_FORECAST_FRESHNESS_HOURS: int = Field(default=8, ge=1, le=168)
    NWS_OBSERVATION_FRESHNESS_HOURS: int = Field(default=4, ge=1, le=168)
    PROJECTION_MONITORING_EMAIL_RECIPIENTS: str = ""
    PROJECTION_MONITORING_EMAIL_FROM: str = "projection-monitoring@localhost"
    PROJECTION_MONITORING_EMAIL_SMTP_HOST: str = ""
    PROJECTION_MONITORING_EMAIL_SMTP_PORT: int = Field(default=587, ge=1, le=65535)
    PROJECTION_MONITORING_EMAIL_SMTP_USERNAME: str = ""
    PROJECTION_MONITORING_EMAIL_SMTP_PASSWORD: str = ""
    PROJECTION_MONITORING_EMAIL_SMTP_USE_STARTTLS: bool = True
    PROJECTION_MONITORING_EMAIL_TIMEOUT_SECONDS: int = Field(default=10, ge=1, le=60)
    PROJECTION_MONITORING_SLACK_WEBHOOK_URL: str = ""
    PROJECTION_MONITORING_SLACK_CHANNEL: str = "#projection-monitoring"
    PROJECTION_MONITORING_SLACK_TIMEOUT_SECONDS: int = Field(default=10, ge=1, le=60)
    PROJECTION_MONITORING_INCIDENT_QUEUE_NAME: str = "projection-monitoring"
    PROJECTION_MONITORING_INCIDENT_WEBHOOK_URL: str = ""
    PROJECTION_MONITORING_INCIDENT_TIMEOUT_SECONDS: int = Field(default=10, ge=1, le=60)

    @property
    def cors_allow_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]

    @property
    def cors_allow_origin_regex(self) -> str | None:
        return LOOPBACK_CORS_ORIGIN_REGEX if any(_origin_is_loopback(origin) for origin in self.cors_allow_origins) else None

    @property
    def projection_monitoring_email_recipients(self) -> list[str]:
        return [
            recipient.strip().lower()
            for recipient in self.PROJECTION_MONITORING_EMAIL_RECIPIENTS.split(",")
            if recipient.strip()
        ]

    def is_cors_origin_allowed(self, origin: str | None) -> bool:
        if origin is None:
            return False

        normalized = origin.strip()
        if not normalized:
            return False

        if normalized in self.cors_allow_origins:
            return True

        regex = self.cors_allow_origin_regex
        return bool(regex and re.fullmatch(regex, normalized))


settings = Settings()
