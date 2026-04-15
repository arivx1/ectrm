from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter, FastAPI

from apps.api.app.domains.accruals.routes import router as accruals_router
from apps.api.app.domains.operations.routes import router as operations_router
from apps.api.app.domains.reports.routes import router as reports_router
from apps.api.app.domains.settlement.routes import router as settlement_router
from apps.api.app.routes.admin_data import admin_router as admin_data_router
from apps.api.app.routes.assistant import admin_router as assistant_admin_router
from apps.api.app.routes.assistant import router as assistant_router
from apps.api.app.routes.auth import router as auth_router
from apps.api.app.routes.documents import router as documents_router
from apps.api.app.routes.events import router as events_router
from apps.api.app.routes.external_data import admin_router as external_data_admin_router
from apps.api.app.routes.external_data import router as external_data_router
from apps.api.app.routes.layout_definitions import router as layout_definitions_router
from apps.api.app.routes.option_exposures import router as option_exposures_router
from apps.api.app.routes.positions import router as positions_router
from apps.api.app.routes.pretrade import router as pretrade_router
from apps.api.app.routes.reference_data import router as reference_data_router
from apps.api.app.routes.roadmap import admin_router as roadmap_admin_router
from apps.api.app.routes.roadmap import router as roadmap_router
from apps.api.app.routes.trades import router as trades_router
from apps.api.app.routes.trading_sources import admin_router as trading_sources_admin_router
from apps.api.app.routes.users import router as users_router
from apps.api.app.routes.weather import admin_router as weather_admin_router
from apps.api.app.routes.weather import router as weather_router


@dataclass(frozen=True)
class HttpRouteRegistration:
    domain: str
    name: str
    router: APIRouter


HTTP_ROUTE_REGISTRATIONS: tuple[HttpRouteRegistration, ...] = (
    HttpRouteRegistration(domain="auth", name="auth", router=auth_router),
    HttpRouteRegistration(domain="operations", name="operations", router=operations_router),
    HttpRouteRegistration(domain="events", name="events", router=events_router),
    HttpRouteRegistration(domain="layout", name="layout-definitions", router=layout_definitions_router),
    HttpRouteRegistration(domain="accruals", name="accruals", router=accruals_router),
    HttpRouteRegistration(domain="reference-data", name="reference-data", router=reference_data_router),
    HttpRouteRegistration(domain="admin", name="admin-data", router=admin_data_router),
    HttpRouteRegistration(domain="admin", name="trading-sources-admin", router=trading_sources_admin_router),
    HttpRouteRegistration(domain="external-data", name="external-data", router=external_data_router),
    HttpRouteRegistration(domain="admin", name="external-data-admin", router=external_data_admin_router),
    HttpRouteRegistration(domain="assistant", name="assistant", router=assistant_router),
    HttpRouteRegistration(domain="assistant", name="assistant-admin", router=assistant_admin_router),
    HttpRouteRegistration(domain="trading", name="trades", router=trades_router),
    HttpRouteRegistration(domain="pretrade", name="pretrade", router=pretrade_router),
    HttpRouteRegistration(domain="risk", name="option-exposures", router=option_exposures_router),
    HttpRouteRegistration(domain="risk", name="positions", router=positions_router),
    HttpRouteRegistration(domain="documents", name="documents", router=documents_router),
    HttpRouteRegistration(domain="settlement", name="settlement", router=settlement_router),
    HttpRouteRegistration(domain="roadmap", name="roadmap", router=roadmap_router),
    HttpRouteRegistration(domain="roadmap", name="roadmap-admin", router=roadmap_admin_router),
    HttpRouteRegistration(domain="reports", name="reports", router=reports_router),
    HttpRouteRegistration(domain="admin", name="users", router=users_router),
    HttpRouteRegistration(domain="weather", name="weather", router=weather_router),
    HttpRouteRegistration(domain="weather", name="weather-admin", router=weather_admin_router),
)


def include_http_routers(app: FastAPI) -> None:
    for registration in HTTP_ROUTE_REGISTRATIONS:
        app.include_router(registration.router)


__all__ = [
    "HttpRouteRegistration",
    "HTTP_ROUTE_REGISTRATIONS",
    "include_http_routers",
]
