"""External market-data services."""

from apps.api.app.domains.reference_data.services.external_data.eia_sync import sync_eia_series

__all__ = ["sync_eia_series"]
