import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { PromptHomeAvailableTokenBadge } from "../src/workspaces/prompt/PromptHomeAvailableTokenBadge";
import type {
  DeliveryRecord,
  PriceIndexObservationRecord,
  PriceIndexRecord,
} from "../src/shared/models";
import { shouldAutoEnsurePromptHomeData } from "../src/workspaces/prompt/promptHomeAutoLoad";
import { summarizePromptHomeAvailableTokens } from "../src/workspaces/prompt/promptHomeAvailableTokens";
import {
  buildPromptHomePricesCardViewModel,
  filterPromptHomeDisplayPriceIndices,
  formatPromptHomePriceDate,
  formatPromptHomePriceDateTime,
  formatPromptHomePriceFrequency,
  formatPromptHomePriceSource,
  formatPromptHomePriceTime,
  formatPromptHomePriceUpdatedAt,
  listPromptHomePriceQuoteTypes,
  listPromptHomePriceProviders,
  nextPromptHomePriceSortState,
  PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER,
  selectPromptHomeDisplayPriceIndices,
  sortPromptHomeDisplayPriceIndices,
} from "../src/workspaces/prompt/promptHomePrices";
import { PromptHomeWorkspace } from "../src/workspaces/prompt/PromptHomeWorkspace";

const defaultCounts = {
  activeTrades: 12,
  openWorkItems: 7,
  operationsQueueItems: 3,
  settlementQueueItems: 2,
  pendingInvoices: 4,
  paymentsDue: 1,
  attentionItems: 5,
  stalePricingItems: 2,
  pendingPricingTrades: 3,
  pendingSettlementTrades: 6,
};

const defaultPriceIndices = [
  {
    code: "HH_NATGAS",
    name: "Henry Hub Natural Gas",
    description: null,
    is_active: true,
    commodity_code: "NATGAS",
    currency_code: "USD",
    unit_code: "MMBTU",
    provider: "EIA",
    market: "US",
    location_code: "HENRY_HUB",
  },
];

function buildPromptHomeVesselDelivery(
  overrides: Partial<DeliveryRecord> = {},
): DeliveryRecord {
  return {
    delivery_id: "DEL-HOME-VESSEL-1",
    trade_id: "TRD-HOME-VESSEL-1",
    status: "IN_PROGRESS",
    transport_mode: "VESSEL",
    commodity: "CRUDE",
    commodity_class: "OIL",
    vessel_detail: {
      delivery_id: "DEL-HOME-VESSEL-1",
      vessel_name: "MT Home Signal",
      imo_number: "IMO7654321",
      mmsi_number: "366765432",
      last_signal_at: "2026-04-11T02:30:00Z",
      last_position_at: "2026-04-11T02:30:00Z",
      last_latitude: 29.332,
      last_longitude: -94.748,
      last_speed_knots: 10.8,
      last_course_degrees: 210,
      last_heading_degrees: 208,
      last_navigational_status: "UNDER_WAY",
      current_destination: "HOUSTON",
      current_eta_at_destination: "2026-04-12T12:00:00Z",
      tracking_health: {
        exception_severity: "CLEAR",
        primary_exception: null,
      },
    },
    vessel_tracking_health: null,
    ...overrides,
  } as DeliveryRecord;
}

test("prompt home renders guided prompts without legacy home actions", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      priceIndices: defaultPriceIndices,
      onOpenView: () => undefined,
    }),
  );
  const deskTimeIndex = markup.indexOf("Desk Time");
  const pricesIndex = markup.indexOf("Market Prices");
  const mapIndex = markup.indexOf("Open Map Workspace");
  const documentUploadIndex = markup.indexOf("Upload documents");
  const communicationIndex = markup.indexOf("Communication center");
  const promptCardIndex = markup.indexOf("Ask the desk assistant");
  const operatorPromptIndex = markup.indexOf("Operator prompt");
  const cardFilterIndex = markup.indexOf("Home cards");

  assert.doesNotMatch(markup, /Show live context/);
  assert.doesNotMatch(markup, />Assistant Console</);
  assert.doesNotMatch(markup, /Contextual starting points/);
  assert.doesNotMatch(markup, /Clear operations blockers/);
  assert.doesNotMatch(markup, /Recent prompt threads/);
  assert.doesNotMatch(markup, /Old Console/);
  assert.doesNotMatch(markup, /Go direct/);
  assert.doesNotMatch(markup, /Open Live Desk/);
  assert.doesNotMatch(markup, /Open Trade Capture/);
  assert.doesNotMatch(markup, /Open Work Queue/);
  assert.doesNotMatch(markup, /Open Settlement/);
  assert.doesNotMatch(markup, /Using openai when you send\./);
  assert.doesNotMatch(markup, /Use your microphone to dictate the prompt\./);
  assert.doesNotMatch(markup, /What needs my attention right now\?/);
  assert.doesNotMatch(markup, /Summarize the open operations queue\./);
  assert.doesNotMatch(markup, /Where should I look for exposure risk today\?/);
  assert.doesNotMatch(
    markup,
    /Help me decide which workspace to use for a trade issue\./,
  );
  assert.doesNotMatch(
    markup,
    /The traditional screens are still here when you already know where the work belongs\./,
  );
  assert.doesNotMatch(markup, /Guided Prompts/);
  assert.doesNotMatch(markup, /What are you trying to do\?/);
  assert.doesNotMatch(
    markup,
    /Pick a lane, then load a suggested prompt or jump straight to the right workspace\./,
  );
  assert.doesNotMatch(markup, /Suggested prompts/);
  assert.doesNotMatch(markup, /Workspace links/);
  assert.doesNotMatch(markup, /Walk me through building a trade draft\./);
  assert.doesNotMatch(markup, /Tell me updates about the Strait of Hormuz\./);
  assert.doesNotMatch(
    markup,
    /Help me build a simulated trade idea to hedge risk\./,
  );
  assert.doesNotMatch(markup, /Open Pre-Trade Review/);
  assert.doesNotMatch(markup, /Governed Review/);
  assert.doesNotMatch(markup, /Review queue/);
  assert.doesNotMatch(markup, /Sign in to review PDFs/);
  assert.ok(cardFilterIndex >= 0);
  assert.ok(deskTimeIndex >= 0);
  assert.ok(deskTimeIndex > cardFilterIndex);
  assert.ok(pricesIndex > deskTimeIndex);
  assert.ok(mapIndex > pricesIndex);
  assert.ok(documentUploadIndex > mapIndex);
  assert.ok(communicationIndex > documentUploadIndex);
  assert.ok(promptCardIndex > documentUploadIndex);
  assert.ok(promptCardIndex > communicationIndex);
  assert.ok(operatorPromptIndex > promptCardIndex);
  assert.match(markup, />Voice Unavailable</);
  assert.match(markup, /<span class="eyebrow">Cards<\/span>/);
  assert.match(markup, /<strong id="prompt-home-card-filter-heading">Home cards<\/strong>/);
  assert.match(markup, /<span>View<\/span>/);
  assert.match(markup, /Local Home/);
  assert.match(markup, /6 visible · 0 hidden/);
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-card-filter-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-card-filter-panel" class="prompt-home-card-filter-body" hidden=""/,
  );
  assert.match(markup, /Edit cards/);
  assert.match(markup, /aria-label="Movable Home cards"/);
  assert.match(markup, /data-home-card-drag-handle="true"/);
  assert.match(markup, /aria-label="Drag Desk Time card by its header"/);
  assert.match(markup, /aria-label="Drag Market Prices card by its header"/);
  assert.doesNotMatch(markup, />Move<\/button>/);
  assert.doesNotMatch(markup, /Drag Home cards card by its header/);
  assert.match(markup, /Desk Time/);
  assert.match(
    markup,
    /<span class="eyebrow">Prices<\/span><strong>Market Prices<\/strong>/,
  );
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-prices-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-prices-panel" class="prompt-home-prices-card-body"/,
  );
  assert.doesNotMatch(markup, /No latest price marks/);
  assert.match(markup, /aria-label="Sort prices by Product"/);
  assert.match(markup, /aria-label="Sort prices by Updated"/);
  assert.match(
    markup,
    /aria-label="Double-click to open the price dashboard for Henry Hub Natural Gas"/,
  );
  assert.match(markup, /No mark yet/);
  assert.match(markup, /Market price marks/);
  assert.match(markup, /0 latest marks · 1 active index/);
  assert.match(markup, /Code, market, commodity/);
  assert.match(markup, /All providers/);
  assert.match(markup, /All commodities/);
  assert.match(markup, /All indices/);
  assert.match(markup, /Filter by mark status/);
  assert.match(markup, /0 latest marks across 1 active index/);
  assert.match(markup, /Open Dashboard/);
  assert.doesNotMatch(markup, /Desk clocks and calendars/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-timeframe-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-timeframe-panel" class="prompt-home-timeframe-panel-body"/,
  );
  assert.match(
    markup,
    /id="prompt-home-map-panel" class="prompt-home-map-card-body"/,
  );
  assert.doesNotMatch(markup, /Asset footprint preview/);
  assert.doesNotMatch(markup, /0 plotted \| 0 hidden \| 0 overlays/);
  assert.doesNotMatch(
    markup,
    /Preview map-ready assets and shared spatial overlays without leaving Home\./,
  );
  assert.doesNotMatch(markup, /Map Scope/);
  assert.doesNotMatch(
    markup,
    /map-ready assets are currently plotted in Home\./,
  );
  assert.doesNotMatch(
    markup,
    /All currently loaded assets meet the map-ready rules\./,
  );
  assert.match(
    markup,
    /<span class="eyebrow">Map<\/span><strong>Asset map<\/strong>/,
  );
  assert.match(markup, /class="prompt-home-map-card-toggle"/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-map-panel"/,
  );
  assert.match(markup, /Map Filters/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-map-filters-card-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-map-filters-card-panel" class="asset-map-filters-card-body"/,
  );
  assert.match(markup, /Activity/);
  assert.match(markup, /Positions/);
  assert.match(markup, /Shipments/);
  assert.match(markup, /Inventory/);
  assert.match(markup, /Geography/);
  assert.match(markup, /North America/);
  assert.match(markup, /South America/);
  assert.match(markup, /EMEA/);
  assert.match(markup, /APAC/);
  assert.match(markup, /Country/);
  assert.match(markup, /All countries/);
  assert.match(markup, /State or Territory/);
  assert.match(markup, /All states or territories/);
  assert.match(markup, /Save As/);
  assert.match(markup, /Filter preset name/);
  assert.match(markup, />Save</);
  assert.match(markup, /Presets/);
  assert.match(markup, /No saved presets/);
  assert.match(markup, /Tooltips/);
  assert.match(markup, /Weather Overlay/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-map-filters-card-weather-overlay-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-map-filters-card-weather-overlay-panel" class="asset-map-weather-overlay-body"/,
  );
  assert.match(markup, /aria-label="Uncheck all weather overlays"/);
  assert.match(markup, /Weather overlay layers/);
  assert.match(markup, /Opacity/);
  assert.match(markup, /US NOAA radar/);
  assert.match(markup, /Radar/);
  assert.match(
    markup,
    /<input type="checkbox" checked=""\/><span>Radar<\/span>/,
  );
  assert.match(markup, /Radar overlay opacity/);
  assert.match(markup, /aria-label="Show Radar overlay details"/);
  assert.doesNotMatch(markup, /aria-label="Weather overlay layer"/);
  assert.doesNotMatch(markup, /Precipitation/);
  assert.doesNotMatch(markup, /Temperature/);
  assert.doesNotMatch(markup, /Humidity/);
  assert.doesNotMatch(markup, /Pressure/);
  assert.doesNotMatch(markup, /tracked weather/);
  assert.doesNotMatch(markup, /weather points/);
  assert.match(markup, /Map Records/);
  assert.match(markup, /0 map records/);
  assert.match(markup, /Show up to/);
  assert.match(markup, /aria-label="Home map record limit"/);
  assert.match(markup, /Higher limits draw more markers and rows in Home\./);
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-map-records-card-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-map-records-card-panel" class="asset-map-records-card-body" hidden=""/,
  );
  assert.match(markup, /Open Map Workspace/);
  assert.match(
    markup,
    /<div class="prompt-home-document-upload-card-copy"><span class="eyebrow">Documents<\/span><strong>Upload documents<\/strong><\/div>/,
  );
  assert.doesNotMatch(
    markup,
    /Protected intake card\. Sign in to upload and review PDFs\./,
  );
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-document-upload-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-document-upload-panel" class="prompt-home-document-upload-card-body" hidden=""/,
  );
  assert.match(markup, /Communication center/);
  assert.match(
    markup,
    /One inbox for email, work follow-through, issues, and app messages\. Expand a row only when you need the detail\./,
  );
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-communication-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-communication-panel" class="prompt-home-communication-card-body"/,
  );
  assert.match(markup, /aria-label="Communication inbox"/);
  assert.match(markup, /Email/);
  assert.match(markup, /To-Do/);
  assert.match(markup, /Issue/);
  assert.match(markup, /App Message/);
  assert.match(markup, /#counterparty-email/);
  assert.match(markup, /#ops-follow-through/);
  assert.match(markup, /#desk-attention/);
  assert.match(markup, /#ectrm-assistant/);
  assert.match(markup, /Northshore sent a revised delivery window/);
  assert.match(markup, /contracts@northshorelng\.example/);
  assert.match(markup, /Unread/);
  assert.match(markup, /7 open work items waiting for follow-through/);
  assert.match(markup, /5 attention items surfaced for review/);
  assert.match(markup, /7 open work items/);
  assert.match(markup, /5 attention items/);
  assert.match(markup, /class="prompt-home-communication-record-list"/);
  assert.doesNotMatch(
    markup,
    /class="prompt-home-communication-record is-expanded"/,
  );
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-communication-record-panel-email"/,
  );
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-communication-record-panel-todo"/,
  );
  assert.match(
    markup,
    /id="prompt-home-communication-record-panel-email" class="prompt-home-communication-record-panel" aria-label="Communication details: Northshore sent a revised delivery window" hidden=""/,
  );
  assert.match(markup, /Counterparty email · Example inbox row/);
  assert.match(
    markup,
    /Northshore updated the delivery window on the attached note and asked for confirmation before 3 PM\./,
  );
  assert.match(markup, /Reply lane/);
  assert.match(
    markup,
    /This keeps inbox review and thread context in one place so the app reads more like Slack than a reporting table\./,
  );
  assert.match(
    markup,
    /After sign-in, the same inbox shape can be filled with live communication records\./,
  );
  assert.match(markup, /Open Messages Workspace/);
  assert.doesNotMatch(markup, /Open Assistant Console/);
  assert.doesNotMatch(markup, /Open Work Queue/);
  assert.doesNotMatch(markup, /Open Operations/);
  assert.doesNotMatch(markup, /Sign In to Review Communication/);
  assert.match(
    markup,
    /<div class="prompt-home-prompt-card-copy"><span class="eyebrow">Prompt<\/span><strong>Ask the desk assistant<\/strong><\/div>/,
  );
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-prompt-card-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-prompt-card-panel" class="prompt-home-prompt-card-body"/,
  );
  assert.match(markup, />Verbalize</);
  assert.doesNotMatch(
    markup,
    /Automatically read assistant responses aloud\./,
  );
  assert.match(markup, /aria-label="Resize map height"/);
  assert.match(markup, /Time zone/);
  assert.match(markup, /Preferred time zone/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-day-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-day-panel" class="prompt-home-time-meter-card-body"/,
  );
  assert.match(markup, /Trading opens/);
  assert.match(markup, /Desk EOD/);
  assert.match(markup, /EOD 10:00 PM local/);
  assert.match(
    markup,
    /id="prompt-home-timeframe-panel" class="prompt-home-timeframe-panel-body">[\s\S]*Add Event/,
  );
  assert.match(markup, /href="\/\?view=settings#settings-custom-events-card"/);
  assert.match(markup, /Representative trading hours/);
  assert.match(markup, /Show details/);
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-trading-hours-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-trading-hours-panel" class="prompt-home-session-board" hidden=""/,
  );
  assert.match(markup, /Representative venue sessions converted into/);
  assert.match(markup, /ICE Brent/);
  assert.match(markup, /LMEselect/);
  assert.match(markup, /LME Ring/);
  assert.match(markup, /SGX MSCI/);
  assert.match(markup, /CME WTI/);
  assert.match(markup, /EEX Power/);
  assert.match(markup, /TOCOM Energy/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-week-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-week-panel" class="prompt-home-time-meter-card-body"/,
  );
  assert.match(markup, /Sunday through Saturday/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-month-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-month-panel" class="prompt-home-time-meter-card-body"/,
  );
  assert.match(markup, /1 through EOM/);
  assert.match(markup, /HE00/);
  assert.match(markup, /HE07/);
  assert.match(markup, /HE22/);
  assert.match(markup, /HE24/);
  assert.match(markup, /Sun/);
  assert.match(markup, /Sat/);
  assert.match(markup, /EOM/);
  assert.doesNotMatch(markup, /prompt-home-review-panel/);
});

test("prompt home prices prefer indices with latest synced marks", () => {
  const indices: PriceIndexRecord[] = [
    {
      code: "BRENT_SPOT_D",
      name: "Brent Spot Daily",
      description: null,
      is_active: true,
      commodity_code: "BRENT",
      currency_code: "USD",
      unit_code: "BBL",
      provider: "EIA",
      market: "EUROPE",
      location_code: null,
    },
    {
      code: "CAISO_NP15_RT5M",
      name: "CAISO NP15 Real-Time 5-Minute Hub LMP",
      description: null,
      is_active: true,
      commodity_code: "POWER",
      currency_code: "USD",
      unit_code: "MWH",
      provider: "CAISO",
      quote_type: "FUTURE",
      market: "CAISO",
      location_code: null,
    },
    {
      code: "CORN_GLOBAL_IMF_M",
      name: "Global Corn Monthly",
      description: null,
      is_active: true,
      commodity_code: "CORN",
      currency_code: "USD",
      unit_code: "MT",
      provider: "FRED",
      market: "IMF",
      location_code: null,
    },
  ];

  const latestMarksByCode: Record<string, PriceIndexObservationRecord> = {
    BRENT_SPOT_D: priceObservation({
      id: 1,
      price_index_code: "BRENT_SPOT_D",
      observation_date: "2026-05-16",
      downloaded_at: "2026-05-17T10:00:00Z",
    }),
    CAISO_NP15_RT5M: priceObservation({
      id: 2,
      price_index_code: "CAISO_NP15_RT5M",
      observation_date: "2026-05-18",
      downloaded_at: "2026-05-18T19:30:00Z",
    }),
  };

  assert.deepEqual(
    selectPromptHomeDisplayPriceIndices(indices, latestMarksByCode).map(
      (priceIndex) => priceIndex.code,
    ),
    ["CAISO_NP15_RT5M", "BRENT_SPOT_D", "CORN_GLOBAL_IMF_M"],
  );
});

test("prompt home prices map pricing service output into a card view model", () => {
  const indices: PriceIndexRecord[] = [
    {
      code: "BRENT_SPOT_D",
      name: "Brent Spot Daily",
      description: null,
      is_active: true,
      commodity_code: "BRENT",
      currency_code: "USD",
      unit_code: "BBL",
      provider: "EIA",
      market: "EUROPE",
      location_code: null,
    },
    {
      code: "CAISO_SP15_RT5M",
      name: "CAISO SP15 Real-Time 5-Minute Hub LMP",
      description: null,
      is_active: true,
      commodity_code: "POWER",
      currency_code: "USD",
      unit_code: "MWH",
      provider: "CAISO",
      market: "CAISO",
      location_code: null,
    },
    {
      code: "INACTIVE_INDEX",
      name: "Inactive Index",
      description: null,
      is_active: false,
      commodity_code: "POWER",
      currency_code: "USD",
      unit_code: "MWH",
      provider: "CAISO",
      market: "CAISO",
      location_code: null,
    },
  ];

  const viewModel = buildPromptHomePricesCardViewModel(
    {
      priceIndices: indices,
      latestMarks: [
        priceObservation({
          id: 1,
          price_index_code: "BRENT_SPOT_D",
          observation_date: "2026-05-16",
          value: 72.25,
        }),
        priceObservation({
          id: 2,
          price_index_code: "BRENT_SPOT_D",
          observation_date: "2026-05-18",
          value: 73.44,
        }),
        priceObservation({
          id: 3,
          price_index_code: "CAISO_SP15_RT5M",
          observation_date: "2026-05-22",
          value: -6.75,
          unit_code: "MWH",
          source_provider: "CAISO",
          source_series_id: "SP15",
          source_revision: "2026-05-22T13:05:00:ptid:1",
          downloaded_at: "2026-05-22T16:40:00Z",
        }),
        priceObservation({
          id: 4,
          price_index_code: "UNKNOWN_INDEX",
          observation_date: "2026-05-23",
          value: 99,
        }),
      ],
    },
    {
      filters: {
        query: "",
        provider: PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER,
        markFilter: "all",
      },
      sortState: null,
    },
  );

  assert.equal(viewModel.status, "ready");
  assert.equal(viewModel.activePriceIndexCount, 2);
  assert.equal(viewModel.latestMarkCount, 2);
  assert.equal(viewModel.latestMarksByCode.BRENT_SPOT_D?.id, 2);
  assert.deepEqual(
    viewModel.rows.map((row) => row.priceIndexCode),
    ["CAISO_SP15_RT5M", "BRENT_SPOT_D"],
  );
  assert.deepEqual(
    {
      product: viewModel.rows[0]?.product,
      location: viewModel.rows[0]?.location,
      price: viewModel.rows[0]?.price,
      unit: viewModel.rows[0]?.unit,
      currency: viewModel.rows[0]?.currency,
      date: viewModel.rows[0]?.date,
      time: viewModel.rows[0]?.time,
      source: viewModel.rows[0]?.source,
      hasLatestMark: viewModel.rows[0]?.hasLatestMark,
    },
    {
      product: "POWER",
      location: "SP15",
      price: "-6.75",
      unit: "MWH",
      currency: "USD",
      date: "05/22/2026",
      time: "13:05:00",
      source: "CAISO · SP15",
      hasLatestMark: true,
    },
  );
});

test("prompt home price filters narrow by query provider and mark state", () => {
  const indices: PriceIndexRecord[] = [
    {
      code: "BRENT_SPOT_D",
      name: "Brent Spot Daily",
      description: "Daily crude oil mark",
      is_active: true,
      commodity_code: "BRENT",
      currency_code: "USD",
      unit_code: "BBL",
      provider: "EIA",
      market: "EUROPE",
      location_code: null,
    },
    {
      code: "CAISO_NP15_RT5M",
      name: "CAISO NP15 Real-Time 5-Minute Hub LMP",
      description: null,
      is_active: true,
      commodity_code: "POWER",
      currency_code: "USD",
      unit_code: "MWH",
      provider: "CAISO",
      quote_type: "FUTURE",
      market: "CAISO",
      location_code: null,
    },
    {
      code: "CORN_GLOBAL_IMF_M",
      name: "Global Corn Monthly",
      description: null,
      is_active: true,
      commodity_code: "CORN",
      currency_code: "USD",
      unit_code: "MT",
      provider: "FRED",
      market: "IMF",
      location_code: null,
    },
  ];
  const latestMarksByCode: Record<string, PriceIndexObservationRecord> = {
    BRENT_SPOT_D: priceObservation({
      id: 1,
      price_index_code: "BRENT_SPOT_D",
    }),
    CAISO_NP15_RT5M: priceObservation({
      id: 2,
      price_index_code: "CAISO_NP15_RT5M",
    }),
  };

  assert.deepEqual(listPromptHomePriceProviders(indices), [
    "CAISO",
    "EIA",
    "FRED",
  ]);
  assert.deepEqual(listPromptHomePriceQuoteTypes(indices), ["FUTURE", "SPOT"]);
  assert.deepEqual(
    filterPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      query: "corn",
      provider: "ALL",
      markFilter: "all",
    }).map((priceIndex) => priceIndex.code),
    ["CORN_GLOBAL_IMF_M"],
  );
  assert.deepEqual(
    filterPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      query: "",
      provider: "EIA",
      markFilter: "with_marks",
    }).map((priceIndex) => priceIndex.code),
    ["BRENT_SPOT_D"],
  );
  assert.deepEqual(
    filterPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      query: "",
      provider: "ALL",
      markFilter: "all",
      quoteType: "FUTURE",
    }).map((priceIndex) => priceIndex.code),
    ["CAISO_NP15_RT5M"],
  );
  assert.deepEqual(
    filterPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      query: "",
      provider: "ALL",
      markFilter: "all",
      commodityCode: "POWER",
    }).map((priceIndex) => priceIndex.code),
    ["CAISO_NP15_RT5M"],
  );
  assert.deepEqual(
    filterPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      query: "",
      provider: "ALL",
      markFilter: "all",
      priceIndexCode: "BRENT_SPOT_D",
    }).map((priceIndex) => priceIndex.code),
    ["BRENT_SPOT_D"],
  );
  assert.deepEqual(
    filterPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      query: "",
      provider: "ALL",
      markFilter: "missing_marks",
    }).map((priceIndex) => priceIndex.code),
    ["CORN_GLOBAL_IMF_M"],
  );
});

test("prompt home price headers can sort display indices by selected field", () => {
  const indices: PriceIndexRecord[] = [
    {
      code: "BRENT_SPOT_D",
      name: "Brent Spot Daily",
      description: null,
      is_active: true,
      commodity_code: "BRENT",
      currency_code: "USD",
      unit_code: "BBL",
      provider: "EIA",
      market: "EUROPE",
      location_code: "EUROPE",
    },
    {
      code: "CAISO_SP15_RT5M",
      name: "CAISO SP15 Real-Time 5-Minute Hub LMP",
      description: null,
      is_active: true,
      commodity_code: "POWER",
      currency_code: "USD",
      unit_code: "MWH",
      provider: "CAISO",
      market: "CAISO",
      location_code: "SP15",
    },
    {
      code: "CORN_GLOBAL_IMF_M",
      name: "Global Corn Monthly",
      description: null,
      is_active: true,
      commodity_code: "CORN",
      currency_code: "USD",
      unit_code: "MT",
      provider: "FRED",
      market: "IMF",
      location_code: null,
    },
  ];
  const latestMarksByCode: Record<string, PriceIndexObservationRecord> = {
    BRENT_SPOT_D: priceObservation({
      price_index_code: "BRENT_SPOT_D",
      value: 72.25,
      observation_date: "2026-05-18",
      downloaded_at: "2026-05-18T10:00:00Z",
    }),
    CAISO_SP15_RT5M: priceObservation({
      price_index_code: "CAISO_SP15_RT5M",
      value: -6.75,
      unit_code: "MWH",
      observation_date: "2026-05-22",
      source_revision: "2026-05-22T13:05:00:ptid:1",
      downloaded_at: "2026-05-22T16:40:00Z",
    }),
  };

  assert.deepEqual(
    sortPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      field: "product",
      direction: "asc",
    }).map((priceIndex) => priceIndex.code),
    ["BRENT_SPOT_D", "CORN_GLOBAL_IMF_M", "CAISO_SP15_RT5M"],
  );
  assert.deepEqual(
    sortPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      field: "price",
      direction: "asc",
    }).map((priceIndex) => priceIndex.code),
    ["CAISO_SP15_RT5M", "BRENT_SPOT_D", "CORN_GLOBAL_IMF_M"],
  );
  assert.deepEqual(
    sortPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      field: "updated",
      direction: "desc",
    }).map((priceIndex) => priceIndex.code),
    ["CAISO_SP15_RT5M", "BRENT_SPOT_D", "CORN_GLOBAL_IMF_M"],
  );
  assert.deepEqual(
    sortPromptHomeDisplayPriceIndices(
      indices,
      latestMarksByCode,
      null,
    ).map((priceIndex) => priceIndex.code),
    ["BRENT_SPOT_D", "CAISO_SP15_RT5M", "CORN_GLOBAL_IMF_M"],
  );
  assert.deepEqual(
    sortPromptHomeDisplayPriceIndices(
      indices,
      latestMarksByCode,
      null,
      ["CAISO_SP15_RT5M", "BRENT_SPOT_D"],
    ).map((priceIndex) => priceIndex.code),
    ["CAISO_SP15_RT5M", "BRENT_SPOT_D", "CORN_GLOBAL_IMF_M"],
  );
  assert.deepEqual(
    sortPromptHomeDisplayPriceIndices(
      indices,
      latestMarksByCode,
      {
        field: "product",
        direction: "asc",
      },
      ["CAISO_SP15_RT5M", "BRENT_SPOT_D"],
    ).map((priceIndex) => priceIndex.code),
    ["BRENT_SPOT_D", "CORN_GLOBAL_IMF_M", "CAISO_SP15_RT5M"],
  );

  const productSort = nextPromptHomePriceSortState(null, "product");
  assert.deepEqual(productSort, { field: "product", direction: "asc" });
  const productReverseSort = nextPromptHomePriceSortState(
    productSort,
    "product",
  );
  assert.deepEqual(productReverseSort, {
    field: "product",
    direction: "desc",
  });
  assert.equal(
    nextPromptHomePriceSortState(productReverseSort, "product"),
    null,
  );

  const updatedSort = nextPromptHomePriceSortState(productSort, "updated");
  assert.deepEqual(updatedSort, {
    field: "updated",
    direction: "desc",
  });
  const updatedReverseSort = nextPromptHomePriceSortState(
    updatedSort,
    "updated",
  );
  assert.deepEqual(updatedReverseSort, {
    field: "updated",
    direction: "asc",
  });
  assert.equal(
    nextPromptHomePriceSortState(updatedReverseSort, "updated"),
    null,
  );
});

test("prompt home price marks format the price date and time", () => {
  assert.equal(
    formatPromptHomePriceDateTime(
      priceObservation({
        observation_date: "2026-05-16",
        source_published_at: "2026-05-16T14:45:00Z",
        downloaded_at: "2026-05-17T10:00:00Z",
      }),
    ),
    "Daily · source date 05/16/2026 · published 05/16/2026 14:45:00",
  );
  assert.equal(
    formatPromptHomePriceDateTime(
      priceObservation({
        observation_date: "2026-05-16",
        source_published_at: null,
        downloaded_at: "2026-05-17T10:00:00Z",
      }),
    ),
    "Daily · source date 05/16/2026 · synced 05/17/2026 10:00:00",
  );
  assert.equal(formatPromptHomePriceFrequency("5MIN"), "5-min");
  assert.equal(formatPromptHomePriceFrequency("15MIN"), "15-min");
  assert.equal(formatPromptHomePriceFrequency("hourly"), "Hourly");
  assert.equal(formatPromptHomePriceFrequency("posting"), "Posting");
  assert.equal(
    formatPromptHomePriceDate(
      priceObservation({
        observation_date: "2026-05-22",
      }),
    ),
    "05/22/2026",
  );
  assert.equal(
    formatPromptHomePriceTime(
      priceObservation({
        source_published_at: null,
        source_revision: "2026-05-22:HE17:I03",
      }),
    ),
    "HE17 I03",
  );
  assert.equal(
    formatPromptHomePriceTime(
      priceObservation({
        source_published_at: null,
        source_revision: "2026-05-22:IE16:45",
      }),
    ),
    "IE 16:45",
  );
  assert.equal(
    formatPromptHomePriceTime(
      priceObservation({
        source_published_at: null,
        source_revision: "2026-05-22T13:05:00:ptid:1",
      }),
    ),
    "13:05:00",
  );
  assert.equal(
    formatPromptHomePriceUpdatedAt(
      priceObservation({
        downloaded_at: "2026-05-22T23:40:00Z",
      }),
    ),
    "05/22/2026 23:40:00",
  );
  assert.equal(
    formatPromptHomePriceSource(
      priceObservation({
        source_provider: "ERCOT",
        source_series_id: "HB_HOUSTON",
      }),
      {
        code: "ERCOT_HB_HOUSTON_RT15M",
        name: "ERCOT Houston Real-Time Hub SPP",
        description: null,
        is_active: true,
        commodity_code: "POWER",
        currency_code: "USD",
        unit_code: "MWH",
        provider: "ERCOT",
      },
    ),
    "ERCOT · HB_HOUSTON",
  );
});

test("prompt home prices view model can show every active missing mark", () => {
  const priceIndices = Array.from({ length: 8 }, (_, index) => ({
    code: `PRICE_INDEX_${index + 1}`,
    name: `Price Index ${index + 1}`,
    description: null,
    is_active: true,
    commodity_code: index % 2 === 0 ? "POWER" : "NATGAS",
    currency_code: "USD",
    unit_code: index % 2 === 0 ? "MWH" : "MMBTU",
    provider: index % 2 === 0 ? "CAISO" : "EIA",
    market: index % 2 === 0 ? "CAISO" : "US",
    location_code: `LOC_${index + 1}`,
  }));

  const viewModel = buildPromptHomePricesCardViewModel(
    {
      priceIndices,
      latestMarks: [],
    },
    {
      filters: {
        query: "",
        provider: PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER,
        markFilter: "missing_marks",
      },
      sortState: null,
    },
  );

  assert.equal(viewModel.status, "ready");
  assert.equal(viewModel.latestMarkCount, 0);
  assert.equal(viewModel.rows.length, 8);
  for (const priceIndex of priceIndices) {
    assert.ok(
      viewModel.rows.some(
        (row) =>
          row.priceIndexCode === priceIndex.code &&
          row.location === priceIndex.location_code &&
          row.price === "No mark yet",
      ),
    );
  }

  const defaultViewModel = buildPromptHomePricesCardViewModel(
    {
      priceIndices,
      latestMarks: [],
    },
    {
      filters: {
        query: "",
        provider: PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER,
        markFilter: "all",
      },
      sortState: null,
    },
  );

  assert.equal(defaultViewModel.status, "ready");
  assert.equal(defaultViewModel.latestMarkCount, 0);
  assert.equal(defaultViewModel.rows.length, 8);
  assert.ok(defaultViewModel.rows.every((row) => row.price === "No mark yet"));
});

function priceObservation(
  overrides: Partial<PriceIndexObservationRecord>,
): PriceIndexObservationRecord {
  return {
    id: 1,
    price_index_code: "BRENT_SPOT_D",
    observation_date: "2026-05-16",
    value: 72.25,
    unit_code: "BBL",
    currency_code: "USD",
    source_provider: "EIA",
    source_series_id: "PET.RBRTE.D",
    source_frequency: "DAILY",
    source_published_at: null,
    source_revision: null,
    downloaded_at: "2026-05-17T10:00:00Z",
    run_id: 1,
    created_at: "2026-05-17T10:00:00Z",
    updated_at: "2026-05-17T10:00:00Z",
    ...overrides,
  };
}

test("prompt home renders read aloud controls for assistant messages", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      onOpenView: () => undefined,
      initialMessages: [
        {
          id: "msg-assistant",
          role: "assistant",
          content: "Summarize the open operations queue.",
        },
        {
          id: "msg-user",
          role: "user",
          content: "What needs attention right now?",
        },
      ],
    }),
  );

  assert.equal((markup.match(/Read Aloud/g) ?? []).length, 1);
  assert.match(markup, /Summarize the open operations queue\./);
});

test("prompt home renders assistant chart artifacts without showing the fenced payload", () => {
  const chartMessage = [
    "Document mix by type.",
    "```ectrm-chart",
    JSON.stringify({
      artifact_type: "ectrm.chart",
      version: 1,
      chart_type: "pie",
      title: "Documents by document type",
      value_label: "Documents",
      segments: [
        { document_kind: "INVOICE", label: "Invoice", count: 2 },
        {
          document_kind: "TRADE_CONFIRMATION",
          label: "Trade Confirmation",
          count: 1,
        },
      ],
    }),
    "```",
  ].join("\n");

  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      onOpenView: () => undefined,
      initialMessages: [
        {
          id: "msg-assistant-chart",
          role: "assistant",
          content: chartMessage,
        },
      ],
    }),
  );

  assert.match(markup, /Document mix by type\./);
  assert.match(markup, /assistant-chart-card/);
  assert.match(markup, /Documents by document type/);
  assert.match(markup, /Trade Confirmation/);
  assert.doesNotMatch(markup, /```ectrm-chart/);
});

test("prompt home map card uses the shared eyebrow and title structure", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      onOpenView: () => undefined,
    }),
  );

  assert.match(
    markup,
    /<div class="prompt-home-map-card-copy"><span class="eyebrow">Map<\/span><strong>Asset map<\/strong>/,
  );
});

test("prompt home map enables the vessels layer when tracked deliveries are available", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      deliveries: [buildPromptHomeVesselDelivery()],
      onOpenView: () => undefined,
    }),
  );

  assert.match(markup, /Vessels/);
  assert.match(markup, /1 vessel/);
  assert.doesNotMatch(
    markup,
    /<input type="checkbox" checked="" disabled=""\/><span>Vessels<\/span>/,
  );
});

test("prompt home map summarizes filtered records and caps the visible map directory at 1000 rows", () => {
  const assets = Array.from({ length: 1050 }, (_, index) => ({
    code: `HOME_${String(index + 1).padStart(4, "0")}`,
    name: `Home Asset ${index + 1}`,
    description: null,
    is_active: true,
    asset_class: "PIPELINE",
    asset_type: "TRANSMISSION",
    asset_reality: "REAL",
    commodity_code: "HENRY_HUB",
    location_code: "HOUSTON",
    operating_status: "OPERATING",
  }));
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      assets,
      locations: [
        {
          code: "HOUSTON",
          name: "Houston",
          description: null,
          is_active: true,
          location_kind: "POINT",
          location_type: "HUB",
          latitude: 29.7604,
          longitude: -95.3698,
          subdivision_code: "US-TX",
          country_code: "US",
          continent_code: "NA",
        },
      ],
      onOpenView: () => undefined,
    }),
  );

  assert.match(markup, /1,000 of 1,050 shown on map/);
  assert.match(markup, /Showing 1,000 of 1,050 map records/);
  assert.equal(
    (markup.match(/aria-label="Focus HOME_\d{4} on map"/g) ?? []).length,
    1000,
  );
  assert.match(markup, /HOME_1000/);
  assert.doesNotMatch(markup, /HOME_1001/);
});

test("prompt home map reports zero records when the assets layer starts hidden", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      assets: [
        {
          code: "HOME_001",
          name: "Home Asset 1",
          description: null,
          is_active: true,
          asset_class: "PIPELINE",
          asset_type: "TRANSMISSION",
          asset_reality: "REAL",
          commodity_code: "HENRY_HUB",
          location_code: "HOUSTON",
          operating_status: "OPERATING",
        },
      ],
      locations: [
        {
          code: "HOUSTON",
          name: "Houston",
          description: null,
          is_active: true,
          location_kind: "POINT",
          location_type: "HUB",
          latitude: 29.7604,
          longitude: -95.3698,
          subdivision_code: "US-TX",
          country_code: "US",
          continent_code: "NA",
        },
      ],
      initialMapAssetLayerVisible: false,
      onOpenView: () => undefined,
    }),
  );

  assert.match(
    markup,
    /Assets hidden · 0 shown on map/,
  );
  assert.match(markup, /<p>0 map records<\/p>/);
  assert.match(
    markup,
    /No map records are available for the current filters\./,
  );
  assert.doesNotMatch(markup, /aria-label="Focus HOME_001 on map"/);
});

test("prompt home topbar token badge renders a loading state before budgets resolve", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeAvailableTokenBadge),
  );

  assert.match(markup, /Available Token Count/);
  assert.match(markup, /Loading\.\.\./);
  assert.match(markup, /Checking published assistant budgets\./);
});

test("prompt home shows prompt thread messages in chronological order", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      onOpenView: () => undefined,
      initialMessages: [
        { id: "prompt-1", role: "user", content: "Earliest prompt" },
        {
          id: "completion-1",
          role: "assistant",
          content: "Earliest completion",
        },
        { id: "prompt-2", role: "user", content: "Most recent prompt" },
        {
          id: "completion-2",
          role: "assistant",
          content: "Most recent completion",
        },
      ],
    }),
  );

  const mostRecentCompletionIndex = markup.indexOf("Most recent completion");
  const mostRecentPromptIndex = markup.indexOf("Most recent prompt");
  const earliestCompletionIndex = markup.indexOf("Earliest completion");
  const earliestPromptIndex = markup.indexOf("Earliest prompt");

  assert.ok(mostRecentCompletionIndex >= 0);
  assert.ok(mostRecentPromptIndex >= 0);
  assert.ok(earliestCompletionIndex >= 0);
  assert.ok(earliestPromptIndex >= 0);
  assert.ok(earliestPromptIndex < earliestCompletionIndex);
  assert.ok(earliestCompletionIndex < mostRecentPromptIndex);
  assert.ok(mostRecentPromptIndex < mostRecentCompletionIndex);
});

test("prompt home stops auto-loading weather after the first load error", () => {
  assert.equal(
    shouldAutoEnsurePromptHomeData({
      hasSession: true,
      dataLoaded: false,
      dataLoading: false,
      dataError: "",
      hasEnsureHandler: true,
    }),
    true,
  );

  assert.equal(
    shouldAutoEnsurePromptHomeData({
      hasSession: true,
      dataLoaded: false,
      dataLoading: false,
      dataError: "Request failed: 404",
      hasEnsureHandler: true,
    }),
    false,
  );
});

test("prompt home token summary reports a single assistant budget", () => {
  const summary = summarizePromptHomeAvailableTokens({
    agents: [
      {
        agent_id: "ops-governor",
        name: "Ops Governor",
        description: "Governed assistant",
        status: "ACTIVE",
        scope: "TEAM",
        provider: "openai",
        model: "gpt-5.4",
        role_key: "trade-ops-copilot",
        profile_kind: "ROLE_DERIVED",
        allowed_workspaces: ["assistant", "trades"],
        capabilities: ["READ"],
        allowed_tools: [],
        allowed_action_types: [],
        token_budget: {
          status: "GREEN",
          allocated_tokens: 50000,
          used_tokens: 4200,
          remaining_tokens: 45800,
          percent_used: 8.4,
          warning_threshold_percent: 80,
          allocation_source: "AGENT",
          window_started_at: "2026-05-05T00:00:00Z",
          reset_at: "2026-05-06T00:00:00Z",
        },
        effective_policy: {
          allowed_tools: [],
          blocked_tools: [],
          allowed_actions: [],
          blocked_actions: [],
          policy_notes: [],
        },
        eval_gate: {
          status: "PASS",
          role_key: "trade-ops-copilot",
          required_cases: [],
          covered_cases: [],
          missing_cases: [],
          custom_case_count: 0,
          notes: [],
        },
      },
    ],
  });

  assert.equal(summary.value, "45,800");
  assert.equal(summary.detail, "Ops Governor remaining today.");
});

test("prompt home token summary combines multiple assistant budgets", () => {
  const summary = summarizePromptHomeAvailableTokens({
    agents: [
      {
        agent_id: "ops-governor",
        name: "Ops Governor",
        description: "Governed assistant",
        status: "ACTIVE",
        scope: "TEAM",
        provider: "openai",
        model: "gpt-5.4",
        role_key: "trade-ops-copilot",
        profile_kind: "ROLE_DERIVED",
        allowed_workspaces: ["assistant"],
        capabilities: ["READ"],
        allowed_tools: [],
        allowed_action_types: [],
        token_budget: {
          status: "GREEN",
          allocated_tokens: 50000,
          used_tokens: 4200,
          remaining_tokens: 45800,
          percent_used: 8.4,
          warning_threshold_percent: 80,
          allocation_source: "AGENT",
          window_started_at: "2026-05-05T00:00:00Z",
          reset_at: "2026-05-06T00:00:00Z",
        },
        effective_policy: {
          allowed_tools: [],
          blocked_tools: [],
          allowed_actions: [],
          blocked_actions: [],
          policy_notes: [],
        },
        eval_gate: {
          status: "PASS",
          role_key: "trade-ops-copilot",
          required_cases: [],
          covered_cases: [],
          missing_cases: [],
          custom_case_count: 0,
          notes: [],
        },
      },
      {
        agent_id: "risk-analyst",
        name: "Risk Analyst",
        description: "Risk assistant",
        status: "ACTIVE",
        scope: "TEAM",
        provider: "openai",
        model: "gpt-5.4",
        role_key: "risk-analyst",
        profile_kind: "ROLE_DERIVED",
        allowed_workspaces: ["assistant", "risk"],
        capabilities: ["READ"],
        allowed_tools: [],
        allowed_action_types: [],
        token_budget: {
          status: "AMBER",
          allocated_tokens: 25000,
          used_tokens: 7000,
          remaining_tokens: 18000,
          percent_used: 28,
          warning_threshold_percent: 80,
          allocation_source: "AGENT",
          window_started_at: "2026-05-05T00:00:00Z",
          reset_at: "2026-05-06T00:00:00Z",
        },
        effective_policy: {
          allowed_tools: [],
          blocked_tools: [],
          allowed_actions: [],
          blocked_actions: [],
          policy_notes: [],
        },
        eval_gate: {
          status: "PASS",
          role_key: "risk-analyst",
          required_cases: [],
          covered_cases: [],
          missing_cases: [],
          custom_case_count: 0,
          notes: [],
        },
      },
    ],
  });

  assert.equal(summary.value, "63,800");
  assert.equal(
    summary.detail,
    "Combined across 2 published assistant budgets.",
  );
});

test("prompt home token summary falls back to the default daily allocation", () => {
  const summary = summarizePromptHomeAvailableTokens({
    agents: [],
    defaultDailyTokenAllocation: 100000,
  });

  assert.equal(summary.value, "100,000");
  assert.equal(
    summary.detail,
    "Default daily assistant allocation available on Home.",
  );
});
