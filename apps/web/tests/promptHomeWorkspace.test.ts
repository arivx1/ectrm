import assert from "node:assert/strict";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "vitest";

import { PromptHomeAvailableTokenBadge } from "../src/workspaces/prompt/PromptHomeAvailableTokenBadge";
import { shouldAutoEnsurePromptHomeData } from "../src/workspaces/prompt/promptHomeAutoLoad";
import { summarizePromptHomeAvailableTokens } from "../src/workspaces/prompt/promptHomeAvailableTokens";
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

test("prompt home renders guided prompts without legacy home actions", () => {
  const markup = renderToStaticMarkup(
    createElement(PromptHomeWorkspace, {
      authSession: null,
      health: "ok",
      counts: defaultCounts,
      onOpenView: () => undefined,
    }),
  );
  const deskTimeIndex = markup.indexOf("Desk Time");
  const mapIndex = markup.indexOf("Open Map Workspace");
  const documentUploadIndex = markup.indexOf("Upload documents");
  const communicationIndex = markup.indexOf("Communication center");
  const promptCardIndex = markup.indexOf("Ask the desk assistant");
  const operatorPromptIndex = markup.indexOf("Operator prompt");

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
  assert.doesNotMatch(
    markup,
    /The traditional screens are still here when you already know where the work belongs\./,
  );
  assert.match(markup, /What are you trying to do\?/);
  assert.match(
    markup,
    /Choose one to reveal a few suggested prompts and direct workspace links\./,
  );
  assert.match(markup, /Trade/);
  assert.match(markup, /Schedule/);
  assert.match(markup, /Manage Shipments/);
  assert.match(markup, /Manage Risk/);
  assert.match(markup, /Settle/);
  assert.match(markup, /Accounting/);
  assert.doesNotMatch(markup, /Tell me updates about the Strait of Hormuz\./);
  assert.doesNotMatch(
    markup,
    /Help me build a simulated trade idea to hedge risk\./,
  );
  assert.doesNotMatch(markup, /Governed Review/);
  assert.doesNotMatch(markup, /Review queue/);
  assert.doesNotMatch(markup, /Sign in to review PDFs/);
  assert.ok(deskTimeIndex >= 0);
  assert.ok(mapIndex > deskTimeIndex);
  assert.ok(documentUploadIndex > mapIndex);
  assert.ok(communicationIndex > documentUploadIndex);
  assert.ok(promptCardIndex > documentUploadIndex);
  assert.ok(promptCardIndex > communicationIndex);
  assert.ok(operatorPromptIndex > promptCardIndex);
  assert.match(markup, />Voice Unavailable</);
  assert.match(markup, /Desk Time/);
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
  assert.match(markup, /aria-label="Check all weather overlays"/);
  assert.match(markup, /Weather overlay layers/);
  assert.match(markup, /Opacity/);
  assert.match(markup, /Markers only/);
  assert.match(markup, /Radar/);
  assert.match(markup, /Precipitation/);
  assert.match(markup, /Wind/);
  assert.match(markup, /Temperature/);
  assert.match(markup, /Humidity/);
  assert.match(markup, /Pressure/);
  assert.match(markup, /Radar overlay opacity/);
  assert.match(markup, /Humidity overlay opacity/);
  assert.match(markup, /aria-label="Show Radar overlay details"/);
  assert.doesNotMatch(markup, /aria-label="Weather overlay layer"/);
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
    /Incoming messages, integrated email, to-do items, and issues now read like one inbox\. This first pass uses typed sample rows for Email, To-Do, Issue, and App Message\./,
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
  assert.match(markup, /aria-label="Selected communication thread"/);
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
  assert.match(
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
