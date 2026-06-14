import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { WorkspaceTopbarDatabaseSizeBadge } from "../src/entities/app/WorkspaceTopbarDatabaseSizeBadge";
import { PromptHomeAvailableTokenBadge } from "../src/workspaces/prompt/PromptHomeAvailableTokenBadge";
import type {
  DeliveryRecord,
  PriceIndexObservationRecord,
  PriceIndexRecord,
} from "../src/shared/models";
import type { StoredAuthSession } from "../src/shared/mutation";
import { shouldAutoEnsurePromptHomeData } from "../src/workspaces/prompt/promptHomeAutoLoad";
import { summarizePromptHomeAvailableTokens } from "../src/workspaces/prompt/promptHomeAvailableTokens";
import {
  buildPromptHomePricesCardViewModel,
  filterPromptHomeDisplayPriceIndices,
  formatPromptHomePriceChange,
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
  promptHomePriceChangeTone,
  selectPromptHomeDisplayPriceIndices,
  sortPromptHomeDisplayPriceIndices,
} from "../src/workspaces/prompt/promptHomePrices";
import {
  PromptHomeWorkspace,
} from "../src/workspaces/prompt/PromptHomeWorkspace";
import { shouldSubmitPromptHomeComposerKey } from "../src/workspaces/prompt/promptHomeComposerKeybindings";

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

const adminAuthSession: StoredAuthSession = {
  sessionId: "session-admin",
  accessToken: "admin-token",
  expiresAt: "2026-06-01T00:00:00Z",
  user: {
    user_id: "ops.admin",
    email: "ops.admin@example.test",
    display_name: "Ops Admin",
    role: "ADMIN",
  },
};

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

test("prompt home composer submits on unmodified Enter only", () => {
  assert.equal(shouldSubmitPromptHomeComposerKey({ key: "Enter" }), true);
  assert.equal(
    shouldSubmitPromptHomeComposerKey({ key: "Enter", ctrlKey: true }),
    false,
  );
  assert.equal(
    shouldSubmitPromptHomeComposerKey({ key: "Enter", shiftKey: true }),
    false,
  );
  assert.equal(
    shouldSubmitPromptHomeComposerKey({
      key: "Enter",
      nativeEvent: { isComposing: true },
    }),
    false,
  );
  assert.equal(shouldSubmitPromptHomeComposerKey({ key: "A" }), false);
});

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
  const exchangesIndex = markup.indexOf("Exchanges");
  const calendarIndex = markup.indexOf("Calendar");
  const pricesIndex = markup.indexOf('aria-label="Scrolling market prices"');
  const newsIndex = markup.indexOf("Headlines loading");
  const mapIndex = markup.indexOf("Open Map Workspace");
  const documentUploadIndex = markup.indexOf("Upload documents");
  const communicationIndex = markup.indexOf("Communication center");
  const promptCardIndex = markup.indexOf("Desk Assistant");
  const operatorPromptIndex = markup.indexOf("Operator prompt");
  const cardFilterIndex = markup.indexOf('<span class="eyebrow">Apps</span>');

  assert.doesNotMatch(markup, /Show live context/);
  assert.doesNotMatch(markup, />Assistant Console</);
  assert.doesNotMatch(markup, /Contextual starting points/);
  assert.doesNotMatch(markup, /Recent prompt threads/);
  assert.doesNotMatch(markup, /Old Console/);
  assert.doesNotMatch(markup, /Go direct/);
  assert.doesNotMatch(markup, /Open Live Desk/);
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
  assert.doesNotMatch(markup, /Current prompt thread/);
  assert.doesNotMatch(markup, /Responses can explain, route, draft/);
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
  assert.doesNotMatch(markup, /Desk brief and next work/);
  assert.doesNotMatch(
    markup,
    /A compact readout of open desk work, market context, and safe handoffs/,
  );
  assert.doesNotMatch(markup, /Ask What Matters/);
  assert.doesNotMatch(markup, /Desk snapshot/);
  assert.doesNotMatch(markup, /Clear operations blockers/);
  assert.doesNotMatch(markup, />Open Work Queue<\/button>/);
  assert.doesNotMatch(markup, />Open Settlement<\/button>/);
  assert.doesNotMatch(markup, />Open Trade Capture<\/button>/);
  assert.doesNotMatch(markup, /Fast Starts/);
  assert.doesNotMatch(markup, /Book Trade/);
  assert.ok(cardFilterIndex >= 0);
  assert.ok(deskTimeIndex >= 0);
  assert.ok(deskTimeIndex > cardFilterIndex);
  assert.ok(exchangesIndex > deskTimeIndex);
  assert.ok(calendarIndex > exchangesIndex);
  assert.ok(pricesIndex > calendarIndex);
  assert.ok(newsIndex > pricesIndex);
  assert.ok(mapIndex > newsIndex);
  assert.ok(documentUploadIndex > mapIndex);
  assert.ok(communicationIndex > documentUploadIndex);
  assert.ok(promptCardIndex > documentUploadIndex);
  assert.ok(promptCardIndex > communicationIndex);
  assert.ok(operatorPromptIndex > promptCardIndex);
  assert.match(markup, />Voice Unavailable</);
  assert.match(markup, /<span class="eyebrow">Apps<\/span>/);
  assert.doesNotMatch(markup, />Home apps<\/strong>/);
  assert.match(
    markup,
    /<label class="prompt-home-preset-switcher"><span>Presets<\/span><select/,
  );
  assert.match(markup, /<option value="Energy" selected="">Energy<\/option>/);
  assert.match(markup, /<option value="Agriculture">Agriculture<\/option>/);
  assert.match(markup, /<option value="Metals">Metals<\/option>/);
  assert.match(markup, /<option value="Chemicals">Chemicals<\/option>/);
  assert.match(markup, /<option value="Waste &amp; Recyclables">Waste &amp; Recyclables<\/option>/);
  assert.match(markup, /<option value="Other">Other<\/option>/);
  assert.match(
    markup,
    /<label class="prompt-home-view-switcher"><span>Saved Views<\/span><select/,
  );
  assert.match(markup, />Undo<\/button>/);
  assert.match(markup, />Copy<\/button>/);
  assert.match(markup, />Cut<\/button>/);
  assert.match(markup, />Duplicate<\/button>/);
  assert.match(markup, />Delete<\/button>/);
  assert.doesNotMatch(markup, />W-<\/button>/);
  assert.doesNotMatch(markup, />W\+<\/button>/);
  assert.doesNotMatch(markup, />H-<\/button>/);
  assert.doesNotMatch(markup, />H\+<\/button>/);
  assert.match(markup, /aria-label="Resize Desk Time app width"/);
  assert.match(markup, /aria-label="Resize Desk Time app height"/);
  assert.match(markup, /aria-label="Resize Exchanges app width"/);
  assert.match(markup, /aria-label="Resize Calendar app width"/);
  assert.match(
    markup,
    /<div class="prompt-home-card-slot-inner"><div class="prompt-home-card-slot-actions"/,
  );
  assert.match(markup, /data-home-card-delete-target="true"/);
  assert.match(markup, /aria-label="Home apps\. Drop a Home app here to delete it\."/);
  assert.match(markup, /Local Home/);
  assert.doesNotMatch(markup, /7 enabled · 0 disabled/);
  assert.match(
    markup,
    /aria-expanded="false" aria-controls="prompt-home-card-filter-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-card-filter-panel" class="prompt-home-card-filter-body" hidden=""/,
  );
  assert.match(markup, /Manage Apps/);
  assert.match(markup, /aria-label="Movable Home apps"/);
  assert.match(markup, /data-home-card-drag-handle="true"/);
  assert.match(markup, /aria-label="Drag Desk Time app by its header"/);
  assert.match(markup, /aria-label="Drag Exchanges app by its header"/);
  assert.match(markup, /aria-label="Drag Calendar app by its header"/);
  assert.match(markup, /aria-label="Drag Market Prices app by its header"/);
  assert.doesNotMatch(markup, />Move<\/button>/);
  assert.doesNotMatch(markup, /Drag Home apps app by its header/);
  assert.match(markup, /Desk Time/);
  assert.match(
    markup,
    /<span class="eyebrow">Prices<\/span><div class="prompt-home-prices-ticker-strip is-static" aria-label="Scrolling market prices">/,
  );
  assert.match(
    markup,
    /<strong class="prompt-home-prices-ticker-item" aria-hidden="false">NATGAS HENRY_HUB · No mark yet<\/strong>/,
  );
  assert.doesNotMatch(
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
  assert.match(markup, /class="market-news-panel market-news-panel-table"/);
  assert.match(
    markup,
    /aria-label="Scrolling market headlines"/,
  );
  assert.match(markup, /Headlines loading/);
  assert.doesNotMatch(markup, /Live headline context/);
  assert.doesNotMatch(
    markup,
    /<span class="eyebrow">News<\/span><strong>Market News<\/strong>/,
  );
  assert.doesNotMatch(markup, /No latest price marks/);
  assert.match(markup, /aria-label="Sort prices by Product"/);
  assert.match(markup, /aria-label="Sort prices by Change"/);
  assert.match(markup, /aria-label="Sort prices by Frequency"/);
  assert.match(markup, /aria-label="Sort prices by Price Datetime"/);
  assert.doesNotMatch(markup, /aria-label="Sort prices by Time"/);
  assert.match(markup, /aria-label="Sort prices by Updated"/);
  assert.doesNotMatch(
    markup,
    /<button(?=[^>]*aria-label="Sort prices by Product")(?=[^>]*disabled)/,
  );
  assert.match(
    markup,
    /aria-label="Double-click to open the price report for Henry Hub Natural Gas"/,
  );
  assert.match(markup, /No mark yet/);
  assert.doesNotMatch(markup, /Market price marks/);
  assert.doesNotMatch(markup, /0 latest marks · 1 active index/);
  assert.match(markup, /aria-label="Collapse Market Prices"/);
  assert.match(
    markup,
    /class="prompt-home-prices-card-head-actions" aria-label="Market price actions">[\s\S]*>Filter<\/button>[\s\S]*aria-label="Sync latest prices"[\s\S]*>Errors<\/button>[\s\S]*>Sources<\/button>/,
  );
  assert.doesNotMatch(markup, /prompt-home-prices-card-footer/);
  assert.match(
    markup,
    /aria-controls="prompt-home-prices-filter-dialog[^"]*" aria-expanded="false">Filter<\/button>/,
  );
  assert.doesNotMatch(markup, /aria-label="Price filters"/);
  assert.match(
    markup,
    /class="prompt-home-news-card-head-actions" aria-label="Market news actions">[\s\S]*aria-controls="prompt-home-news-filter-dialog[^"]*" aria-expanded="false">Filter<\/button>/,
  );
  assert.doesNotMatch(markup, /aria-label="News filters"/);
  assert.doesNotMatch(markup, /OPEC, LNG, storm impacts/);
  assert.doesNotMatch(markup, /All supply effects/);
  assert.doesNotMatch(markup, /All demand effects/);
  assert.doesNotMatch(markup, /Code, market, commodity, type/);
  assert.doesNotMatch(markup, /Filter by mark status/);
  assert.doesNotMatch(markup, /0 latest marks across 1 active index/);
  assert.match(
    markup,
    /aria-label="Sync latest prices" title="Admin session required to sync price sources" disabled="">Sync<\/button>/,
  );
  assert.match(
    markup,
    /aria-controls="prompt-home-prices-errors-dialog[^"]*" aria-expanded="false" title="No price errors to review" disabled="">Errors<\/button>/,
  );
  assert.match(markup, />Sources<\/button>/);
  assert.doesNotMatch(markup, /Open Home/);
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
    /<span class="eyebrow">Exchanges<\/span><strong>[^<]*venue sessions/,
  );
  assert.match(markup, /27 Alpha Vantage venues/);
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-exchanges-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-exchanges-panel" class="prompt-home-exchanges-card-body"/,
  );
  assert.match(markup, /Representative venue sessions converted into/);
  assert.match(markup, /Alpha Vantage exchange coverage/);
  assert.match(markup, /MARKET_STATUS coverage/);
  assert.match(markup, /NASDAQ, NYSE, AMEX, BATS/);
  assert.match(markup, /XETRA, Berlin, Frankfurt, Munich, Stuttgart/);
  assert.match(
    markup,
    /<span class="eyebrow">Calendar<\/span><strong class="prompt-home-calendar-card-summary">/,
  );
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-calendar-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-calendar-panel" class="prompt-home-calendar-card-body"/,
  );
  assert.match(markup, /aria-controls="prompt-home-calendar-settings-dialog[^"]*" aria-expanded="false">Settings<\/button>/);
  assert.doesNotMatch(markup, /Calendar Settings/);
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
  assert.match(
    markup,
    /class="prompt-home-map-card-head-actions" aria-label="Map actions">[\s\S]*aria-controls="prompt-home-map-filter-dialog[^"]*" aria-expanded="false">Filter<\/button>/,
  );
  assert.doesNotMatch(markup, /Map Filters/);
  assert.doesNotMatch(markup, /asset-map-filters-card/);
  assert.doesNotMatch(markup, /prompt-home-map-filters-card-panel/);
  assert.doesNotMatch(markup, /Activity visibility controls/);
  assert.doesNotMatch(markup, /Filter preset name/);
  assert.doesNotMatch(markup, /Weather Overlay/);
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
  assert.doesNotMatch(
    markup,
    /One inbox for email, Slack, work follow-through, issues, and app messages\. Expand a row only when you need the detail\./,
  );
  assert.match(
    markup,
    /aria-expanded="true" aria-controls="prompt-home-communication-panel"/,
  );
  assert.match(
    markup,
    /id="prompt-home-communication-panel" class="prompt-home-communication-card-body"/,
  );
  assert.match(
    markup,
    /aria-controls="prompt-home-communication-settings-dialog" aria-expanded="false">Settings<\/button>/,
  );
  assert.doesNotMatch(markup, /Messaging Settings/);
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
    /After sign-in, synced Slack rows can appear beside the local Home inbox lanes\./,
  );
  assert.match(markup, /Open Messages Workspace/);
  assert.doesNotMatch(markup, /Open Assistant Console/);
  assert.doesNotMatch(markup, /Open Operations/);
  assert.doesNotMatch(markup, /Sign In to Review Communication/);
  assert.match(
    markup,
    /<div class="prompt-home-prompt-card-copy"><span class="eyebrow prompt-home-prompt-card-title">Desk Assistant<\/span><\/div>/,
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
    /id="prompt-home-calendar-panel" class="prompt-home-calendar-card-body">[\s\S]*Add Event/,
  );
  assert.match(
    markup,
    /id="prompt-home-calendar-panel" class="prompt-home-calendar-card-body">[\s\S]*Settings/,
  );
  assert.match(markup, /href="\/\?view=settings#settings-custom-events-card"/);
  assert.doesNotMatch(markup, /prompt-home-trading-hours-panel/);
  assert.match(markup, /Representative venue sessions converted into/);
  assert.match(markup, /Alpha Vantage exchange coverage/);
  assert.match(markup, /27 primary venues across 16 market rows/);
  assert.match(markup, /NSE, BSE/);
  assert.match(markup, /Cryptocurrency · Global/);
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

test("prompt home prices enables source sync for admin sessions", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: adminAuthSession,
      health: "ok",
      counts: defaultCounts,
      priceIndices: defaultPriceIndices,
      onOpenView: () => undefined,
    }),
  );

  assert.match(
    markup,
    /aria-label="Sync latest prices" title="Sync latest prices from EIA">Sync<\/button>/,
  );
  assert.doesNotMatch(
    markup,
    /aria-label="Sync latest prices"[^>]*disabled/,
  );
});

test("prompt home price rows use the whole record as the drag surface", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      priceIndices: [
        defaultPriceIndices[0],
        {
          code: "ERCOT_NORTH",
          name: "ERCOT North Hub",
          description: null,
          is_active: true,
          commodity_code: "POWER",
          currency_code: "USD",
          unit_code: "MWH",
          provider: "ERCOT",
          market: "US",
          location_code: "ERCOT_NORTH",
        },
      ],
      onOpenView: () => undefined,
    }),
  );

  assert.match(
    markup,
    /prompt-home-price-row prompt-home-price-row-action prompt-home-price-row-draggable/,
  );
  assert.match(
    markup,
    /title="Click and hold to reorder HH_NATGAS; double-click to open its price report"/,
  );
  assert.doesNotMatch(markup, /prompt-home-price-row-drag-handle/);
  assert.doesNotMatch(markup, />Move<\/button>/);
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
          value: -8.25,
          unit_code: "MWH",
          source_frequency: "5MIN",
          source_provider: "CAISO",
          source_series_id: "SP15",
          source_revision: "2026-05-22T13:00:00:ptid:1",
          downloaded_at: "2026-05-22T16:35:00Z",
        }),
        priceObservation({
          id: 4,
          price_index_code: "CAISO_SP15_RT5M",
          observation_date: "2026-05-22",
          value: -6.75,
          unit_code: "MWH",
          source_frequency: "5MIN",
          source_provider: "CAISO",
          source_series_id: "SP15",
          source_revision: "2026-05-22T13:05:00:ptid:1",
          downloaded_at: "2026-05-22T16:40:00Z",
        }),
        priceObservation({
          id: 5,
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
      change: viewModel.rows[0]?.change,
      changeTone: viewModel.rows[0]?.changeTone,
      unit: viewModel.rows[0]?.unit,
      currency: viewModel.rows[0]?.currency,
      frequency: viewModel.rows[0]?.frequency,
      dateTime: viewModel.rows[0]?.dateTime,
      updated: viewModel.rows[0]?.updated,
      source: viewModel.rows[0]?.source,
      hasLatestMark: viewModel.rows[0]?.hasLatestMark,
    },
    {
      product: "POWER",
      location: "SP15",
      price: "-6.75",
      change: "+1.5",
      changeTone: "up",
      unit: "MWH",
      currency: "USD",
      frequency: "5-min",
      dateTime: "05/22/2026 13:05:00 PDT",
      updated: "05/22/2026 16:40:00 UTC",
      source: "CAISO",
      hasLatestMark: true,
    },
  );
  assert.equal(viewModel.previousMarksByCode.CAISO_SP15_RT5M?.id, 3);
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
      source_frequency: "5MIN",
      observation_date: "2026-05-22",
      source_revision: "2026-05-22T13:05:00:ptid:1",
      downloaded_at: "2026-05-22T16:40:00Z",
    }),
  };
  const previousMarksByCode: Record<string, PriceIndexObservationRecord> = {
    BRENT_SPOT_D: priceObservation({
      price_index_code: "BRENT_SPOT_D",
      value: 71,
      observation_date: "2026-05-17",
      downloaded_at: "2026-05-17T10:00:00Z",
    }),
    CAISO_SP15_RT5M: priceObservation({
      price_index_code: "CAISO_SP15_RT5M",
      value: -7,
      unit_code: "MWH",
      source_frequency: "5MIN",
      observation_date: "2026-05-22",
      source_revision: "2026-05-22T13:00:00:ptid:1",
      downloaded_at: "2026-05-22T16:35:00Z",
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
    sortPromptHomeDisplayPriceIndices(
      indices,
      latestMarksByCode,
      {
        field: "change",
        direction: "desc",
      },
      [],
      previousMarksByCode,
    ).map((priceIndex) => priceIndex.code),
    ["BRENT_SPOT_D", "CAISO_SP15_RT5M", "CORN_GLOBAL_IMF_M"],
  );
  assert.deepEqual(
    sortPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      field: "updated",
      direction: "desc",
    }).map((priceIndex) => priceIndex.code),
    ["CAISO_SP15_RT5M", "BRENT_SPOT_D", "CORN_GLOBAL_IMF_M"],
  );
  assert.deepEqual(
    sortPromptHomeDisplayPriceIndices(indices, latestMarksByCode, {
      field: "frequency",
      direction: "asc",
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
  const changeSort = nextPromptHomePriceSortState(null, "change");
  assert.deepEqual(changeSort, {
    field: "change",
    direction: "desc",
  });
  const frequencySort = nextPromptHomePriceSortState(null, "frequency");
  assert.deepEqual(frequencySort, {
    field: "frequency",
    direction: "asc",
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
  const downloadedAt = "2026-05-23T01:02:03Z";
  const priceIndex = defaultPriceIndices[0] as PriceIndexRecord;

  assert.equal(
    formatPromptHomePriceDateTime(
      priceObservation({
        observation_date: "2026-05-16",
        source_published_at: "2026-05-16T14:45:00Z",
        downloaded_at: "2026-05-17T10:00:00Z",
      }),
    ),
    "05/16/2026 00:00:00 UTC",
  );
  assert.equal(
    formatPromptHomePriceDateTime(
      priceObservation({
        observation_date: "2026-05-16",
        source_published_at: null,
        downloaded_at: "2026-05-17T10:00:00Z",
      }),
    ),
    "05/16/2026 00:00:00 UTC",
  );
  assert.equal(
    formatPromptHomePriceDateTime(
      priceObservation({
        observation_date: "2026-05-22",
        source_revision: "2026-05-22T13:05:00:ptid:1",
        downloaded_at: "2026-05-22T16:40:00Z",
      }),
    ),
    "05/22/2026 13:05:00 UTC",
  );
  assert.equal(
    formatPromptHomePriceDateTime(
      priceObservation({
        observation_date: "2026-05-22",
        source_provider: "NYISO",
        source_revision: "2026-05-22T13:05:00:ptid:1",
        downloaded_at: "2026-05-22T16:40:00Z",
      }),
    ),
    "05/22/2026 13:05:00 EDT",
  );
  assert.equal(
    formatPromptHomePriceDateTime(
      priceObservation({
        observation_date: "2026-05-22",
        source_revision: "2026-05-22:HE17:I03",
      }),
    ),
    "05/22/2026 16:15:00 PDT",
  );
  assert.equal(
    formatPromptHomePriceDateTime(
      priceObservation({
        observation_date: "2026-05-25",
        source_revision: "2026-05-25:IE2245",
      }),
    ),
    "05/25/2026 22:45:00 CDT",
  );
  assert.equal(formatPromptHomePriceFrequency("5MIN"), "5-min");
  assert.equal(formatPromptHomePriceFrequency("15MIN"), "15-min");
  assert.equal(formatPromptHomePriceFrequency("hourly"), "Hourly");
  assert.equal(formatPromptHomePriceFrequency("posting"), "Posting");
  assert.equal(
    formatPromptHomePriceChange(
      priceObservation({ value: 73.44 }),
      priceObservation({ value: 72.25 }),
      priceIndex,
    ),
    "+1.19",
  );
  assert.equal(
    formatPromptHomePriceChange(
      priceObservation({ value: 72.05 }),
      priceObservation({ value: 72.25 }),
      priceIndex,
    ),
    "-0.2",
  );
  assert.equal(
    formatPromptHomePriceChange(priceObservation({ value: 72.05 }), null, priceIndex),
    "—",
  );
  assert.equal(
    promptHomePriceChangeTone(
      priceObservation({ value: 72.25 }),
      priceObservation({ value: 72.25 }),
    ),
    "flat",
  );
  assert.equal(
    formatPromptHomePriceDate(
      priceObservation({
        observation_date: "2026-05-22",
        downloaded_at: downloadedAt,
      }),
    ),
    "05/22/2026",
  );
  assert.equal(
    formatPromptHomePriceTime(
      priceObservation({
        source_published_at: "2026-05-22T13:05:00Z",
        downloaded_at: downloadedAt,
      }),
    ),
    "00:00:00",
  );
  assert.equal(
    formatPromptHomePriceUpdatedAt(
      priceObservation({
        downloaded_at: downloadedAt,
      }),
    ),
    "05/23/2026 01:02:03 UTC",
  );
  assert.equal(
    formatPromptHomePriceTime(
      priceObservation({
        downloaded_at: "",
        source_published_at: null,
        source_revision: "2026-05-22:HE17:I03",
      }),
    ),
    "16:15:00",
  );
  assert.equal(
    formatPromptHomePriceTime(
      priceObservation({
        downloaded_at: "",
        source_published_at: null,
        source_revision: "2026-05-22:IE16:45",
      }),
    ),
    "16:45:00",
  );
  assert.equal(
    formatPromptHomePriceTime(
      priceObservation({
        downloaded_at: "",
        source_published_at: null,
        source_revision: "2026-05-22:IE2245",
      }),
    ),
    "22:45:00",
  );
  assert.equal(
    formatPromptHomePriceTime(
      priceObservation({
        downloaded_at: "",
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
    "05/22/2026 23:40:00 UTC",
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
    "ERCOT",
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

  assert.match(
    markup,
    /class="prompt-home-map-card-head-actions" aria-label="Map actions">[\s\S]*aria-controls="prompt-home-map-filter-dialog[^"]*" aria-expanded="false">Filter<\/button>/,
  );
  assert.doesNotMatch(markup, /asset-map-filters-card/);
  assert.doesNotMatch(
    markup,
    /<input type="checkbox" checked="" disabled=""\/><span>Vessels<\/span>/,
  );
});

test("prompt home map adds located market prices as a map layer", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      priceIndices: defaultPriceIndices,
      locations: [
        {
          code: "HENRY_HUB",
          name: "Henry Hub",
          description: null,
          is_active: true,
          location_kind: "POINT",
          location_type: "HUB",
          latitude: 29.8617,
          longitude: -92.0626,
          subdivision_code: "US-LA",
          country_code: "US",
          continent_code: "NA",
        },
      ],
      onOpenView: () => undefined,
    }),
  );

  assert.doesNotMatch(markup, /No asset records match the current filters · 1 market price\./);
  assert.match(
    markup,
    /class="prompt-home-map-card-head-actions" aria-label="Map actions">[\s\S]*aria-controls="prompt-home-map-filter-dialog[^"]*" aria-expanded="false">Filter<\/button>/,
  );
  assert.doesNotMatch(markup, /asset-map-filters-card/);
  assert.doesNotMatch(markup, /<input type="checkbox" checked=""\/><span>Market Prices<\/span>/);
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

  assert.doesNotMatch(markup, /1,000 of 1,050 shown on map/);
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

  assert.doesNotMatch(markup, /Assets hidden · 0 shown on map/);
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

  assert.match(markup, /Tokens Today/);
  assert.match(markup, /Loading\.\.\./);
  assert.match(markup, /Checking assistant token usage\./);
  assert.match(markup, /href="\/\?view=token-analysis#assistant-token-tracker"/);
});

test("workspace topbar data metrics render loading and placeholder states before settings resolve", () => {
  const markup = renderToStaticMarkup(
    createElement(WorkspaceTopbarDatabaseSizeBadge),
  );

  assert.match(markup, /DB Client/);
  assert.match(markup, /DB Server/);
  assert.match(markup, /Data Out/);
  assert.match(markup, /Data In/);
  assert.match(markup, /Loading\.\.\./);
  assert.match(markup, /Checking database size on client\./);
  assert.match(markup, /0 B/);
  assert.match(markup, /0 B\/s/);
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

test("prompt home token summary reports inclusive assistant provider usage", () => {
  const summary = summarizePromptHomeAvailableTokens({
    usage: {
      used_tokens: 4200,
      input_tokens: 3500,
      output_tokens: 700,
      recorded_run_count: 1,
      managed_agent_tokens: 0,
      unassigned_tokens: 4200,
      window_started_at: "2026-05-05T00:00:00Z",
      reset_at: "2026-05-06T00:00:00Z",
    },
  });

  assert.equal(summary.value, "4,200");
  assert.equal(summary.detail, "3,500 input / 700 output across 1 run.");
});

test("prompt home token summary includes managed-agent and unassigned assistant usage", () => {
  const summary = summarizePromptHomeAvailableTokens({
    usage: {
      used_tokens: 11200,
      input_tokens: 9000,
      output_tokens: 2200,
      recorded_run_count: 4,
      managed_agent_tokens: 7000,
      unassigned_tokens: 4200,
      window_started_at: "2026-05-05T00:00:00Z",
      reset_at: "2026-05-06T00:00:00Z",
    },
  });

  assert.equal(summary.value, "11,200");
  assert.equal(summary.detail, "9,000 input / 2,200 output across 4 runs.");
});

test("prompt home token summary reports zero usage without recorded provider tokens", () => {
  const summary = summarizePromptHomeAvailableTokens({
    usage: {
      used_tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      recorded_run_count: 0,
      managed_agent_tokens: 0,
      unassigned_tokens: 0,
      window_started_at: "2026-05-05T00:00:00Z",
      reset_at: "2026-05-06T00:00:00Z",
    },
  });

  assert.equal(summary.value, "0");
  assert.equal(summary.detail, "");
});
