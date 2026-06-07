from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

HOME_SYSTEM_TEMPLATE_KEY = "system_home"
HOME_SYSTEM_TEMPLATE_VERSION = 1
HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN = 2
HOME_VIEW_DEFAULT_CARD_COLLAPSED_ROW_SPAN = 1
HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN = 4

HomeViewCardId = Literal[
    "timeframe",
    "exchanges",
    "calendar",
    "prices",
    "news",
    "map",
    "documents",
    "communication",
    "prompt",
]
HomeViewCardKind = Literal[
    "desk_time",
    "exchange_sessions",
    "calendar",
    "market_prices",
    "market_news",
    "asset_map",
    "document_upload",
    "communication_center",
    "assistant_prompt",
]


@dataclass(frozen=True)
class HomeViewCardRegistryEntry:
    card_id: HomeViewCardId
    kind: HomeViewCardKind
    label: str
    default_visible: bool
    default_column_span: int
    default_row_span: int
    allowed_parameters: tuple[str, ...]
    allowed_filter_fields: tuple[str, ...]
    data_bindings: tuple[str, ...]
    default_data_bindings: tuple[str, ...] | None = None

    def system_data_bindings(self) -> tuple[str, ...]:
        if self.default_data_bindings is None:
            return self.data_bindings
        return self.default_data_bindings


HOME_VIEW_CARD_REGISTRY: tuple[HomeViewCardRegistryEntry, ...] = (
    HomeViewCardRegistryEntry(
        card_id="timeframe",
        kind="desk_time",
        label="Desk Time",
        default_visible=True,
        default_column_span=HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN,
        default_row_span=HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN,
        allowed_parameters=("calendar_display", "time_zone"),
        allowed_filter_fields=("calendar_source",),
        data_bindings=("calendar_events", "user_events"),
        default_data_bindings=(),
    ),
    HomeViewCardRegistryEntry(
        card_id="exchanges",
        kind="exchange_sessions",
        label="Exchanges",
        default_visible=True,
        default_column_span=HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN,
        default_row_span=HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN,
        allowed_parameters=("time_zone",),
        allowed_filter_fields=("region",),
        data_bindings=(),
    ),
    HomeViewCardRegistryEntry(
        card_id="calendar",
        kind="calendar",
        label="Calendar",
        default_visible=True,
        default_column_span=HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN,
        default_row_span=HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN,
        allowed_parameters=("calendar_display", "time_zone"),
        allowed_filter_fields=("calendar_source",),
        data_bindings=("calendar_events", "user_events"),
    ),
    HomeViewCardRegistryEntry(
        card_id="prices",
        kind="market_prices",
        label="Market Prices",
        default_visible=True,
        default_column_span=HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN,
        default_row_span=HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN,
        allowed_parameters=("price_mark_status", "price_sort"),
        allowed_filter_fields=(
            "commodity_code",
            "location_code",
            "price_index_code",
            "provider",
            "quote_type",
            "region",
        ),
        data_bindings=("latest_price_marks", "market_price_indices"),
    ),
    HomeViewCardRegistryEntry(
        card_id="news",
        kind="market_news",
        label="Market News",
        default_visible=True,
        default_column_span=HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN,
        default_row_span=HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN,
        allowed_parameters=("news_limit", "news_lookback_days", "news_query"),
        allowed_filter_fields=(
            "commodity_code",
            "location_code",
            "price_index_code",
            "provider",
            "quote_type",
            "region",
        ),
        data_bindings=("market_news_headlines", "market_price_indices"),
    ),
    HomeViewCardRegistryEntry(
        card_id="map",
        kind="asset_map",
        label="Asset map",
        default_visible=True,
        default_column_span=HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN,
        default_row_span=HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN,
        allowed_parameters=("map_record_limit", "weather_overlays"),
        allowed_filter_fields=("commodity_code", "geography", "location_code", "region"),
        data_bindings=("asset_map", "spatial_features", "weather_overlays"),
    ),
    HomeViewCardRegistryEntry(
        card_id="documents",
        kind="document_upload",
        label="Upload documents",
        default_visible=True,
        default_column_span=HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN,
        default_row_span=HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN,
        allowed_parameters=(),
        allowed_filter_fields=("document_kind", "review_status"),
        data_bindings=("document_ingestion",),
    ),
    HomeViewCardRegistryEntry(
        card_id="communication",
        kind="communication_center",
        label="Communication center",
        default_visible=True,
        default_column_span=HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN,
        default_row_span=HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN,
        allowed_parameters=(),
        allowed_filter_fields=("message_category", "workflow_category"),
        data_bindings=("message_threads", "operator_attention_counts"),
    ),
    HomeViewCardRegistryEntry(
        card_id="prompt",
        kind="assistant_prompt",
        label="Desk Assistant",
        default_visible=True,
        default_column_span=HOME_VIEW_DEFAULT_CARD_COLUMN_SPAN,
        default_row_span=HOME_VIEW_DEFAULT_CARD_EXPANDED_ROW_SPAN,
        allowed_parameters=("default_summary_targets", "starter_kit"),
        allowed_filter_fields=("workflow_category",),
        data_bindings=("assistant_conversation", "operator_attention_counts"),
    ),
)

HOME_VIEW_CARD_REGISTRY_BY_ID = {entry.card_id: entry for entry in HOME_VIEW_CARD_REGISTRY}


def get_home_view_card_registry_entry(card_id: HomeViewCardId) -> HomeViewCardRegistryEntry:
    return HOME_VIEW_CARD_REGISTRY_BY_ID[card_id]
