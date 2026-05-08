"""Compatibility shim for reports routes."""

from apps.api.app.domains.reports.routes.http import create_settlement_preset
from apps.api.app.domains.reports.routes.http import delete_settlement_preset
from apps.api.app.domains.reports.routes.http import get_activity_summary
from apps.api.app.domains.reports.routes.http import get_cash_forecast
from apps.api.app.domains.reports.routes.http import get_counterparty_credit_report
from apps.api.app.domains.reports.routes.http import get_exposure_summary
from apps.api.app.domains.reports.routes.http import get_pnl_comparison
from apps.api.app.domains.reports.routes.http import get_pnl_history
from apps.api.app.domains.reports.routes.http import get_reporting_overview
from apps.api.app.domains.reports.routes.http import get_settlement_aging_report
from apps.api.app.domains.reports.routes.http import get_settlement_exceptions
from apps.api.app.domains.reports.routes.http import get_settlement_filter_options
from apps.api.app.domains.reports.routes.http import get_settlement_presets
from apps.api.app.domains.reports.routes.http import get_trading_eod_report
from apps.api.app.domains.reports.routes.http import update_settlement_preset
from apps.api.app.domains.reports.routes import router

__all__ = [
    "router",
    "get_exposure_summary",
    "get_activity_summary",
    "get_reporting_overview",
    "get_counterparty_credit_report",
    "get_pnl_history",
    "get_pnl_comparison",
    "get_settlement_aging_report",
    "get_cash_forecast",
    "get_settlement_exceptions",
    "get_settlement_filter_options",
    "get_trading_eod_report",
    "get_settlement_presets",
    "create_settlement_preset",
    "update_settlement_preset",
    "delete_settlement_preset",
]
