import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import {
  approveAssistantActionRequest,
  listAssistantPromptRouteRecommendations,
  loadAssistantRuntimeSettings,
  rejectAssistantActionRequest,
  submitAssistantPromptNavigationOutcome,
  streamAssistantResponse,
  synthesizeAssistantVoice,
  transcribeAssistantVoice,
} from "../../entities/assistant/api";
import {
  AssistantActionRequestList,
  type AssistantActionDecisionPayload,
} from "../../entities/assistant/AssistantActionRequestList";
import { AssistantChartArtifactList } from "../../shared/AssistantChartArtifactList";
import {
  parseAssistantChartArtifacts,
  splitAssistantMessageText,
} from "../../shared/assistantChartArtifacts";
import {
  loadAssetMapScopeSummary,
  loadInvoiceIssueCandidates,
  loadTradeAttentionCandidates,
  type AssetMapScopeSummary,
  type InvoiceIssueCandidateRecord,
  type TradeAttentionCandidateRecord,
} from "../../entities/app/api";
import {
  isExternalDataSyncProvider,
  runExternalDataSync,
} from "../../entities/app/adminApi";
import { useLatestPriceIndexMarks } from "../../entities/market-data/useLatestPriceIndexMarks";
import {
  buildPromptNavigationIntentKey,
  buildPromptNavigationRouteHandoff,
  INVALID_PROMPT_NAVIGATION_WARNING,
  normalizePromptNavigationIntent,
  parsePromptNavigationIntentsFromAssistantContent,
  promptNavigationIntentDetail,
  promptNavigationIntentLabel,
  type PromptNavigationIntent,
} from "../../entities/app/promptNavigationIntent";
import {
  describeGoogleCalendarEventWindow,
  loadGoogleCalendars,
  loadUpcomingGoogleCalendarEvents,
  parseGoogleCalendarDateOnly,
  type GoogleCalendarEvent,
  type GoogleCalendarListEntry,
} from "../../entities/calendar/googleCalendar";
import {
  loadMessagingWorkspaceState,
  type MessagingWorkspaceConversationRecord,
} from "../../entities/messages/api";
import {
  getGoogleCalendarSessionSnapshot,
  formatGoogleCalendarSelectionSummary,
  googleCalendarSessionTokenIsUsable,
  saveGoogleCalendarEventCache,
  saveGoogleCalendarSelectedCalendars,
  subscribeGoogleCalendarSession,
  type GoogleCalendarSelection,
  type GoogleCalendarSessionSnapshot,
} from "../../entities/calendar/googleCalendarSession";
import {
  hasAdministrativeAccess,
  sessionHeaders,
  type ExternalDataSyncProvider,
} from "../../entities/app/workspaceDataShared";
import { appConfig } from "../../shared/config";
import { usePersistentCollapsibleCardState } from "../../shared/collapsibleCardState";
import { usePersistentPromptHomeCalendarCardState } from "../../shared/promptHomeCalendarSettings";
import type { AppRouteHandoff } from "../../shared/appRouteHandoff";
import type {
  AssistantActionRequest,
  AssistantPersona,
  AssistantPersonaDefinition,
  AssistantPromptNavigationFocusType,
  AssistantPromptResponse,
  AssistantProvider,
  AssistantPromptRouteRecommendation,
  AssistantRuntimeSettings,
  AssistantToolCall,
  AssistantWorkspaceSummaryTarget,
  AssetRecord,
  DeliveryRecord,
  LocationRecord,
  MarketNewsHeadlineRecord,
  PriceIndexRecord,
  SpatialFeatureRecord,
  ViewKey,
} from "../../shared/models";
import type { StoredAuthSession } from "../../shared/mutation";
import {
  clearPromptResumeIntent,
  getPromptResumeIntent,
  savePromptResumeIntent,
  savePromptSignInReturnIntent,
  subscribePromptResumeIntent,
} from "../../shared/promptResumeIntent";
import {
  buildPriceIndexBiReportHandoff,
  PRICE_INDEX_BI_REPORT_ID,
} from "../reports/reportRouteHandoffs";
import { ADMIN_PRICE_SOURCES_SECTION_ID } from "../admin/adminRouteAnchors";
import {
  formatTimeDisplayTimeZonePreferenceLabel,
  getTimeDisplaySettingsSnapshot,
  listTimeDisplayTimeZoneOptions,
  resolveTimeDisplayTimeZone,
  saveTimeDisplaySettingsSnapshot,
  type TimeDisplaySettings,
  type TimeDisplayTimeZoneOption,
} from "../../shared/timeDisplaySettings";
import {
  resolveVoicePlaybackButtonLabel,
  useVoicePlayback,
} from "../../shared/voicePlayback";
import { useVoiceComposer } from "../../shared/voiceComposer";
import {
  assetMapActivityLabelsForAsset,
  assetMapCountryCodeForRecord,
  assetMapCountryCodeForMarketPrice,
  assetMapGeographyLabelForRecord,
  assetMapGeographyLabelForMarketPrice,
  ASSET_MAP_ACTIVITY_LABELS,
  ASSET_MAP_GEOGRAPHY_LABELS,
  assetMapSubdivisionCodeForMarketPrice,
  assetMapSubdivisionCodeForRecord,
  assetMapSubtypeLabelForAsset,
  buildAssetMapCountryOptions,
  buildAssetMapMarketPriceRecords,
  buildAssetMapSubdivisionOptions,
  buildAssetMapSummary,
  formatAssetMapCountryLabel,
  formatAssetMapPlacement,
  formatAssetMapSource,
} from "../../features/reference-data/assetMap";
import {
  createDefaultWeatherOverlayVisibilityState,
  type WeatherOverlayVisibilityState,
} from "../../entities/weather/mapOverlay";
import {
  type PromptHomeCounts,
} from "./promptHomeStarters";
import { shouldAutoEnsurePromptHomeData } from "./promptHomeAutoLoad";
import { PromptHomeCommunicationCard } from "./PromptHomeCommunicationCard";
import { PromptHomeDocumentUploadCard } from "./PromptHomeDocumentUploadCard";
import { buildSlackMessagingInboxMessages } from "../messages/messagingInboxData";
import { getPromptHomeNextClockTickDelay } from "./promptHomeClock";
import {
  PROMPT_HOME_CARD_VISIBILITY_OPTIONS,
  type PromptHomeCardSizeAxis,
  type PromptHomeCardSizeState,
  type PromptHomeCardKey,
  usePersistentPromptHomeCardVisibility,
} from "./promptHomeCardVisibility";
import {
  getPromptHomeCardInstanceId,
  getPromptHomeCardLabel,
  PROMPT_HOME_CARD_MAX_COLLAPSED_ROW_SPAN,
  PROMPT_HOME_CARD_MAX_EXPANDED_ROW_SPAN,
  PROMPT_HOME_CARD_MAX_HORIZONTAL_SPAN,
  PROMPT_HOME_CARD_MIN_SPAN,
  type PromptHomeTemplateCard,
} from "./promptHomeCards";
import { shouldSubmitPromptHomeComposerKey } from "./promptHomeComposerKeybindings";
import {
  mergePromptHomeClassNames,
  PromptHomeCardDragHandleProvider,
  usePromptHomeCardDragHandle,
  type PromptHomeCardDragHandleProps,
} from "./promptHomeCardDrag.ts";
import {
  buildPromptHomePricesCardViewModel,
  formatPromptHomePriceQuoteTypeCode,
  listPromptHomePriceProviders,
  listPromptHomePriceQuoteTypes,
  normalizePromptHomePriceManualOrder,
  nextPromptHomePriceSortState,
  PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER,
  PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE,
  selectPromptHomePriceIndices,
  type PromptHomePriceMarkFilter,
  type PromptHomePriceRowViewModel,
  type PromptHomePriceSortField,
  type PromptHomePriceSortState,
} from "./promptHomePrices";
import {
  getPromptHomeMapRecordLimit,
  normalizePromptHomeMapRecordLimit,
  PROMPT_HOME_MAP_RECORD_LIMIT_OPTIONS,
  savePromptHomeMapRecordLimit,
} from "./promptHomeMapRecordLimit";
import { buildVesselMapRecords } from "../map/vesselMapRecords";
import { buildPromptHomePromotedRoutes } from "./promptPromotedRoutes";
import {
  AssetMapCanvas,
  AssetMapRecordsCard,
  syncAssetActivityVisibilityState,
  sortedUniqueAssetSubtypes,
  syncAssetGeographyVisibilityState,
  setAllAssetSubtypeVisibilityState,
  syncAssetSubtypeVisibilityState,
} from "../reference-data/tabs/AssetMapPanel";
import { SETTINGS_CUSTOM_EVENTS_CARD_ANCHOR_ID } from "../settings/userEventsPanelShared";
import {
  MarketNewsPanel,
  normalizeMarketNewsEffectFilter,
  normalizeMarketNewsHorizonFilter,
  type MarketNewsEffectFilter,
  type MarketNewsHorizonFilter,
} from "../../widgets/news/MarketNewsPanel";

type PromptHomeWorkspaceProps = {
  authSession: StoredAuthSession | null;
  health: string;
  counts: PromptHomeCounts;
  priceIndices?: PriceIndexRecord[];
  assets?: AssetRecord[];
  deliveries?: DeliveryRecord[];
  locations?: LocationRecord[];
  spatialFeatures?: SpatialFeatureRecord[];
  referenceDataLoaded?: boolean;
  referenceDataLoading?: boolean;
  onEnsureReferenceData?: () => Promise<void>;
  deliveriesDataLoaded?: boolean;
  deliveriesDataLoading?: boolean;
  deliveriesDataError?: string;
  onEnsureDeliveriesData?: () => Promise<void>;
  onOpenView: (
    view: ViewKey,
    handoff?: AppRouteHandoff | null,
    options?: { hash?: string | null },
  ) => void;
  customEventsHref?: string;
  onOpenCustomEvents?: () => void;
  onRefreshData?: () => Promise<void>;
  initialMessages?: PromptHomeMessage[];
  initialMapAssetLayerVisible?: boolean;
};

type PromptHomeMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  recordedAt?: string | null;
  provider?: AssistantProvider;
  model?: string;
  agentName?: string | null;
  runId?: number | null;
  warnings?: string[];
  actionRequests?: AssistantActionRequest[];
  navigationIntents?: PromptNavigationIntent[];
  toolCalls?: AssistantToolCall[];
  activity?: PromptHomeAssistantActivity[];
  activityState?: "active" | "complete" | "error";
  activityLabel?: string;
};

type PromptHomeAssistantActivity = {
  id: string;
  label: string;
  detail?: string;
  status: "pending" | "active" | "complete" | "error";
};

type PromptHomeSortableListeners = ReturnType<typeof useSortable>["listeners"];

const PROMPT_HOME_PROMPT_CARD_PANEL_ID = "prompt-home-prompt-card-panel";
const PROMPT_HOME_CARD_FILTER_PANEL_ID = "prompt-home-card-filter-panel";
const PROMPT_HOME_CARD_DELETE_DROP_TARGET_ID =
  "prompt-home-card-delete-drop-target";
const PROMPT_HOME_TIMEFRAME_PANEL_ID = "prompt-home-timeframe-panel";
const PROMPT_HOME_EXCHANGES_PANEL_ID = "prompt-home-exchanges-panel";
const PROMPT_HOME_CALENDAR_PANEL_ID = "prompt-home-calendar-panel";
const PROMPT_HOME_DAY_PANEL_ID = "prompt-home-day-panel";
const PROMPT_HOME_WEEK_PANEL_ID = "prompt-home-week-panel";
const PROMPT_HOME_MONTH_PANEL_ID = "prompt-home-month-panel";
const PROMPT_HOME_PRICES_PANEL_ID = "prompt-home-prices-panel";
const PROMPT_HOME_NEWS_PANEL_ID = "prompt-home-news-panel";
const PROMPT_HOME_MAP_PANEL_ID = "prompt-home-map-panel";
const PROMPT_HOME_INITIAL_WEATHER_OVERLAY_VISIBILITY: WeatherOverlayVisibilityState = {
  ...createDefaultWeatherOverlayVisibilityState(),
  radar: true,
};
const PROMPT_HOME_DAY_CALENDAR_MARKER_LIMIT = 3;
const PROMPT_HOME_WEEK_CALENDAR_MARKER_LIMIT = 7;
const PROMPT_HOME_MONTH_CALENDAR_MARKER_LIMIT = 6;
const PROMPT_HOME_CALENDAR_AGENDA_LIST_LIMIT = 4;
const PROMPT_HOME_CALENDAR_MARKER_DETAIL_ITEM_LIMIT = 3;
const PROMPT_HOME_DAY_HOURS = 24;
const PROMPT_HOME_DAY_MINUTES = PROMPT_HOME_DAY_HOURS * 60;
const PROMPT_HOME_WEEK_DAYS = 7;
const PROMPT_HOME_WEEK_MINUTES =
  PROMPT_HOME_WEEK_DAYS * PROMPT_HOME_DAY_MINUTES;
const PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING = 7;
const PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING = 22;
const PROMPT_HOME_DAY_METER_TICKS = [0, 6, 12, 18, 24];
const PROMPT_HOME_PRICE_REFRESH_INTERVAL_MS = 60_000;
const PROMPT_HOME_PRESET_OPTIONS = [
  "Energy",
  "Agriculture",
  "Metals",
  "Chemicals",
  "Waste & Recyclables",
  "Other",
] as const;
const PROMPT_HOME_PRICE_SORT_HEADERS: {
  field: PromptHomePriceSortField;
  label: string;
}[] = [
  { field: "product", label: "Product" },
  { field: "location", label: "Location" },
  { field: "price", label: "Price" },
  { field: "change", label: "Change" },
  { field: "unit", label: "Unit" },
  { field: "currency", label: "Currency" },
  { field: "frequency", label: "Frequency" },
  { field: "date", label: "Price Datetime" },
  { field: "updated", label: "Updated" },
  { field: "source", label: "Source" },
];
const PROMPT_HOME_WEEKDAY_SHORT_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
const PROMPT_HOME_WEEKDAY_FULL_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const PROMPT_HOME_VERBALIZE_STORAGE_KEY = "ectrm.prompt-home.verbalize";
const PROMPT_HOME_NEWS_DEFAULT_LIMIT = 5;
const PROMPT_HOME_NEWS_DEFAULT_LOOKBACK_DAYS = 3;
const PROMPT_HOME_NEWS_DEFAULT_QUERY = "commodity markets";
const PROMPT_HOME_NEWS_LOOKBACK_DAY_OPTIONS = [1, 2, 3, 7, 14] as const;
const PROMPT_HOME_NEWS_EFFECT_FILTER_OPTIONS: Array<{
  value: MarketNewsEffectFilter;
  label: string;
}> = [
  { value: "all", label: "All effects" },
  { value: "positive", label: "Positive" },
  { value: "negative", label: "Negative" },
  { value: "neutral", label: "Neutral" },
];
const PROMPT_HOME_NEWS_HORIZON_FILTER_OPTIONS: Array<{
  value: MarketNewsHorizonFilter;
  label: string;
}> = [
  { value: "all", label: "All terms" },
  { value: "immediate", label: "Immediate" },
  { value: "near_term", label: "Near Term" },
  { value: "mid_term", label: "Mid Term" },
  { value: "long_term", label: "Long Term" },
  { value: "very_long_term", label: "Very Long Term" },
];

function usePromptHomeCardHeaderDragProps<T extends HTMLElement>() {
  const { className, ...dragHandleAttributes } =
    usePromptHomeCardDragHandle<T>();

  return {
    dragHandleAttributes,
    dragHandleClassName: className,
  };
}

function buildPromptHomeCardDragHandleProps({
  attributes,
  cardLabel,
  listeners,
  setActivatorNodeRef,
}: {
  attributes: DraggableAttributes;
  cardLabel: string;
  listeners: PromptHomeSortableListeners;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}): PromptHomeCardDragHandleProps {
  return {
    ...attributes,
    ...listeners,
    ref: setActivatorNodeRef,
    className: "prompt-home-card-header-drag-handle",
    "data-home-card-drag-handle": "true",
    "aria-label": `Drag ${cardLabel} app by its header`,
  };
}

function promptHomeCardLabel(cardKey: PromptHomeCardKey): string {
  return getPromptHomeCardLabel(cardKey);
}

function promptHomeSafeDomIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "app";
}

function promptHomeInstanceScopedId(
  baseId: string,
  instanceId: string,
  baseInstanceId: string,
): string {
  return instanceId === baseInstanceId
    ? baseId
    : `${baseId}-${promptHomeSafeDomIdPart(instanceId)}`;
}

function promptHomeInstanceStorageKey(
  baseKey: string,
  instanceId: string,
  baseInstanceId: string,
): string {
  return instanceId === baseInstanceId
    ? baseKey
    : `${baseKey}.${instanceId}`;
}

type PromptHomeCardSlotStyle = CSSProperties & {
  "--prompt-home-collapsed-column-span": number;
  "--prompt-home-expanded-column-span": number;
  "--prompt-home-collapsed-row-span": number;
  "--prompt-home-expanded-row-span": number;
};

function promptHomeCardColumnSpanToGridSpan(span: number): number {
  return Math.min(4, Math.max(1, span)) * 3;
}

function buildPromptHomeCardSlotStyle(
  card: PromptHomeTemplateCard,
  orderIndex: number,
): PromptHomeCardSlotStyle {
  return {
    order: orderIndex,
    "--prompt-home-collapsed-column-span": promptHomeCardColumnSpanToGridSpan(
      card.placement.collapsedColumnSpan,
    ),
    "--prompt-home-expanded-column-span": promptHomeCardColumnSpanToGridSpan(
      card.placement.expandedColumnSpan,
    ),
    "--prompt-home-collapsed-row-span": card.placement.collapsedRowSpan,
    "--prompt-home-expanded-row-span": card.placement.expandedRowSpan,
  };
}

function PromptHomeCardDeleteDropTarget({
  active,
  enabled,
  children,
}: {
  active: boolean;
  enabled: boolean;
  children: ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: PROMPT_HOME_CARD_DELETE_DROP_TARGET_ID,
    disabled: !enabled,
  });

  return (
    <section
      ref={setNodeRef}
      className={mergePromptHomeClassNames(
        "prompt-home-card-filter",
        enabled ? "is-card-delete-target" : "",
        active ? "is-card-delete-active" : "",
        isOver ? "is-card-delete-over" : "",
      )}
      aria-label="Home apps. Drop a Home app here to delete it."
      data-home-card-delete-target={enabled ? "true" : "false"}
    >
      {children}
    </section>
  );
}

function PromptHomeCardSlot({
  card,
  orderIndex,
  actions,
  children,
}: {
  card: PromptHomeTemplateCard;
  orderIndex: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const cardKey = card.cardId;
  const instanceId = getPromptHomeCardInstanceId(card);
  const style = buildPromptHomeCardSlotStyle(card, orderIndex);

  return (
    <div
      style={style}
      className={`prompt-home-card-slot prompt-home-card-slot-${cardKey}`}
      data-home-card-key={cardKey}
      data-home-card-instance-id={instanceId}
    >
      <div className="prompt-home-card-slot-inner">
        {actions}
        {children}
      </div>
    </div>
  );
}

function SortablePromptHomeCardSlot({
  card,
  orderIndex,
  actions,
  children,
}: {
  card: PromptHomeTemplateCard;
  orderIndex: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const cardKey = card.cardId;
  const instanceId = getPromptHomeCardInstanceId(card);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: instanceId });
  const style: CSSProperties = {
    ...buildPromptHomeCardSlotStyle(card, orderIndex),
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const dragHandleProps = buildPromptHomeCardDragHandleProps({
    attributes,
    cardLabel: promptHomeCardLabel(cardKey),
    listeners,
    setActivatorNodeRef,
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`prompt-home-card-slot prompt-home-card-slot-${cardKey} ${isDragging ? "is-dragging" : ""}`}
      data-home-card-key={cardKey}
      data-home-card-instance-id={instanceId}
    >
      <PromptHomeCardDragHandleProvider value={dragHandleProps}>
        <div className="prompt-home-card-slot-inner">
          {actions}
          {children}
        </div>
      </PromptHomeCardDragHandleProvider>
    </div>
  );
}

function resolvePromptHomeCardResizeState(
  element: Element,
): PromptHomeCardSizeState {
  const cardSlot = element.closest(".prompt-home-card-slot-inner");
  const cardShell = cardSlot?.querySelector<HTMLElement>(
    [
      ".prompt-home-timeframe-panel",
      ".prompt-home-exchanges-card",
      ".prompt-home-calendar-card",
      ".prompt-home-prices-card",
      ".prompt-home-news-card",
      ".prompt-home-map-card",
      ".prompt-home-document-upload-card",
      ".prompt-home-communication-card",
      ".prompt-home-prompt-card",
    ].join(", "),
  );

  return cardShell?.classList.contains("is-collapsed")
    ? "collapsed"
    : "expanded";
}

function getPromptHomeCardResizeSpan(
  card: PromptHomeTemplateCard,
  state: PromptHomeCardSizeState,
  axis: PromptHomeCardSizeAxis,
): number {
  if (axis === "horizontal") {
    return card.placement.expandedColumnSpan;
  }

  return state === "collapsed"
    ? card.placement.collapsedRowSpan
    : card.placement.expandedRowSpan;
}

function getPromptHomeCardResizeMaxSpan(
  state: PromptHomeCardSizeState,
  axis: PromptHomeCardSizeAxis,
): number {
  if (axis === "horizontal") {
    return PROMPT_HOME_CARD_MAX_HORIZONTAL_SPAN;
  }

  return state === "collapsed"
    ? PROMPT_HOME_CARD_MAX_COLLAPSED_ROW_SPAN
    : PROMPT_HOME_CARD_MAX_EXPANDED_ROW_SPAN;
}

function clampPromptHomeCardResizeSpanForState(
  value: number,
  state: PromptHomeCardSizeState,
  axis: PromptHomeCardSizeAxis,
): number {
  return Math.min(
    getPromptHomeCardResizeMaxSpan(state, axis),
    Math.max(PROMPT_HOME_CARD_MIN_SPAN, value),
  );
}

function resolvePromptHomeCardResizeStepPixels(
  element: Element,
  axis: PromptHomeCardSizeAxis,
  startSpan: number,
): number {
  const cardSlot = element.closest(".prompt-home-card-slot-inner");
  const rect = cardSlot?.getBoundingClientRect();
  const dimension = axis === "horizontal" ? rect?.width : rect?.height;
  const minimumStepPixels = axis === "horizontal" ? 96 : 72;

  return Math.max(
    minimumStepPixels,
    (dimension ?? 0) / Math.max(1, startSpan),
  );
}

function PromptHomeCardResizeHandle({
  axis,
  card,
  disabled,
  onResizeToSpan,
}: {
  axis: PromptHomeCardSizeAxis;
  card: PromptHomeTemplateCard;
  disabled: boolean;
  onResizeToSpan: (
    state: PromptHomeCardSizeState,
    axis: PromptHomeCardSizeAxis,
    span: number,
  ) => void;
}) {
  const label = promptHomeCardLabel(card.cardId);
  const axisLabel = axis === "horizontal" ? "width" : "height";
  const orientation = axis === "horizontal" ? "vertical" : "horizontal";
  const cursor = axis === "horizontal" ? "ew-resize" : "ns-resize";
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    const state = resolvePromptHomeCardResizeState(event.currentTarget);
    const currentSpan = getPromptHomeCardResizeSpan(card, state, axis);
    let nextSpan = currentSpan;

    if (axis === "horizontal") {
      if (event.key === "ArrowRight") {
        nextSpan = currentSpan + 1;
      } else if (event.key === "ArrowLeft") {
        nextSpan = currentSpan - 1;
      }
    } else if (event.key === "ArrowDown") {
      nextSpan = currentSpan + 1;
    } else if (event.key === "ArrowUp") {
      nextSpan = currentSpan - 1;
    }

    nextSpan = clampPromptHomeCardResizeSpanForState(nextSpan, state, axis);
    if (nextSpan === currentSpan) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onResizeToSpan(state, axis, nextSpan);
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const handleElement = event.currentTarget;
    const ownerDocument = handleElement.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) {
      return;
    }

    const state = resolvePromptHomeCardResizeState(handleElement);
    const startSpan = getPromptHomeCardResizeSpan(card, state, axis);
    const startPointerPosition =
      axis === "horizontal" ? event.clientX : event.clientY;
    const stepPixels = resolvePromptHomeCardResizeStepPixels(
      handleElement,
      axis,
      startSpan,
    );
    const previousCursor = ownerDocument.body.style.cursor;
    const previousUserSelect = ownerDocument.body.style.userSelect;
    let lastAppliedSpan = startSpan;

    ownerDocument.body.style.cursor = cursor;
    ownerDocument.body.style.userSelect = "none";

    const applyPointerPosition = (pointerPosition: number) => {
      const pointerDelta = pointerPosition - startPointerPosition;
      const nextSpan = clampPromptHomeCardResizeSpanForState(
        startSpan + Math.round(pointerDelta / stepPixels),
        state,
        axis,
      );
      if (nextSpan === lastAppliedSpan) {
        return;
      }

      lastAppliedSpan = nextSpan;
      onResizeToSpan(state, axis, nextSpan);
    };
    const cleanup = () => {
      ownerDocument.body.style.cursor = previousCursor;
      ownerDocument.body.style.userSelect = previousUserSelect;
      ownerWindow.removeEventListener("pointermove", handlePointerMove);
      ownerWindow.removeEventListener("pointerup", handlePointerEnd);
      ownerWindow.removeEventListener("pointercancel", handlePointerEnd);
    };
    const handlePointerMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      applyPointerPosition(
        axis === "horizontal" ? moveEvent.clientX : moveEvent.clientY,
      );
    };
    const handlePointerEnd = (endEvent: PointerEvent) => {
      applyPointerPosition(
        axis === "horizontal" ? endEvent.clientX : endEvent.clientY,
      );
      cleanup();
    };

    ownerWindow.addEventListener("pointermove", handlePointerMove);
    ownerWindow.addEventListener("pointerup", handlePointerEnd);
    ownerWindow.addEventListener("pointercancel", handlePointerEnd);
  };

  return (
    <div
      role="separator"
      tabIndex={disabled ? -1 : 0}
      className={mergePromptHomeClassNames(
        "prompt-home-card-resize-handle",
        `prompt-home-card-resize-handle-${axis}`,
        disabled ? "is-disabled" : "",
      )}
      aria-label={`Resize ${label} app ${axisLabel}`}
      aria-orientation={orientation}
      aria-valuemin={PROMPT_HOME_CARD_MIN_SPAN}
      aria-valuemax={getPromptHomeCardResizeMaxSpan("expanded", axis)}
      aria-disabled={disabled ? true : undefined}
      data-resize-axis={axis}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
    />
  );
}

function PromptHomeCardSlotActions({
  card,
  clipboard,
  disabled,
  onCopy,
  onCut,
  onDelete,
  onDuplicate,
  onResizeToSpan,
}: {
  card: PromptHomeTemplateCard;
  clipboard: ReturnType<typeof usePersistentPromptHomeCardVisibility>["cardClipboard"];
  disabled: boolean;
  onCopy: () => void;
  onCut: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onResizeToSpan: (
    state: PromptHomeCardSizeState,
    axis: PromptHomeCardSizeAxis,
    span: number,
  ) => void;
}) {
  const instanceId = getPromptHomeCardInstanceId(card);
  const label = promptHomeCardLabel(card.cardId);
  const copyActive =
    clipboard?.mode === "copy" && clipboard.sourceInstanceId === instanceId;
  const cutActive =
    clipboard?.mode === "cut" && clipboard.sourceInstanceId === instanceId;

  return (
    <>
      <div
        className={mergePromptHomeClassNames(
          "prompt-home-card-slot-actions",
          copyActive || cutActive ? "is-active" : "",
        )}
        aria-label={`${label} app actions`}
      >
        <button
          type="button"
          className={`prompt-home-card-slot-action ${copyActive ? "is-active" : ""}`}
          aria-pressed={copyActive}
          disabled={disabled}
          onClick={onCopy}
        >
          Copy
        </button>
        <button
          type="button"
          className={`prompt-home-card-slot-action ${cutActive ? "is-active" : ""}`}
          aria-pressed={cutActive}
          disabled={disabled}
          onClick={onCut}
        >
          Cut
        </button>
        <button
          type="button"
          className="prompt-home-card-slot-action"
          disabled={disabled}
          onClick={onDuplicate}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="prompt-home-card-slot-action prompt-home-card-slot-delete-action"
          disabled={disabled}
          aria-label={`Delete ${label} app`}
          title={`Delete ${label} app`}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
      <PromptHomeCardResizeHandle
        axis="horizontal"
        card={card}
        disabled={disabled}
        onResizeToSpan={onResizeToSpan}
      />
      <PromptHomeCardResizeHandle
        axis="vertical"
        card={card}
        disabled={disabled}
        onResizeToSpan={onResizeToSpan}
      />
    </>
  );
}

function PromptHomePromptCardChrome({
  instanceId,
  expanded,
  children,
  onToggle,
}: {
  instanceId: string;
  expanded: boolean;
  children: ReactNode;
  onToggle: () => void;
}) {
  const { dragHandleAttributes, dragHandleClassName } =
    usePromptHomeCardHeaderDragProps<HTMLDivElement>();
  const panelId = promptHomeInstanceScopedId(
    PROMPT_HOME_PROMPT_CARD_PANEL_ID,
    instanceId,
    "prompt",
  );

  return (
    <section
      className={`prompt-home-prompt-card ${expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <div
        {...dragHandleAttributes}
        className={mergePromptHomeClassNames(
          "prompt-home-prompt-card-head",
          dragHandleClassName,
        )}
      >
        <div className="prompt-home-prompt-card-copy">
          <span className="eyebrow prompt-home-prompt-card-title">Desk Assistant</span>
        </div>

        <div className="prompt-home-prompt-card-side">
          <button
            type="button"
            className="prompt-home-prompt-card-toggle"
            aria-label={
              expanded ? "Collapse Desk Assistant" : "Expand Desk Assistant"
            }
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={onToggle}
          >
            <div className="prompt-home-prompt-card-toggle-meta">
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {expanded ? "−" : "+"}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div
        id={panelId}
        className="prompt-home-prompt-card-body"
        hidden={!expanded}
      >
        {expanded ? children : null}
      </div>
    </section>
  );
}

function PromptHomeAssistantActivityList({
  message,
}: {
  message: PromptHomeMessage;
}) {
  const activityItems = message.activity ?? [];
  if (message.role !== "assistant" || activityItems.length === 0) {
    return null;
  }

  const activityState = message.activityState ?? "active";
  const activityLabel =
    message.activityLabel ??
    (activityState === "complete"
      ? "Ready"
      : activityState === "error"
        ? "Stopped"
        : "Working");

  return (
    <div
      className={`prompt-home-assistant-activity is-${activityState}`}
      aria-live={activityState === "active" ? "polite" : "off"}
    >
      <div className="prompt-home-assistant-activity-head">
        <span aria-hidden="true" />
        <strong>{activityLabel}</strong>
      </div>
      <ol>
        {activityItems.map((item) => (
          <li key={item.id} className={`is-${item.status}`}>
            <span aria-hidden="true" />
            <div>
              <strong>{item.label}</strong>
              {item.detail ? <small>{item.detail}</small> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

type PromptHomeMeterTick = {
  key: string;
  label: string;
  percent: number;
  align?: "start" | "center" | "end";
};

type PromptHomeMeterMarker = {
  key: string;
  label: string;
  detail: string;
  percent: number;
  align?: "start" | "end";
  tone?: "trading" | "calendar";
  hoverDetail?: string;
};

type PromptHomeCalendarAgendaItem = {
  key: string;
  title: string;
  primary: string;
  secondary: string;
  supportingText: string | null;
  description: string | null;
  status: string | null;
  htmlLink: string | null;
  year: number;
  month: number;
  day: number;
  weekdayIndex: number;
  minuteOfDay: number | null;
  hasEnded: boolean;
};

type PromptHomeZonedDateParts = {
  year: number;
  month: number;
  day: number;
  weekdayIndex: number;
  hour: number;
  minute: number;
  second: number;
};

type PromptHomeExchangeSessionWindow = {
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
};

type PromptHomeExchangeSessionDefinition = {
  key: string;
  label: string;
  detail: string;
  tone: "ice" | "lme" | "lme-ring" | "sgx" | "cme" | "eex" | "tocom";
  sourceTimeZone: string;
  sourceWindowLabel: string;
  windows: PromptHomeExchangeSessionWindow[];
};

type PromptHomeExchangeSessionSegment = {
  key: string;
  startPercent: number;
  widthPercent: number;
};

type PromptHomeExchangeSessionLane = PromptHomeExchangeSessionDefinition & {
  displayWindowLabel: string;
  segments: PromptHomeExchangeSessionSegment[];
};

type PromptHomeAlphaVantageExchangeCoverage = {
  key: string;
  marketType: "Equity" | "Forex" | "Cryptocurrency";
  region: string;
  marketGroup: "Americas" | "Europe and Africa" | "Asia-Pacific" | "Global";
  primaryExchanges: string[];
  localWindowLabel: string;
  notes?: string;
};

const PROMPT_HOME_MAJOR_EXCHANGE_SESSIONS: PromptHomeExchangeSessionDefinition[] =
  [
    {
      key: "ice-brent",
      label: "ICE Brent",
      detail: "Representative Brent crude session",
      tone: "ice",
      sourceTimeZone: "Europe/London",
      sourceWindowLabel: "01:00-23:00 London",
      windows: [{ startHour: 1, startMinute: 0, endHour: 23, endMinute: 0 }],
    },
    {
      key: "lme-electronic",
      label: "LMEselect",
      detail: "Electronic metals session",
      tone: "lme",
      sourceTimeZone: "Europe/London",
      sourceWindowLabel: "01:00-19:00 London",
      windows: [{ startHour: 1, startMinute: 0, endHour: 19, endMinute: 0 }],
    },
    {
      key: "lme-ring",
      label: "LME Ring",
      detail: "Open-outcry reference session",
      tone: "lme-ring",
      sourceTimeZone: "Europe/London",
      sourceWindowLabel: "11:40-17:00 London",
      windows: [{ startHour: 11, startMinute: 40, endHour: 17, endMinute: 0 }],
    },
    {
      key: "sgx-msci",
      label: "SGX MSCI",
      detail: "T and T+1 futures sessions",
      tone: "sgx",
      sourceTimeZone: "Asia/Singapore",
      sourceWindowLabel: "08:30-17:20 / 17:50-05:15 Singapore",
      windows: [
        { startHour: 8, startMinute: 30, endHour: 17, endMinute: 20 },
        { startHour: 17, startMinute: 50, endHour: 5, endMinute: 15 },
      ],
    },
    {
      key: "cme-wti",
      label: "CME WTI",
      detail: "NYMEX WTI on CME Globex",
      tone: "cme",
      sourceTimeZone: "America/Chicago",
      sourceWindowLabel: "17:00-16:00 Central",
      windows: [{ startHour: 17, startMinute: 0, endHour: 16, endMinute: 0 }],
    },
    {
      key: "eex-power",
      label: "EEX Power",
      detail: "Representative power derivatives session",
      tone: "eex",
      sourceTimeZone: "Europe/Berlin",
      sourceWindowLabel: "08:00-18:00 Central Europe",
      windows: [{ startHour: 8, startMinute: 0, endHour: 18, endMinute: 0 }],
    },
    {
      key: "tocom-energy",
      label: "TOCOM Energy",
      detail: "Representative Japan energy session",
      tone: "tocom",
      sourceTimeZone: "Asia/Tokyo",
      sourceWindowLabel: "08:45-15:40 / 17:00-05:55 Tokyo",
      windows: [
        { startHour: 8, startMinute: 45, endHour: 15, endMinute: 40 },
        { startHour: 17, startMinute: 0, endHour: 5, endMinute: 55 },
      ],
    },
  ];

const PROMPT_HOME_ALPHA_VANTAGE_EXCHANGE_COVERAGE: PromptHomeAlphaVantageExchangeCoverage[] =
  [
    {
      key: "av-us",
      marketType: "Equity",
      region: "United States",
      marketGroup: "Americas",
      primaryExchanges: ["NASDAQ", "NYSE", "AMEX", "BATS"],
      localWindowLabel: "09:30-16:15 local",
    },
    {
      key: "av-canada",
      marketType: "Equity",
      region: "Canada",
      marketGroup: "Americas",
      primaryExchanges: ["Toronto", "Toronto Ventures"],
      localWindowLabel: "09:30-16:00 local",
    },
    {
      key: "av-mexico",
      marketType: "Equity",
      region: "Mexico",
      marketGroup: "Americas",
      primaryExchanges: ["Mexico"],
      localWindowLabel: "08:30-15:00 local",
    },
    {
      key: "av-brazil",
      marketType: "Equity",
      region: "Brazil",
      marketGroup: "Americas",
      primaryExchanges: ["Sao Paolo"],
      localWindowLabel: "10:00-17:30 local",
    },
    {
      key: "av-united-kingdom",
      marketType: "Equity",
      region: "United Kingdom",
      marketGroup: "Europe and Africa",
      primaryExchanges: ["London"],
      localWindowLabel: "08:00-16:30 local",
    },
    {
      key: "av-germany",
      marketType: "Equity",
      region: "Germany",
      marketGroup: "Europe and Africa",
      primaryExchanges: ["XETRA", "Berlin", "Frankfurt", "Munich", "Stuttgart"],
      localWindowLabel: "08:00-20:00 local",
    },
    {
      key: "av-france",
      marketType: "Equity",
      region: "France",
      marketGroup: "Europe and Africa",
      primaryExchanges: ["Paris"],
      localWindowLabel: "09:00-17:30 local",
    },
    {
      key: "av-spain",
      marketType: "Equity",
      region: "Spain",
      marketGroup: "Europe and Africa",
      primaryExchanges: ["Barcelona", "Madrid"],
      localWindowLabel: "09:00-17:30 local",
    },
    {
      key: "av-portugal",
      marketType: "Equity",
      region: "Portugal",
      marketGroup: "Europe and Africa",
      primaryExchanges: ["Lisbon"],
      localWindowLabel: "08:00-16:30 local",
    },
    {
      key: "av-south-africa",
      marketType: "Equity",
      region: "South Africa",
      marketGroup: "Europe and Africa",
      primaryExchanges: ["Johannesburg"],
      localWindowLabel: "09:00-17:00 local",
    },
    {
      key: "av-japan",
      marketType: "Equity",
      region: "Japan",
      marketGroup: "Asia-Pacific",
      primaryExchanges: ["Tokyo"],
      localWindowLabel: "09:00-15:00 local",
      notes: "Noon trading break",
    },
    {
      key: "av-china",
      marketType: "Equity",
      region: "Mainland China",
      marketGroup: "Asia-Pacific",
      primaryExchanges: ["Shanghai", "Shenzhen"],
      localWindowLabel: "09:30-15:00 local",
      notes: "Noon trading break",
    },
    {
      key: "av-hong-kong",
      marketType: "Equity",
      region: "Hong Kong",
      marketGroup: "Asia-Pacific",
      primaryExchanges: ["Hong Kong"],
      localWindowLabel: "09:30-16:00 local",
      notes: "Noon trading break",
    },
    {
      key: "av-india",
      marketType: "Equity",
      region: "India",
      marketGroup: "Asia-Pacific",
      primaryExchanges: ["NSE", "BSE"],
      localWindowLabel: "09:15-15:30 local",
    },
    {
      key: "av-forex-global",
      marketType: "Forex",
      region: "Global",
      marketGroup: "Global",
      primaryExchanges: ["Global"],
      localWindowLabel: "00:00-23:59",
      notes: "Closed Friday 16:00 EST to Sunday 17:00 EST",
    },
    {
      key: "av-crypto-global",
      marketType: "Cryptocurrency",
      region: "Global",
      marketGroup: "Global",
      primaryExchanges: ["Global"],
      localWindowLabel: "00:00-23:59",
      notes: "Open 24 hours a day",
    },
  ];

function createPromptMessageId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildInitialAssistantActivity(): PromptHomeAssistantActivity[] {
  return [
    {
      id: "context",
      label: "Preparing governed context",
      status: "active",
    },
    {
      id: "tools",
      label: "Checking live data access",
      status: "pending",
    },
    {
      id: "response",
      label: "Drafting response",
      status: "pending",
    },
  ];
}

function buildRunningAssistantActivity(): PromptHomeAssistantActivity[] {
  return [
    {
      id: "context",
      label: "Prepared governed context",
      status: "complete",
    },
    {
      id: "tools",
      label: "Checking live data access",
      status: "active",
    },
    {
      id: "response",
      label: "Drafting response",
      status: "pending",
    },
  ];
}

function buildStreamingAssistantActivity(): PromptHomeAssistantActivity[] {
  return [
    {
      id: "context",
      label: "Prepared governed context",
      status: "complete",
    },
    {
      id: "tools",
      label: "Resolved live data access",
      status: "complete",
    },
    {
      id: "response",
      label: "Writing response",
      status: "active",
    },
  ];
}

function formatAssistantToolActivityDetail(toolCalls: AssistantToolCall[]): string {
  if (toolCalls.length === 0) {
    return "No live tool calls used.";
  }

  const summaries = toolCalls
    .map((toolCall) => toolCall.summary.trim())
    .filter(Boolean);
  if (summaries.length === 1) {
    return summaries[0] ?? "1 live lookup completed.";
  }
  if (summaries.length > 1) {
    return summaries.slice(0, 2).join(" · ");
  }

  const toolNames = toolCalls.map((toolCall) => toolCall.tool_name).filter(Boolean);
  return toolNames.length > 0
    ? toolNames.slice(0, 3).join(", ")
    : `${toolCalls.length.toLocaleString()} live lookup${toolCalls.length === 1 ? "" : "s"} completed.`;
}

function buildCompletedAssistantActivity(
  toolCalls: AssistantToolCall[],
): PromptHomeAssistantActivity[] {
  const toolCallCount = toolCalls.length;
  return [
    {
      id: "context",
      label: "Prepared governed context",
      status: "complete",
    },
    {
      id: "tools",
      label:
        toolCallCount > 0
          ? `Checked ${toolCallCount.toLocaleString()} live lookup${toolCallCount === 1 ? "" : "s"}`
          : "Used prompt context",
      detail: formatAssistantToolActivityDetail(toolCalls),
      status: "complete",
    },
    {
      id: "response",
      label: "Response ready",
      status: "complete",
    },
  ];
}

function buildErroredAssistantActivity(
  detail: string,
): PromptHomeAssistantActivity[] {
  return [
    {
      id: "context",
      label: "Prepared governed context",
      status: "complete",
    },
    {
      id: "response",
      label: "Response stopped",
      detail,
      status: "error",
    },
  ];
}

function buildMessageInitials(label: string, fallback: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return fallback;
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function meterPercentForRatio(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return clampPercent((value / total) * 100);
}

function meterPercentForHourEnding(hourEnding: number): number {
  return meterPercentForRatio(hourEnding, PROMPT_HOME_DAY_HOURS);
}

function normalizeMinutes(value: number): number {
  return (
    ((value % PROMPT_HOME_DAY_MINUTES) + PROMPT_HOME_DAY_MINUTES) %
    PROMPT_HOME_DAY_MINUTES
  );
}

function minutesIntoDay(parts: PromptHomeZonedDateParts): number {
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

function formatHourEndingLabel(hourEnding: number): string {
  return `HE${hourEnding.toString().padStart(2, "0")}`;
}

function currentHourEnding(parts: PromptHomeZonedDateParts): number {
  if (parts.minute === 0 && parts.second === 0) {
    return parts.hour;
  }

  return Math.min(PROMPT_HOME_DAY_HOURS, parts.hour + 1);
}

function formatPromptHomeClockTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function formatPromptHomeMonthLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatPromptHomeMonthDayLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(value);
}

function formatPromptHomeSummaryMonthDayLabel(
  value: Date,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "2-digit",
  }).format(value);
}

function dayCountSuffix(value: number): string {
  if (value % 100 >= 11 && value % 100 <= 13) {
    return "th";
  }

  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatOrdinal(value: number): string {
  return `${value}${dayCountSuffix(value)}`;
}

function parseFormatterParts(
  parts: Intl.DateTimeFormatPart[],
): PromptHomeZonedDateParts {
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  const weekdayIndex = PROMPT_HOME_WEEKDAY_SHORT_LABELS.indexOf(
    (values.weekday ??
      "Sun") as (typeof PROMPT_HOME_WEEKDAY_SHORT_LABELS)[number],
  );

  return {
    year: Number.parseInt(values.year ?? "1970", 10),
    month: Number.parseInt(values.month ?? "1", 10),
    day: Number.parseInt(values.day ?? "1", 10),
    weekdayIndex: weekdayIndex >= 0 ? weekdayIndex : 0,
    hour: Number.parseInt(values.hour ?? "0", 10),
    minute: Number.parseInt(values.minute ?? "0", 10),
    second: Number.parseInt(values.second ?? "0", 10),
  };
}

function getPromptHomeZonedDateParts(
  value: Date,
  timeZone: string,
): PromptHomeZonedDateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  });

  return parseFormatterParts(formatter.formatToParts(value));
}

function parseTimeZoneOffsetLabel(value: string): number | null {
  if (value === "GMT" || value === "UTC") {
    return 0;
  }

  const match = value.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return null;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2] ?? "0", 10);
  const minutes = Number.parseInt(match[3] ?? "0", 10);
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(value: Date, timeZone: string): number {
  const offsetFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const offsetLabel = offsetFormatter
    .formatToParts(value)
    .find((part) => part.type === "timeZoneName")?.value;
  const parsedOffset = offsetLabel
    ? parseTimeZoneOffsetLabel(offsetLabel)
    : null;
  if (parsedOffset !== null) {
    return parsedOffset;
  }

  const zonedDateParts = getPromptHomeZonedDateParts(value, timeZone);
  const zonedTimestamp = Date.UTC(
    zonedDateParts.year,
    zonedDateParts.month - 1,
    zonedDateParts.day,
    zonedDateParts.hour,
    zonedDateParts.minute,
    zonedDateParts.second,
  );
  return Math.round((zonedTimestamp - value.getTime()) / 60_000);
}

function daysInMonth(parts: PromptHomeZonedDateParts): number {
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

function promptHomeCalendarDayKey(
  year: number,
  month: number,
  day: number,
): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function promptHomeCalendarLocalDateDayKey(value: Date): number {
  return promptHomeCalendarDayKey(
    value.getFullYear(),
    value.getMonth() + 1,
    value.getDate(),
  );
}

function formatCalendarEventCountLabel(count: number): string {
  return `${count} ${count === 1 ? "event" : "events"}`;
}

function googleCalendarEventHasEnded(args: {
  event: GoogleCalendarEvent;
  currentTime: Date;
  timeZone: string;
}): boolean {
  const { event, currentTime, timeZone } = args;

  if (event.end.dateTime) {
    const end = new Date(event.end.dateTime);
    if (!Number.isNaN(end.getTime())) {
      return end.getTime() < currentTime.getTime();
    }
  }

  if (event.start.dateTime) {
    const start = new Date(event.start.dateTime);
    if (!Number.isNaN(start.getTime())) {
      return start.getTime() < currentTime.getTime();
    }
  }

  const currentParts = getPromptHomeZonedDateParts(currentTime, timeZone);
  const currentDayKey = promptHomeCalendarDayKey(
    currentParts.year,
    currentParts.month,
    currentParts.day,
  );
  const exclusiveEnd = parseGoogleCalendarDateOnly(event.end.date);
  if (exclusiveEnd) {
    return promptHomeCalendarLocalDateDayKey(exclusiveEnd) <= currentDayKey;
  }

  const start = parseGoogleCalendarDateOnly(event.start.date);
  return start ? promptHomeCalendarLocalDateDayKey(start) < currentDayKey : false;
}

function normalizePromptHomeCalendarDetailText(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalizedValue = value.replace(/\s+/g, " ").trim();
  if (!normalizedValue) {
    return null;
  }

  return normalizedValue.length <= 160
    ? normalizedValue
    : `${normalizedValue.slice(0, 157).trimEnd()}...`;
}

function buildPromptHomeCalendarAgendaItemHoverLines(
  item: PromptHomeCalendarAgendaItem,
): string[] {
  const lines = [`${item.title} - ${item.primary} · ${item.secondary}`];
  const supportingLines: string[] = [];
  const supportingText = normalizePromptHomeCalendarDetailText(
    item.supportingText,
  );
  if (supportingText) {
    supportingLines.push(supportingText);
  }

  const normalizedStatus = normalizePromptHomeCalendarDetailText(item.status);
  if (
    normalizedStatus &&
    normalizedStatus.toLowerCase() !== "confirmed"
  ) {
    supportingLines.push(`Status: ${normalizedStatus}`);
  }

  if (supportingLines.length > 0) {
    lines.push(supportingLines.join(" · "));
  }

  const description = normalizePromptHomeCalendarDetailText(item.description);
  if (description) {
    lines.push(description);
  }

  return lines;
}

function buildPromptHomeCalendarAgendaItemHoverDetail(
  item: PromptHomeCalendarAgendaItem,
): string {
  return buildPromptHomeCalendarAgendaItemHoverLines(item).join("\n");
}

function promptHomeTooltipIdPart(value: string): string {
  const normalizedValue = value
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return normalizedValue || "event";
}

function renderPromptHomeCalendarTooltipLines(detail: string): ReactNode {
  const lines = detail
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line, index) =>
    index === 0 ? (
      <strong key={`${index}-${line}`}>{line}</strong>
    ) : (
      <span key={`${index}-${line}`}>{line}</span>
    ),
  );
}

function buildPromptHomeCalendarMarkerHoverDetail(args: {
  summary: string;
  items: PromptHomeCalendarAgendaItem[];
}): string {
  const detailItems = args.items.filter((item) => !item.hasEnded);
  const visibleItems = detailItems.slice(
    0,
    PROMPT_HOME_CALENDAR_MARKER_DETAIL_ITEM_LIMIT,
  );
  const lines = [args.summary];

  for (const item of visibleItems) {
    lines.push(...buildPromptHomeCalendarAgendaItemHoverLines(item));
  }

  const hiddenCount = Math.max(0, detailItems.length - visibleItems.length);
  if (hiddenCount > 0) {
    lines.push(
      `+${hiddenCount} more ${hiddenCount === 1 ? "event" : "events"}`,
    );
  }

  return lines.join("\n");
}

function truncatePromptHomeCalendarMarkerLabel(value: string): string {
  const normalizedValue = value.trim();
  if (normalizedValue.length <= 18) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 17).trimEnd()}…`;
}

function calendarMarkerAlignForPercent(
  percent: number,
): "start" | "end" {
  return percent >= 72 ? "end" : "start";
}

function buildPromptHomeCalendarAgendaItems(args: {
  events: GoogleCalendarEvent[];
  currentTime: Date;
  timeZone: string;
}): PromptHomeCalendarAgendaItem[] {
  const items: PromptHomeCalendarAgendaItem[] = [];

  for (const event of args.events) {
    const eventWindow = describeGoogleCalendarEventWindow(event, {
      now: args.currentTime,
      timeZone: args.timeZone,
    });
    const hasEnded = googleCalendarEventHasEnded({
      event,
      currentTime: args.currentTime,
      timeZone: args.timeZone,
    });

    if (event.start.dateTime) {
      const start = new Date(event.start.dateTime);
      if (Number.isNaN(start.getTime())) {
        continue;
      }

      const parts = getPromptHomeZonedDateParts(start, args.timeZone);
      items.push({
        key: event.id,
        title: event.summary,
        primary: eventWindow.primary,
        secondary: eventWindow.secondary,
        supportingText: event.location ?? event.organizerEmail ?? null,
        description: event.description,
        status: event.status,
        htmlLink: event.htmlLink,
        year: parts.year,
        month: parts.month,
        day: parts.day,
        weekdayIndex: parts.weekdayIndex,
        minuteOfDay: parts.hour * 60 + parts.minute,
        hasEnded,
      });
      continue;
    }

    const start = parseGoogleCalendarDateOnly(event.start.date);
    if (!start) {
      continue;
    }

    items.push({
      key: event.id,
      title: event.summary,
      primary: eventWindow.primary,
      secondary: eventWindow.secondary,
      supportingText: event.location ?? event.organizerEmail ?? null,
      description: event.description,
      status: event.status,
      htmlLink: event.htmlLink,
      year: start.getFullYear(),
      month: start.getMonth() + 1,
      day: start.getDate(),
      weekdayIndex: start.getDay(),
      minuteOfDay: null,
      hasEnded,
    });
  }

  return items.sort((left, right) => {
      const leftDayKey = promptHomeCalendarDayKey(
        left.year,
        left.month,
        left.day,
      );
      const rightDayKey = promptHomeCalendarDayKey(
        right.year,
        right.month,
        right.day,
      );
      if (leftDayKey !== rightDayKey) {
        return leftDayKey - rightDayKey;
      }

      return (left.minuteOfDay ?? -1) - (right.minuteOfDay ?? -1);
    });
}

function buildPromptHomeCalendarDayMarkers(
  items: PromptHomeCalendarAgendaItem[],
): PromptHomeMeterMarker[] {
  return items
    .filter((item) => item.minuteOfDay !== null)
    .slice(0, PROMPT_HOME_DAY_CALENDAR_MARKER_LIMIT)
    .map((item) => {
      const percent = meterPercentForRatio(
        item.minuteOfDay ?? 0,
        PROMPT_HOME_DAY_MINUTES,
      );
      return {
        key: `calendar-day-${item.key}`,
        label: truncatePromptHomeCalendarMarkerLabel(item.title),
        detail: item.secondary,
        percent,
        align: calendarMarkerAlignForPercent(percent),
        tone: "calendar",
        hoverDetail: buildPromptHomeCalendarAgendaItemHoverDetail(item),
      };
    });
}

function buildPromptHomeCalendarWeekMarkers(
  items: PromptHomeCalendarAgendaItem[],
): PromptHomeMeterMarker[] {
  const itemsByWeekdayIndex = new Map<number, PromptHomeCalendarAgendaItem[]>();

  for (const item of items) {
    const weekdayItems = itemsByWeekdayIndex.get(item.weekdayIndex) ?? [];
    weekdayItems.push(item);
    itemsByWeekdayIndex.set(item.weekdayIndex, weekdayItems);
  }

  return Array.from(itemsByWeekdayIndex.entries())
    .sort((left, right) => left[0] - right[0])
    .slice(0, PROMPT_HOME_WEEK_CALENDAR_MARKER_LIMIT)
    .map(([weekdayIndex, weekdayItems]) => {
      const count = weekdayItems.length;
      const percent = meterPercentForRatio(
        weekdayIndex * PROMPT_HOME_DAY_MINUTES + PROMPT_HOME_DAY_MINUTES / 2,
        PROMPT_HOME_WEEK_MINUTES,
      );
      return {
        key: `calendar-week-${weekdayIndex}`,
        label: PROMPT_HOME_WEEKDAY_SHORT_LABELS[weekdayIndex] ?? "Day",
        detail: formatCalendarEventCountLabel(count),
        percent,
        align:
          weekdayIndex === PROMPT_HOME_WEEK_DAYS - 1 ? "end" : "start",
        tone: "calendar",
        hoverDetail: buildPromptHomeCalendarMarkerHoverDetail({
          summary: `${PROMPT_HOME_WEEKDAY_FULL_LABELS[weekdayIndex] ?? "Day"} · ${formatCalendarEventCountLabel(count)}`,
          items: weekdayItems,
        }),
      };
    });
}

function buildPromptHomeCalendarMonthMarkers(args: {
  items: PromptHomeCalendarAgendaItem[];
  monthDayTotal: number;
}): PromptHomeMeterMarker[] {
  const itemsByDay = new Map<number, PromptHomeCalendarAgendaItem[]>();

  for (const item of args.items) {
    const dayItems = itemsByDay.get(item.day) ?? [];
    dayItems.push(item);
    itemsByDay.set(item.day, dayItems);
  }

  return Array.from(itemsByDay.entries())
    .sort((left, right) => left[0] - right[0])
    .slice(0, PROMPT_HOME_MONTH_CALENDAR_MARKER_LIMIT)
    .map(([day, dayItems]) => {
      const count = dayItems.length;
      const percent = meterPercentForRatio(
        (day - 1) * PROMPT_HOME_DAY_MINUTES +
          PROMPT_HOME_DAY_MINUTES / 2,
        args.monthDayTotal * PROMPT_HOME_DAY_MINUTES,
      );
      return {
        key: `calendar-month-${day}`,
        label: `Day ${day}`,
        detail: formatCalendarEventCountLabel(count),
        percent,
        align: calendarMarkerAlignForPercent(percent),
        tone: "calendar",
        hoverDetail: buildPromptHomeCalendarMarkerHoverDetail({
          summary: `Day ${day} · ${formatCalendarEventCountLabel(count)}`,
          items: dayItems,
        }),
      };
    });
}

function formatPromptHomeCalendarAgendaSummary(args: {
  calendarSession: GoogleCalendarSessionSnapshot;
  loading: boolean;
  error: string;
}): string {
  const cachedAtLabel = (() => {
    if (!args.calendarSession.cachedAt) {
      return null;
    }

    const parsedCachedAt = new Date(args.calendarSession.cachedAt);
    if (Number.isNaN(parsedCachedAt.getTime())) {
      return null;
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(parsedCachedAt);
  })();

  if (args.loading) {
    return "Refreshing calendar events…";
  }

  if (args.error) {
    return args.error;
  }

  if (args.calendarSession.selectedCalendarSummary) {
    return cachedAtLabel
      ? `${args.calendarSession.selectedCalendarSummary} · cached ${cachedAtLabel}`
      : args.calendarSession.selectedCalendarSummary;
  }

  if (cachedAtLabel) {
    return `Cached ${cachedAtLabel}`;
  }

  if (args.calendarSession.scopeGranted) {
    return "Reconnect Google Calendar in Settings to refresh schedule events.";
  }

  return "Connect Google Calendar in Settings to overlay schedule events here.";
}

function googleCalendarSelectionSignature(
  selections: GoogleCalendarSelection[],
): string {
  return selections
    .map((selection) => `${selection.id}:${selection.summary ?? ""}`)
    .join("|");
}

function scopeGoogleCalendarEventsForHome(args: {
  events: GoogleCalendarEvent[];
  calendar: GoogleCalendarSelection;
  calendarCount: number;
}): GoogleCalendarEvent[] {
  if (args.calendarCount <= 1) {
    return args.events;
  }

  return args.events.map((event) => ({
    ...event,
    id: `${args.calendar.id}:${event.id}`,
  }));
}

function clearGoogleCalendarHomeEventCache(
  selections: GoogleCalendarSelection[],
): void {
  saveGoogleCalendarEventCache({
    selectedCalendarSummary: formatGoogleCalendarSelectionSummary(selections),
    events: [],
    cachedAt: "",
  });
}

function windowDurationMinutes(
  window: PromptHomeExchangeSessionWindow,
): number {
  const startMinutes = window.startHour * 60 + window.startMinute;
  const endMinutes = window.endHour * 60 + window.endMinute;
  return endMinutes > startMinutes
    ? endMinutes - startMinutes
    : PROMPT_HOME_DAY_MINUTES - startMinutes + endMinutes;
}

function formatPromptHomeClockMinutes(value: number): string {
  const normalizedValue = normalizeMinutes(value);
  const hours = Math.floor(normalizedValue / 60);
  const minutes = normalizedValue % 60;
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const meridiem = hours >= 12 ? "PM" : "AM";
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${meridiem}`;
}

function buildExchangeSessionWindowDisplayLabel(args: {
  window: PromptHomeExchangeSessionWindow;
  sourceOffsetMinutes: number;
  targetOffsetMinutes: number;
}): string {
  const sourceStartMinutes =
    args.window.startHour * 60 + args.window.startMinute;
  const durationMinutes = windowDurationMinutes(args.window);
  const targetStartMinutes = normalizeMinutes(
    sourceStartMinutes - args.sourceOffsetMinutes + args.targetOffsetMinutes,
  );
  const targetEndMinutes = normalizeMinutes(
    targetStartMinutes + durationMinutes,
  );
  const wrapsToNextDay =
    durationMinutes > PROMPT_HOME_DAY_MINUTES - targetStartMinutes;

  return `${formatPromptHomeClockMinutes(targetStartMinutes)} to ${formatPromptHomeClockMinutes(
    targetEndMinutes,
  )}${wrapsToNextDay ? " next day" : ""}`;
}

function buildExchangeSessionWindowSegments(args: {
  keyPrefix: string;
  window: PromptHomeExchangeSessionWindow;
  sourceOffsetMinutes: number;
  targetOffsetMinutes: number;
}): PromptHomeExchangeSessionSegment[] {
  const sourceStartMinutes =
    args.window.startHour * 60 + args.window.startMinute;
  const durationMinutes = windowDurationMinutes(args.window);
  if (durationMinutes <= 0) {
    return [];
  }

  const targetStartMinutes = normalizeMinutes(
    sourceStartMinutes - args.sourceOffsetMinutes + args.targetOffsetMinutes,
  );
  const firstSegmentMinutes =
    durationMinutes >= PROMPT_HOME_DAY_MINUTES
      ? PROMPT_HOME_DAY_MINUTES
      : Math.min(durationMinutes, PROMPT_HOME_DAY_MINUTES - targetStartMinutes);
  const segments: PromptHomeExchangeSessionSegment[] = [
    {
      key: `${args.keyPrefix}-0`,
      startPercent: meterPercentForRatio(
        targetStartMinutes,
        PROMPT_HOME_DAY_MINUTES,
      ),
      widthPercent: meterPercentForRatio(
        firstSegmentMinutes,
        PROMPT_HOME_DAY_MINUTES,
      ),
    },
  ];
  const remainingMinutes = durationMinutes - firstSegmentMinutes;

  if (remainingMinutes > 0) {
    segments.push({
      key: `${args.keyPrefix}-1`,
      startPercent: 0,
      widthPercent: meterPercentForRatio(
        remainingMinutes,
        PROMPT_HOME_DAY_MINUTES,
      ),
    });
  }

  return segments.filter((segment) => segment.widthPercent > 0);
}

function buildPromptHomeExchangeSessionLane(
  definition: PromptHomeExchangeSessionDefinition,
  targetTimeZone: string,
  currentTime: Date,
): PromptHomeExchangeSessionLane {
  const sourceOffsetMinutes = getTimeZoneOffsetMinutes(
    currentTime,
    definition.sourceTimeZone,
  );
  const targetOffsetMinutes = getTimeZoneOffsetMinutes(
    currentTime,
    targetTimeZone,
  );

  return {
    ...definition,
    displayWindowLabel: definition.windows
      .map((window) =>
        buildExchangeSessionWindowDisplayLabel({
          window,
          sourceOffsetMinutes,
          targetOffsetMinutes,
        }),
      )
      .join(" / "),
    segments: definition.windows.flatMap((window, index) =>
      buildExchangeSessionWindowSegments({
        keyPrefix: `${definition.key}-${index}`,
        window,
        sourceOffsetMinutes,
        targetOffsetMinutes,
      }),
    ),
  };
}

function buildWeekMeterTicks(): PromptHomeMeterTick[] {
  return PROMPT_HOME_WEEKDAY_SHORT_LABELS.map((label, index) => ({
    key: label,
    label,
    percent: meterPercentForRatio(index, PROMPT_HOME_WEEK_DAYS - 1),
    align:
      index === 0
        ? "start"
        : index === PROMPT_HOME_WEEK_DAYS - 1
          ? "end"
          : "center",
  }));
}

function buildMonthMeterTicks(dayTotal: number): PromptHomeMeterTick[] {
  const checkpoints = [
    1,
    Math.ceil(dayTotal * 0.25),
    Math.ceil(dayTotal * 0.5),
    Math.ceil(dayTotal * 0.75),
    dayTotal,
  ];
  const uniqueCheckpoints = checkpoints.filter(
    (day, index) => checkpoints.indexOf(day) === index,
  );

  return uniqueCheckpoints.map((day, index) => ({
    key: String(day),
    label: day === dayTotal ? "EOM" : String(day),
    percent: meterPercentForRatio(day - 1, Math.max(dayTotal - 1, 1)),
    align:
      index === 0
        ? "start"
        : index === uniqueCheckpoints.length - 1
          ? "end"
          : "center",
  }));
}

function formatCount(value: number | null): string {
  return typeof value === "number" ? value.toLocaleString() : "n/a";
}

function formatPromptTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatPromptThreadTimestamp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPromptThreadDayLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function formatPromotedRouteEvidence(
  recommendation: AssistantPromptRouteRecommendation,
): string {
  const acceptanceLabel =
    typeof recommendation.acceptance_rate === "number" &&
    Number.isFinite(recommendation.acceptance_rate)
      ? `${Math.round(recommendation.acceptance_rate * 100)}% accepted`
      : "Accepted route";
  return `${recommendation.accepted_count}/${recommendation.outcome_count} accepted · ${acceptanceLabel}`;
}

function formatPromotedRouteSummary(
  routes: Array<{ readiness: "ready" | "waiting" | "cooling_off" }>,
): string {
  const readyCount = routes.filter(
    (route) => route.readiness === "ready",
  ).length;
  const waitingCount = routes.filter(
    (route) => route.readiness === "waiting",
  ).length;
  const coolingCount = routes.filter(
    (route) => route.readiness === "cooling_off",
  ).length;
  const parts: string[] = [];
  if (readyCount > 0) {
    parts.push(`${readyCount} ready`);
  }
  if (waitingCount > 0) {
    parts.push(`${waitingCount} gathering more signal`);
  }
  if (coolingCount > 0) {
    parts.push(`${coolingCount} cooling off`);
  }

  return parts.length > 0
    ? `Promoted routes: ${parts.join(" · ")}.`
    : "Repeated accepted Home handoffs will appear here once a route stabilizes.";
}

function resolveDefaultProvider(
  settings: AssistantRuntimeSettings,
): AssistantProvider | "" {
  return (
    settings.effective_default_provider ??
    settings.providers.find((provider) => provider.enabled)?.provider ??
    settings.providers.find((provider) => provider.configured)?.provider ??
    ""
  );
}

function resolveAssistantPersonaFromRole(
  personas: AssistantPersonaDefinition[],
  role: string | undefined,
): AssistantPersona | null {
  const normalizedRole = role?.trim().toUpperCase();
  if (!normalizedRole) {
    return null;
  }

  return (
    personas.find((persona) =>
      persona.default_for_roles.includes(normalizedRole),
    )?.key ?? null
  );
}

function buildPromptHomeContext(args: {
  health: string;
  counts: PromptHomeCounts;
  displayName: string;
}): string {
  return [
    "Current workspace: configurable Apps surface.",
    `Authenticated user: ${args.displayName}.`,
    `API health: ${args.health}.`,
    `Active trades: ${formatCount(args.counts.activeTrades)}.`,
    `Open workflow items: ${formatCount(args.counts.openWorkItems)}.`,
    `Pending invoices: ${formatCount(args.counts.pendingInvoices)}.`,
    `Payments due: ${formatCount(args.counts.paymentsDue)}.`,
    `Dashboard attention items: ${formatCount(args.counts.attentionItems)}.`,
    "If the user needs to perform a business write, stage or describe the governed action path instead of claiming it has been executed.",
    'When opening an existing workspace would help, include a fenced navigation_intent JSON block after the user-facing answer. Use shape {"kind":"open_workspace","targetView":"operations","label":"Open Work Queue","rationale":"Why this is the right destination","focus":{"type":"trade","id":"TRD-1001","label":"TRD-1001"},"inspectorTab":"events"}. Navigation intents move the UI only and never execute business changes.',
  ].join("\n");
}

function mergePromptContexts(
  operatorContext: string,
  applicationContext?: string | null,
): string {
  return [operatorContext, applicationContext?.trim() ?? ""]
    .filter((section) => section.length > 0)
    .join("\n\n");
}

function updatePromptMessage(
  currentMessages: PromptHomeMessage[],
  messageId: string,
  updater: (message: PromptHomeMessage) => PromptHomeMessage,
): PromptHomeMessage[] {
  return currentMessages.map((message) =>
    message.id === messageId ? updater(message) : message,
  );
}

function replacePromptMessageActionRequest(
  currentMessages: PromptHomeMessage[],
  updatedActionRequest: AssistantActionRequest,
): PromptHomeMessage[] {
  return currentMessages.map((message) => {
    if (
      !message.actionRequests?.some(
        (request) =>
          request.action_request_id === updatedActionRequest.action_request_id,
      )
    ) {
      return message;
    }

    return {
      ...message,
      actionRequests: message.actionRequests.map((request) =>
        request.action_request_id === updatedActionRequest.action_request_id
          ? updatedActionRequest
          : request,
      ),
    };
  });
}

function removePromptNavigationIntent(
  currentMessages: PromptHomeMessage[],
  args: {
    messageId: string;
    intentKey: string;
  },
): PromptHomeMessage[] {
  return currentMessages.map((message) => {
    if (message.id !== args.messageId || !message.navigationIntents?.length) {
      return message;
    }

    return {
      ...message,
      navigationIntents: message.navigationIntents.filter(
        (intent) => buildPromptNavigationIntentKey(intent) !== args.intentKey,
      ),
    };
  });
}

function PromptHomeCalendarAgendaSection({
  sectionKey,
  title,
  summary,
  items,
  emptyMessage,
}: {
  sectionKey: string;
  title: string;
  summary: string;
  items: PromptHomeCalendarAgendaItem[];
  emptyMessage: string;
}) {
  const visibleItems = items.slice(0, PROMPT_HOME_CALENDAR_AGENDA_LIST_LIMIT);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);
  const normalizedSummary = summary.trim();
  const normalizedEmptyMessage = emptyMessage.trim();
  const showEmptyMessage =
    normalizedEmptyMessage.length > 0 &&
    normalizedEmptyMessage !== normalizedSummary;

  return (
    <section className="prompt-home-calendar-agenda">
      <div className="prompt-home-calendar-agenda-head">
        <strong>{title}</strong>
        <span>{summary}</span>
      </div>

      {visibleItems.length > 0 ? (
        <>
          <div className="prompt-home-calendar-agenda-list">
            {visibleItems.map((item, index) => {
              const tooltipId = `prompt-home-calendar-event-tooltip-${sectionKey}-${index}-${promptHomeTooltipIdPart(item.key)}`;
              const tooltipDetail =
                buildPromptHomeCalendarAgendaItemHoverDetail(item);

              return (
                <article
                  key={item.key}
                  className="prompt-home-calendar-agenda-item has-tooltip"
                  tabIndex={0}
                  aria-describedby={tooltipId}
                >
                  <div className="prompt-home-calendar-agenda-copy">
                    <strong>{item.title}</strong>
                    <p>
                      {item.primary} · {item.secondary}
                    </p>
                    {item.supportingText ? (
                      <span>{item.supportingText}</span>
                    ) : null}
                  </div>
                  <div className="prompt-home-calendar-agenda-meta">
                    {item.htmlLink ? (
                      <a href={item.htmlLink} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    ) : null}
                  </div>
                  <span
                    id={tooltipId}
                    role="tooltip"
                    className="prompt-home-calendar-event-tooltip"
                  >
                    {renderPromptHomeCalendarTooltipLines(tooltipDetail)}
                  </span>
                </article>
              );
            })}
          </div>
          {hiddenCount > 0 ? (
            <p className="prompt-home-calendar-agenda-note">
              {hiddenCount} more {hiddenCount === 1 ? "event" : "events"} remain
              in this range.
            </p>
          ) : null}
        </>
      ) : showEmptyMessage ? (
        <p className="prompt-home-calendar-agenda-note">{emptyMessage}</p>
      ) : null}
    </section>
  );
}

function PromptHomeTimeMeterCard({
  panelId,
  eyebrow,
  title,
  detail,
  badge,
  meta,
  collapsedSummary = meta,
  ticks,
  markers = [],
  currentPercent,
  ariaLabel,
  highlightedWindowStartPercent,
  highlightedWindowWidthPercent,
  expanded,
  onToggle,
  children,
}: {
  panelId: string;
  eyebrow: string;
  title: string;
  detail: string;
  badge: string;
  meta: string;
  collapsedSummary?: string;
  ticks: PromptHomeMeterTick[];
  markers?: PromptHomeMeterMarker[];
  currentPercent: number;
  ariaLabel: string;
  highlightedWindowStartPercent?: number;
  highlightedWindowWidthPercent?: number;
  expanded: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <article
      className={`prompt-home-time-meter-card ${expanded ? "is-expanded" : "is-collapsed"}`}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="prompt-home-time-meter-card-toggle"
        aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <div className="prompt-home-time-meter-card-head">
          <div
            className={`prompt-home-time-meter-card-copy${expanded ? "" : " is-collapsed"}`}
          >
            {expanded ? (
              <>
                <span className="eyebrow">{eyebrow}</span>
                <strong>{title}</strong>
              </>
            ) : (
              <div className="prompt-home-time-meter-card-collapsed-line">
                <span className="eyebrow prompt-home-time-meter-card-inline-eyebrow">
                  {eyebrow}
                </span>
                <strong>{title}</strong>
                <small className="prompt-home-time-meter-card-summary">
                  {collapsedSummary}
                </small>
              </div>
            )}
          </div>
          <div className="prompt-home-time-meter-card-toggle-side">
            <div className="prompt-home-time-meter-card-toggle-meta">
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {expanded ? "−" : "+"}
              </span>
            </div>
            <span className="status-pill status-pill-active">{badge}</span>
          </div>
        </div>
      </button>

      <div
        id={panelId}
        className="prompt-home-time-meter-card-body"
        hidden={!expanded}
      >
        <div className="prompt-home-time-meter-card-body-head">
          <p>{detail}</p>
          <small>{meta}</small>
        </div>

        {markers.length > 0 ? (
          <div className="prompt-home-time-meter-markers" aria-hidden="true">
            {markers.map((marker) => (
              <div
                key={marker.key}
                className={`prompt-home-time-meter-marker ${marker.align === "end" ? "is-end" : "is-start"} ${marker.tone === "calendar" ? "is-calendar" : "is-trading"} ${marker.hoverDetail ? "has-detail" : ""}`.trim()}
                style={{ left: `${marker.percent}%` }}
              >
                <span>{marker.label}</span>
                <strong>{marker.detail}</strong>
                {marker.hoverDetail ? (
                  <span
                    role="tooltip"
                    className="prompt-home-calendar-event-tooltip prompt-home-time-meter-marker-tooltip"
                  >
                    {renderPromptHomeCalendarTooltipLines(marker.hoverDetail)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="prompt-home-time-meter-scale" aria-hidden="true">
          {typeof highlightedWindowStartPercent === "number" &&
          typeof highlightedWindowWidthPercent === "number" ? (
            <span
              className="prompt-home-time-meter-window"
              style={{
                left: `${highlightedWindowStartPercent}%`,
                width: `${highlightedWindowWidthPercent}%`,
              }}
            />
          ) : null}
          {markers.map((marker) => (
            <span
              key={`${marker.key}-boundary`}
              className={`prompt-home-time-meter-boundary-hit-area ${marker.hoverDetail ? "has-detail" : ""}`.trim()}
              style={{ left: `${marker.percent}%` }}
            >
              <span
                className={`prompt-home-time-meter-boundary ${marker.tone === "calendar" ? "is-calendar" : "is-trading"}`}
              />
              {marker.hoverDetail ? (
                <span
                  role="tooltip"
                  className="prompt-home-calendar-event-tooltip prompt-home-time-meter-boundary-tooltip"
                >
                  {renderPromptHomeCalendarTooltipLines(marker.hoverDetail)}
                </span>
              ) : null}
            </span>
          ))}
          <span
            className="prompt-home-time-meter-now"
            style={{ left: `${currentPercent}%` }}
          />
        </div>

        <div className="prompt-home-time-meter-ticks" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick.key}
              className={`prompt-home-time-meter-tick ${
                tick.align === "start"
                  ? "is-start"
                  : tick.align === "end"
                    ? "is-end"
                    : ""
              }`}
              style={{ left: `${tick.percent}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>

        {children}
      </div>
    </article>
  );
}

function formatPromptHomePriceSortDirection(
  sortState: PromptHomePriceSortState | null,
  field: PromptHomePriceSortField,
): "ascending" | "descending" | "none" {
  if (sortState?.field !== field) {
    return "none";
  }

  return sortState.direction === "asc" ? "ascending" : "descending";
}

function getPromptHomeCardStringValue(
  values: Record<string, unknown> | undefined,
  key: string,
): string {
  const value = values?.[key];
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0].trim();
  }
  return "";
}

function setPromptHomeCardStringValue(
  values: Record<string, unknown>,
  key: string,
  value: string,
): Record<string, unknown> {
  const nextValues = { ...values };
  const normalizedValue = value.trim();
  if (normalizedValue) {
    nextValues[key] = normalizedValue;
  } else {
    delete nextValues[key];
  }
  return nextValues;
}

function setPromptHomeCardIntegerValue(
  values: Record<string, unknown>,
  key: string,
  value: number | null,
): Record<string, unknown> {
  const nextValues = { ...values };
  if (typeof value === "number" && Number.isFinite(value)) {
    nextValues[key] = Math.floor(value);
  } else {
    delete nextValues[key];
  }
  return nextValues;
}

function parsePromptHomeIntegerParameter(
  value: unknown,
  {
    fallback,
    minimum,
    maximum,
  }: {
    fallback: number;
    minimum: number;
    maximum: number;
  },
): number {
  const parsedValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(Math.floor(parsedValue), maximum));
}

function normalizePromptHomeNewsTerm(
  value: string | null | undefined,
): string | null {
  const normalized = value
    ?.replace(/[·,_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || normalized === "-") {
    return null;
  }
  return normalized;
}

function dedupePromptHomeNewsTerms(
  values: Array<string | null | undefined>,
): string[] {
  const seenTerms = new Set<string>();
  const terms: string[] = [];

  for (const value of values) {
    const normalizedTerm = normalizePromptHomeNewsTerm(value);
    const key = normalizedTerm?.toLowerCase();
    if (!normalizedTerm || !key || seenTerms.has(key)) {
      continue;
    }

    seenTerms.add(key);
    terms.push(normalizedTerm);
  }

  return terms;
}

function buildPromptHomeNewsSearchQuery({
  newsQuery,
  priceIndex,
  provider,
  quoteType,
  locationCode,
  region,
}: {
  newsQuery: string;
  priceIndex: PriceIndexRecord | null;
  provider: string;
  quoteType: string;
  locationCode: string;
  region: string;
}): string {
  return dedupePromptHomeNewsTerms([
    newsQuery,
    priceIndex?.name,
    priceIndex?.code,
    priceIndex?.provider,
    priceIndex?.location_code,
    provider === PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER ? null : provider,
    quoteType === PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE ? null : quoteType,
    locationCode,
    region,
  ]).join(" ");
}

function parsePromptHomePriceMarkStatusParameter(
  value: unknown,
): PromptHomePriceMarkFilter {
  return value === "with_marks" || value === "missing_marks" ? value : "all";
}

function parsePromptHomePriceSortParameter(
  value: unknown,
): PromptHomePriceSortState | null {
  if (typeof value !== "string") {
    return null;
  }

  const [field, direction] = value.trim().toLowerCase().split("_");
  if (
    !field ||
    !direction ||
    !PROMPT_HOME_PRICE_SORT_HEADERS.some((header) => header.field === field) ||
    (direction !== "asc" && direction !== "desc")
  ) {
    return null;
  }

  return {
    field: field as PromptHomePriceSortField,
    direction,
  };
}

function serializePromptHomePriceSortParameter(
  sortState: PromptHomePriceSortState | null,
): string {
  return sortState ? `${sortState.field}_${sortState.direction}` : "";
}

function parsePromptHomePriceOrderParameter(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizePromptHomePriceManualOrder(
      value.filter((item): item is string => typeof item === "string"),
    );
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(trimmedValue);
    if (Array.isArray(parsedValue)) {
      return normalizePromptHomePriceManualOrder(
        parsedValue.filter((item): item is string => typeof item === "string"),
      );
    }
  } catch {
    // Fall back to comma-separated legacy/local values.
  }

  return normalizePromptHomePriceManualOrder(trimmedValue.split(","));
}

function buildPromptHomePriceOrderAfterDrag({
  allPriceIndexCodes,
  visiblePriceIndexCodes,
  activePriceIndexCode,
  overPriceIndexCode,
}: {
  allPriceIndexCodes: readonly string[];
  visiblePriceIndexCodes: readonly string[];
  activePriceIndexCode: string;
  overPriceIndexCode: string;
}): string[] {
  const normalizedAllCodes =
    normalizePromptHomePriceManualOrder(allPriceIndexCodes);
  const normalizedVisibleCodes = normalizePromptHomePriceManualOrder(
    visiblePriceIndexCodes,
  );
  const normalizedActiveCode =
    normalizePromptHomePriceManualOrder([activePriceIndexCode])[0] ?? "";
  const normalizedOverCode =
    normalizePromptHomePriceManualOrder([overPriceIndexCode])[0] ?? "";
  const oldIndex = normalizedVisibleCodes.indexOf(normalizedActiveCode);
  const newIndex = normalizedVisibleCodes.indexOf(normalizedOverCode);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return normalizedAllCodes;
  }

  const nextVisibleCodes = arrayMove(normalizedVisibleCodes, oldIndex, newIndex);
  const visibleCodeSet = new Set(normalizedVisibleCodes);
  const replacementQueue = [...nextVisibleCodes];

  return normalizedAllCodes.map((priceIndexCode) =>
    visibleCodeSet.has(priceIndexCode)
      ? replacementQueue.shift() ?? priceIndexCode
      : priceIndexCode,
  );
}

function normalizePromptHomeMapGeographyFilter(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const visibleGeographies = values
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) =>
      ASSET_MAP_GEOGRAPHY_LABELS.includes(
        item as (typeof ASSET_MAP_GEOGRAPHY_LABELS)[number],
      ),
    );

  return Array.from(new Set(visibleGeographies));
}

function buildPromptHomeMapGeographyVisibility(
  value: unknown,
): Record<string, boolean> {
  const visibleGeographies = normalizePromptHomeMapGeographyFilter(value);
  if (visibleGeographies.length === 0) {
    return {};
  }

  const visibleSet = new Set(visibleGeographies);
  return Object.fromEntries(
    ASSET_MAP_GEOGRAPHY_LABELS.map((geographyLabel) => [
      geographyLabel,
      visibleSet.has(geographyLabel),
    ]),
  );
}

function visiblePromptHomeMapGeographiesFromState(
  visibilityState: Record<string, boolean>,
): string[] {
  const normalizedVisibility =
    syncAssetGeographyVisibilityState(visibilityState);
  return ASSET_MAP_GEOGRAPHY_LABELS.filter(
    (geographyLabel) => normalizedVisibility[geographyLabel] !== false,
  );
}

function promptHomeMapPriceIndexMatchesFilters(
  priceIndex: PriceIndexRecord,
  filters: {
    commodityCode: string;
    locationCode: string;
    region: string;
  },
): boolean {
  const normalizedCommodityCode = filters.commodityCode.trim().toUpperCase();
  if (
    normalizedCommodityCode &&
    priceIndex.commodity_code.trim().toUpperCase() !== normalizedCommodityCode
  ) {
    return false;
  }

  const normalizedLocationCode = filters.locationCode.trim().toUpperCase();
  if (
    normalizedLocationCode &&
    priceIndex.location_code?.trim().toUpperCase() !== normalizedLocationCode
  ) {
    return false;
  }

  const normalizedRegion = filters.region.trim().toUpperCase();
  if (
    normalizedRegion &&
    priceIndex.market?.trim().toUpperCase() !== normalizedRegion
  ) {
    return false;
  }

  return true;
}

function PromptHomePriceRowFields({
  row,
}: {
  row: PromptHomePriceRowViewModel;
}) {
  return (
    <dl className="prompt-home-price-fields">
      <div>
        <dt>Product</dt>
        <dd>{row.product}</dd>
      </div>
      <div>
        <dt>Location</dt>
        <dd>{row.location}</dd>
      </div>
      <div>
        <dt>Price</dt>
        <dd>{row.price}</dd>
      </div>
      <div>
        <dt>Change</dt>
        <dd>
          <span
            className={`prompt-home-price-change prompt-home-price-change-${row.changeTone}`}
          >
            {row.change}
          </span>
        </dd>
      </div>
      <div>
        <dt>Unit</dt>
        <dd>{row.unit}</dd>
      </div>
      <div>
        <dt>Currency</dt>
        <dd>{row.currency}</dd>
      </div>
      <div>
        <dt>Frequency</dt>
        <dd>{row.frequency}</dd>
      </div>
      <div>
        <dt>Price Datetime</dt>
        <dd>{row.dateTime}</dd>
      </div>
      <div>
        <dt>Updated</dt>
        <dd>{row.updated}</dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>{row.source}</dd>
      </div>
    </dl>
  );
}

function PromptHomePriceRow({
  row,
  onOpenPriceReport,
  dragAttributes,
  dragListeners,
  setDragHandleRef,
  setNodeRef,
  style,
  isDragging = false,
}: {
  row: PromptHomePriceRowViewModel;
  onOpenPriceReport: (row: PromptHomePriceRowViewModel) => void;
  dragAttributes?: DraggableAttributes;
  dragListeners?: PromptHomeSortableListeners;
  setDragHandleRef?: (element: HTMLElement | null) => void;
  setNodeRef?: (element: HTMLElement | null) => void;
  style?: CSSProperties;
  isDragging?: boolean;
}) {
  const setRowRef = useCallback(
    (element: HTMLElement | null) => {
      setNodeRef?.(element);
      setDragHandleRef?.(element);
    },
    [setDragHandleRef, setNodeRef],
  );

  return (
    <article
      ref={setRowRef}
      style={style}
      className={mergePromptHomeClassNames(
        "prompt-home-price-row prompt-home-price-row-action",
        dragListeners ? "prompt-home-price-row-draggable" : undefined,
        isDragging ? "is-dragging" : undefined,
      )}
      {...(dragAttributes ?? {})}
      {...(dragListeners ?? {})}
      role="button"
      tabIndex={0}
      aria-label={`Double-click to open the price report for ${row.priceIndex.name || row.priceIndexCode}`}
      title={
        dragListeners
          ? `Click and hold to reorder ${row.priceIndexCode}; double-click to open its price report`
          : `Double-click to open the price report for ${row.priceIndexCode}`
      }
      onDoubleClick={(event) => {
        event.preventDefault();
        onOpenPriceReport(row);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        onOpenPriceReport(row);
      }}
    >
      <PromptHomePriceRowFields row={row} />
    </article>
  );
}

function formatPromptHomePriceTickerLabel(
  row: PromptHomePriceRowViewModel,
): string {
  const marketParts = [row.product, row.location].filter(
    (part) => part && part !== "—",
  );
  const marketLabel =
    marketParts.length > 0 ? marketParts.join(" ") : row.priceIndexCode;
  const priceLabel = row.hasLatestMark
    ? [row.price, row.unit].filter((part) => part && part !== "—").join(" ")
    : row.price;
  const changeLabel =
    row.hasLatestMark && row.change !== "—" ? row.change : "";

  return [marketLabel, priceLabel, changeLabel].filter(Boolean).join(" · ");
}

function SortablePromptHomePriceRow({
  row,
  onOpenPriceReport,
}: {
  row: PromptHomePriceRowViewModel;
  onOpenPriceReport: (row: PromptHomePriceRowViewModel) => void;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.priceIndexCode });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <PromptHomePriceRow
      row={row}
      onOpenPriceReport={onOpenPriceReport}
      dragAttributes={attributes}
      dragListeners={listeners}
      setDragHandleRef={setActivatorNodeRef}
      setNodeRef={setNodeRef}
      style={style}
      isDragging={isDragging}
    />
  );
}

function listPromptHomePriceSyncProviders(
  priceIndices: readonly PriceIndexRecord[],
): ExternalDataSyncProvider[] {
  const providers = new Set<ExternalDataSyncProvider>();
  for (const priceIndex of priceIndices) {
    const provider = priceIndex.provider.trim().toUpperCase();
    if (isExternalDataSyncProvider(provider)) {
      providers.add(provider);
    }
  }

  return Array.from(providers).sort((left, right) =>
    left.localeCompare(right),
  );
}

function formatPromptHomePriceSyncProviders(
  providers: readonly ExternalDataSyncProvider[],
): string {
  if (providers.length === 0) {
    return "no providers";
  }
  if (providers.length === 1) {
    return providers[0] ?? "provider";
  }
  if (providers.length === 2) {
    return `${providers[0]} and ${providers[1]}`;
  }

  return `${providers.slice(0, -1).join(", ")}, and ${providers.at(-1)}`;
}

function PromptHomePricesCard({
  authSession,
  priceIndices,
  referenceDataLoading,
  homeCard,
  canConfigureHomeCard,
  onHomeCardConfigurationChange,
  onOpenPriceReport,
  onOpenPriceSourcesReview,
}: {
  authSession: StoredAuthSession | null;
  priceIndices: PriceIndexRecord[];
  referenceDataLoading?: boolean;
  homeCard: PromptHomeTemplateCard | null;
  canConfigureHomeCard: boolean;
  onHomeCardConfigurationChange: (
    patch: {
      parameters?: Record<string, unknown>;
      filters?: Record<string, unknown>;
    },
  ) => void;
  onOpenPriceReport: (row: PromptHomePriceRowViewModel) => void;
  onOpenPriceSourcesReview: () => void;
}) {
  const homeCardInstanceId = homeCard
    ? getPromptHomeCardInstanceId(homeCard)
    : "prices";
  const pricesPanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_PRICES_PANEL_ID,
    homeCardInstanceId,
    "prices",
  );
  const pricesFilterDialogId = promptHomeInstanceScopedId(
    "prompt-home-prices-filter-dialog",
    homeCardInstanceId,
    "prices-filter-dialog",
  );
  const pricesFilterDialogTitleId = `${pricesFilterDialogId}-title`;
  const pricesErrorsDialogId = promptHomeInstanceScopedId(
    "prompt-home-prices-errors-dialog",
    homeCardInstanceId,
    "prices-errors-dialog",
  );
  const pricesErrorsDialogTitleId = `${pricesErrorsDialogId}-title`;
  const pricesExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.prices-card",
      homeCardInstanceId,
      "prices",
    ),
    true,
  );
  const [priceSearchQuery, setPriceSearchQuery] = useState("");
  const [priceFiltersOpen, setPriceFiltersOpen] = useState(false);
  const [priceErrorsOpen, setPriceErrorsOpen] = useState(false);
  const [priceSyncing, setPriceSyncing] = useState(false);
  const [priceSyncErrors, setPriceSyncErrors] = useState<string[]>([]);
  const [priceSyncSuccess, setPriceSyncSuccess] = useState("");
  const homeCardFilters = useMemo(
    () => homeCard?.filters ?? {},
    [homeCard],
  );
  const homeCardParameters = useMemo(
    () => homeCard?.parameters ?? {},
    [homeCard],
  );
  const priceCommodityFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "commodity_code",
  );
  const priceIndexCodeFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "price_index_code",
  );
  const priceProviderFilter =
    getPromptHomeCardStringValue(homeCardFilters, "provider") ||
    PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER;
  const priceQuoteTypeFilter =
    getPromptHomeCardStringValue(homeCardFilters, "quote_type") ||
    PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE;
  const priceMarkFilter = parsePromptHomePriceMarkStatusParameter(
    homeCardParameters.price_mark_status,
  );
  const persistedPriceSortState = useMemo(
    () => parsePromptHomePriceSortParameter(homeCardParameters.price_sort),
    [homeCardParameters.price_sort],
  );
  const [priceSortState, setPriceSortState] =
    useState<PromptHomePriceSortState | null>(persistedPriceSortState);
  useEffect(() => {
    setPriceSortState(persistedPriceSortState);
  }, [persistedPriceSortState]);
  const priceManualOrder = useMemo(
    () => parsePromptHomePriceOrderParameter(homeCardParameters.price_order),
    [homeCardParameters.price_order],
  );
  const priceRowSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );
  const activePriceIndices = useMemo(
    () => selectPromptHomePriceIndices(priceIndices),
    [priceIndices],
  );
  const priceSyncProviders = useMemo(
    () => listPromptHomePriceSyncProviders(activePriceIndices),
    [activePriceIndices],
  );
  const commodityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activePriceIndices
            .map((priceIndex) => priceIndex.commodity_code.trim().toUpperCase())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [activePriceIndices],
  );
  const priceIndexOptions = useMemo(
    () =>
      activePriceIndices
        .filter((priceIndex) => {
          if (
            priceCommodityFilter &&
            priceIndex.commodity_code.trim().toUpperCase() !==
              priceCommodityFilter.trim().toUpperCase()
          ) {
            return false;
          }
          if (
            priceProviderFilter !== PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER &&
            priceIndex.provider.trim() !== priceProviderFilter
          ) {
            return false;
          }
          if (
            priceQuoteTypeFilter !== PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE &&
            priceIndex.quote_type?.trim().toUpperCase() !==
              priceQuoteTypeFilter.trim().toUpperCase()
          ) {
            return false;
          }
          return true;
        })
        .map((priceIndex) => ({
          code: priceIndex.code,
          label: `${priceIndex.code} · ${priceIndex.name}`,
        })),
    [
      activePriceIndices,
      priceCommodityFilter,
      priceProviderFilter,
      priceQuoteTypeFilter,
    ],
  );
  const activePriceIndexCodes = useMemo(
    () => activePriceIndices.map((priceIndex) => priceIndex.code),
    [activePriceIndices],
  );
  const {
    latestMarks,
    error,
    refresh: refreshLatestMarks,
  } =
    useLatestPriceIndexMarks(activePriceIndexCodes, {
      limitPerCode: 2,
      refreshIntervalMs: PROMPT_HOME_PRICE_REFRESH_INTERVAL_MS,
    });
  const priceFilters = useMemo(
    () => ({
      query: priceSearchQuery,
      provider: priceProviderFilter,
      markFilter: priceMarkFilter,
      quoteType: priceQuoteTypeFilter,
      commodityCode: priceCommodityFilter,
      priceIndexCode: priceIndexCodeFilter,
    }),
    [
      priceCommodityFilter,
      priceIndexCodeFilter,
      priceMarkFilter,
      priceProviderFilter,
      priceQuoteTypeFilter,
      priceSearchQuery,
    ],
  );
  const updatePriceCardFilters = useCallback(
    (key: string, value: string) => {
      if (!canConfigureHomeCard) {
        return;
      }
      onHomeCardConfigurationChange({
        filters: setPromptHomeCardStringValue(homeCardFilters, key, value),
      });
    },
    [canConfigureHomeCard, homeCardFilters, onHomeCardConfigurationChange],
  );
  const updatePriceCardParameters = useCallback(
    (key: string, value: string) => {
      if (!canConfigureHomeCard) {
        return;
      }
      onHomeCardConfigurationChange({
        parameters: setPromptHomeCardStringValue(homeCardParameters, key, value),
      });
    },
    [canConfigureHomeCard, homeCardParameters, onHomeCardConfigurationChange],
  );
  const updatePriceSortState = useCallback(
    (nextSortState: PromptHomePriceSortState | null) => {
      setPriceSortState(nextSortState);
      if (!canConfigureHomeCard) {
        return;
      }
      onHomeCardConfigurationChange({
        parameters: setPromptHomeCardStringValue(
          homeCardParameters,
          "price_sort",
          serializePromptHomePriceSortParameter(nextSortState),
        ),
      });
    },
    [canConfigureHomeCard, homeCardParameters, onHomeCardConfigurationChange],
  );
  const clearPersistedPriceFilters = useCallback(() => {
    if (!canConfigureHomeCard) {
      return;
    }
    const nextParameters = { ...homeCardParameters };
    delete nextParameters.price_mark_status;
    onHomeCardConfigurationChange({
      filters: {},
      parameters: nextParameters,
    });
  }, [
    canConfigureHomeCard,
    homeCardParameters,
    onHomeCardConfigurationChange,
  ]);
  const pricesViewModel = useMemo(
    () =>
      buildPromptHomePricesCardViewModel(
        {
          priceIndices,
          latestMarks,
        },
        {
          filters: priceFilters,
          sortState: priceSortState,
          manualOrder: priceManualOrder,
          referenceDataLoading,
        },
      ),
    [
      latestMarks,
      priceFilters,
      priceManualOrder,
      priceIndices,
      priceSortState,
      referenceDataLoading,
    ],
  );
  const effectivePriceProviderFilter =
    pricesViewModel.effectiveFilters.provider;
  const effectivePriceQuoteTypeFilter =
    pricesViewModel.effectiveFilters.quoteType ??
    PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE;
  const hasActivePriceFilters = pricesViewModel.hasActiveFilters;
  const { dragHandleAttributes, dragHandleClassName } =
    usePromptHomeCardHeaderDragProps<HTMLDivElement>();
  const canSyncPriceSources = hasAdministrativeAccess(authSession);
  const priceSyncProviderSummary =
    formatPromptHomePriceSyncProviders(priceSyncProviders);
  const showPriceFilters =
    pricesViewModel.status === "ready" ||
    pricesViewModel.status === "filtered_empty";
  const priceErrorMessages = useMemo(() => {
    const messages = [
      error ? `Latest marks: ${error}` : "",
      ...priceSyncErrors,
    ];

    return messages.map((message) => message.trim()).filter(Boolean);
  }, [error, priceSyncErrors]);
  const hasPriceErrors = priceErrorMessages.length > 0;
  useEffect(() => {
    if (!showPriceFilters || !pricesExpandedState.expanded) {
      setPriceFiltersOpen(false);
    }
  }, [pricesExpandedState.expanded, showPriceFilters]);
  useEffect(() => {
    if (!hasPriceErrors || !pricesExpandedState.expanded) {
      setPriceErrorsOpen(false);
    }
  }, [hasPriceErrors, pricesExpandedState.expanded]);
  const priceRowIds = useMemo(
    () => pricesViewModel.rows.map((row) => row.priceIndexCode),
    [pricesViewModel.rows],
  );
  const priceHeaderTickerTitles = useMemo(() => {
    if (pricesViewModel.status === "reference_loading") {
      return ["Prices loading"];
    }

    const rowTitles = pricesViewModel.rows
      .slice(0, 6)
      .map(formatPromptHomePriceTickerLabel)
      .filter(Boolean);

    if (rowTitles.length > 0) {
      return rowTitles;
    }

    if (pricesViewModel.status === "filtered_empty") {
      return ["No prices match filters"];
    }

    if (pricesViewModel.status === "no_active_indices") {
      return ["No active prices"];
    }

    return ["Prices loading"];
  }, [pricesViewModel.rows, pricesViewModel.status]);
  const priceHeaderTickerItems =
    priceHeaderTickerTitles.length > 1
      ? [...priceHeaderTickerTitles, ...priceHeaderTickerTitles]
      : priceHeaderTickerTitles;
  const priceRowsMovable = canConfigureHomeCard && priceRowIds.length > 1;
  const priceSyncButtonTitle = !canSyncPriceSources
    ? "Admin session required to sync price sources"
    : priceSyncProviders.length === 0
      ? "No supported price providers to sync"
      : `Sync latest prices from ${priceSyncProviderSummary}`;
  const priceSyncButtonDisabled =
    priceSyncing ||
    !canSyncPriceSources ||
    priceSyncProviders.length === 0 ||
    pricesViewModel.status === "reference_loading";
  const handleSyncPrices = useCallback(async () => {
    if (!authSession || !canSyncPriceSources) {
      setPriceSyncErrors(["Sign in as an admin to sync price sources."]);
      setPriceSyncSuccess("");
      return;
    }
    if (priceSyncProviders.length === 0) {
      setPriceSyncErrors([
        "No supported price providers are available to sync.",
      ]);
      setPriceSyncSuccess("");
      return;
    }

    setPriceSyncing(true);
    setPriceSyncErrors([]);
    setPriceSyncSuccess("");
    try {
      const syncResults = await Promise.allSettled(
        priceSyncProviders.map((provider) =>
          runExternalDataSync(appConfig.apiBase, provider, {
            requestedBy: authSession.user.user_id,
            headers: sessionHeaders(authSession),
          }),
        ),
      );
      const fulfilledRuns = syncResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const rejectedMessages = syncResults.flatMap((result) =>
        result.status === "rejected"
          ? [
              result.reason instanceof Error
                ? result.reason.message
                : "Sync request failed.",
            ]
          : [],
      );
      const failedRuns = fulfilledRuns.filter(
        (run) => run.status.trim().toUpperCase() === "FAILED",
      );

      await refreshLatestMarks();

      const observationCount = fulfilledRuns.reduce(
        (total, run) => total + run.observation_count,
        0,
      );
      if (failedRuns.length > 0 || rejectedMessages.length > 0) {
        const runMessages = failedRuns.map(
          (run) =>
            `${run.provider} run ${run.id} failed${
              run.error_summary ? `: ${run.error_summary}` : ""
            }`,
        );
        setPriceSyncErrors([...runMessages, ...rejectedMessages]);
        if (observationCount > 0) {
          setPriceSyncSuccess(
            `Loaded ${observationCount} observation${
              observationCount === 1 ? "" : "s"
            } before the sync stopped.`,
          );
        }
        return;
      }

      setPriceSyncSuccess(
        `Synced ${priceSyncProviderSummary} with ${observationCount} observation${
          observationCount === 1 ? "" : "s"
        }.`,
      );
    } catch (nextError) {
      setPriceSyncErrors([
        nextError instanceof Error
          ? nextError.message
          : "Failed to sync latest prices.",
      ]);
    } finally {
      setPriceSyncing(false);
    }
  }, [
    authSession,
    canSyncPriceSources,
    priceSyncProviderSummary,
    priceSyncProviders,
    refreshLatestMarks,
  ]);
  const handlePriceRowDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!priceRowsMovable) {
        return;
      }

      const activePriceIndexCode = String(event.active.id);
      const overPriceIndexCode = event.over ? String(event.over.id) : null;
      if (!overPriceIndexCode || activePriceIndexCode === overPriceIndexCode) {
        return;
      }

      const nextPriceOrder = buildPromptHomePriceOrderAfterDrag({
        allPriceIndexCodes: pricesViewModel.allRows.map(
          (row) => row.priceIndexCode,
        ),
        visiblePriceIndexCodes: priceRowIds,
        activePriceIndexCode,
        overPriceIndexCode,
      });
      const nextParameters: Record<string, unknown> = {
        ...homeCardParameters,
        price_order: nextPriceOrder,
      };
      delete nextParameters.price_sort;
      onHomeCardConfigurationChange({
        parameters: nextParameters,
      });
    },
    [
      homeCardParameters,
      onHomeCardConfigurationChange,
      priceRowIds,
      priceRowsMovable,
      pricesViewModel.allRows,
    ],
  );
  const priceFilterControls = showPriceFilters ? (
    <div className="prompt-home-prices-filter-bar" aria-label="Price filters">
      <label className="prompt-home-prices-filter-field">
        <span>Search</span>
        <input
          type="search"
          value={priceSearchQuery}
          placeholder="Code, market, commodity, type"
          onChange={(event) => setPriceSearchQuery(event.target.value)}
        />
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Provider</span>
        <select
          value={effectivePriceProviderFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updatePriceCardFilters(
              "provider",
              event.target.value === PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER
                ? ""
                : event.target.value,
            )
          }
        >
          <option value={PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER}>All providers</option>
          {pricesViewModel.providerOptions.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Type</span>
        <select
          value={effectivePriceQuoteTypeFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updatePriceCardFilters(
              "quote_type",
              event.target.value === PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE
                ? ""
                : event.target.value,
            )
          }
        >
          <option value={PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE}>All types</option>
          {pricesViewModel.quoteTypeOptions.map((quoteType) => (
            <option key={quoteType} value={quoteType}>
              {formatPromptHomePriceQuoteTypeCode(quoteType)}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Commodity</span>
        <select
          value={priceCommodityFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updatePriceCardFilters("commodity_code", event.target.value)
          }
        >
          <option value="">All commodities</option>
          {priceCommodityFilter &&
          !commodityOptions.includes(priceCommodityFilter) ? (
            <option value={priceCommodityFilter}>
              {priceCommodityFilter} (unavailable)
            </option>
          ) : null}
          {commodityOptions.map((commodityCode) => (
            <option key={commodityCode} value={commodityCode}>
              {commodityCode}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Index</span>
        <select
          value={priceIndexCodeFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updatePriceCardFilters("price_index_code", event.target.value)
          }
        >
          <option value="">All indices</option>
          {priceIndexCodeFilter &&
          !priceIndexOptions.some(
            (priceIndexOption) =>
              priceIndexOption.code === priceIndexCodeFilter,
          ) ? (
            <option value={priceIndexCodeFilter}>
              {priceIndexCodeFilter} (unavailable)
            </option>
          ) : null}
          {priceIndexOptions.map((priceIndexOption) => (
            <option key={priceIndexOption.code} value={priceIndexOption.code}>
              {priceIndexOption.label}
            </option>
          ))}
        </select>
      </label>
      <div className="prompt-home-prices-filter-field">
        <span>Marks</span>
        <div
          className="prompt-home-prices-filter-segments"
          role="group"
          aria-label="Filter by mark status"
        >
          {[
            ["all", "All"],
            ["with_marks", "Marked"],
            ["missing_marks", "Missing"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                priceMarkFilter === value
                  ? "is-active"
                  : undefined
              }
              aria-pressed={priceMarkFilter === value}
              disabled={!canConfigureHomeCard}
              onClick={() =>
                updatePriceCardParameters(
                  "price_mark_status",
                  value === "all" ? "" : value,
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  ) : null;
  const priceHeaderActions = pricesExpandedState.expanded ? (
    <div
      className="prompt-home-prices-card-head-actions"
      aria-label="Market price actions"
    >
      {showPriceFilters ? (
        <button
          type="button"
          className={mergePromptHomeClassNames(
            "button button-secondary prompt-home-prices-filter-button",
            hasActivePriceFilters ? "is-active" : undefined,
          )}
          aria-controls={pricesFilterDialogId}
          aria-expanded={priceFiltersOpen}
          onClick={() => setPriceFiltersOpen(true)}
        >
          Filter
        </button>
      ) : null}
      <button
        type="button"
        className="button button-secondary"
        aria-label="Sync latest prices"
        title={priceSyncButtonTitle}
        onClick={() => void handleSyncPrices()}
        disabled={priceSyncButtonDisabled}
      >
        {priceSyncing ? "Syncing..." : "Sync"}
      </button>
      <button
        type="button"
        className={mergePromptHomeClassNames(
          "button button-secondary prompt-home-prices-errors-button",
          hasPriceErrors ? "is-active" : undefined,
        )}
        aria-controls={pricesErrorsDialogId}
        aria-expanded={priceErrorsOpen}
        title={
          hasPriceErrors
            ? `Review ${priceErrorMessages.length} price error${
                priceErrorMessages.length === 1 ? "" : "s"
              }`
            : "No price errors to review"
        }
        onClick={() => setPriceErrorsOpen(true)}
        disabled={!hasPriceErrors}
      >
        Errors
      </button>
      <button
        type="button"
        className="button button-secondary"
        onClick={onOpenPriceSourcesReview}
      >
        Sources
      </button>
    </div>
  ) : null;

  return (
    <article
      className={`prompt-home-prices-card ${pricesExpandedState.expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <div
        {...dragHandleAttributes}
        className={mergePromptHomeClassNames(
          "prompt-home-prices-card-head",
          dragHandleClassName,
        )}
      >
        <div className="prompt-home-prices-card-copy">
          <span className="eyebrow">Prices</span>
          <div
            className={`prompt-home-prices-ticker-strip ${
              priceHeaderTickerTitles.length > 1 ? "is-scrolling" : "is-static"
            }`}
            aria-label="Scrolling market prices"
          >
            <div className="prompt-home-prices-ticker-track">
              {priceHeaderTickerItems.map((priceTitle, index) => (
                <strong
                  key={`${priceTitle}-${index}`}
                  className="prompt-home-prices-ticker-item"
                  aria-hidden={index >= priceHeaderTickerTitles.length}
                >
                  {priceTitle}
                </strong>
              ))}
            </div>
          </div>
        </div>
        {priceHeaderActions}
        <div className="prompt-home-prices-card-toggle-side">
          <button
            type="button"
            className="prompt-home-prices-card-toggle"
            aria-label={
              pricesExpandedState.expanded
                ? "Collapse Market Prices"
                : "Expand Market Prices"
            }
            aria-expanded={pricesExpandedState.expanded}
            aria-controls={pricesPanelId}
            onClick={() =>
              pricesExpandedState.setExpanded((current) => !current)
            }
          >
            <div className="prompt-home-prices-card-toggle-meta">
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {pricesExpandedState.expanded ? "−" : "+"}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div
        id={pricesPanelId}
        className="prompt-home-prices-card-body"
        hidden={!pricesExpandedState.expanded}
      >
        {pricesViewModel.status === "reference_loading" ? (
          <div className="prompt-home-prices-skeleton-grid">
            <div className="skeleton-block" />
            <div className="skeleton-block" />
            <div className="skeleton-block" />
          </div>
        ) : pricesViewModel.status === "no_active_indices" ? (
          <div className="empty-state">
            <strong>No active price indices</strong>
            <p>Price marks appear here after reference data includes active indices.</p>
          </div>
        ) : (
          <>
            {priceSyncSuccess ? (
              <p className="form-note">{priceSyncSuccess}</p>
            ) : null}
            {priceErrorsOpen && hasPriceErrors ? (
              <div
                className="prompt-home-prices-filter-overlay"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setPriceErrorsOpen(false);
                  }
                }}
              >
                <section
                  id={pricesErrorsDialogId}
                  className="prompt-home-prices-filter-dialog prompt-home-prices-errors-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={pricesErrorsDialogTitleId}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setPriceErrorsOpen(false);
                    }
                  }}
                >
                  <header className="prompt-home-prices-filter-dialog-head">
                    <div>
                      <span className="eyebrow">Prices</span>
                      <h3 id={pricesErrorsDialogTitleId}>Errors</h3>
                    </div>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => setPriceErrorsOpen(false)}
                    >
                      Close
                    </button>
                  </header>
                  <div
                    className="prompt-home-prices-errors-list"
                    aria-label="Price errors"
                  >
                    {priceErrorMessages.map((message, index) => (
                      <article
                        key={`${message}-${index}`}
                        className="prompt-home-prices-error-item"
                      >
                        <span>Error {index + 1}</span>
                        <p>{message}</p>
                      </article>
                    ))}
                  </div>
                  <footer className="prompt-home-prices-filter-dialog-actions">
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => setPriceErrorsOpen(false)}
                    >
                      Done
                    </button>
                  </footer>
                </section>
              </div>
            ) : null}
            {priceFiltersOpen && priceFilterControls ? (
              <div
                className="prompt-home-prices-filter-overlay"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setPriceFiltersOpen(false);
                  }
                }}
              >
                <section
                  id={pricesFilterDialogId}
                  className="prompt-home-prices-filter-dialog"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={pricesFilterDialogTitleId}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setPriceFiltersOpen(false);
                    }
                  }}
                >
                  <header className="prompt-home-prices-filter-dialog-head">
                    <div>
                      <span className="eyebrow">Prices</span>
                      <h3 id={pricesFilterDialogTitleId}>Filters</h3>
                    </div>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => setPriceFiltersOpen(false)}
                    >
                      Close
                    </button>
                  </header>
                  {priceFilterControls}
                  <footer className="prompt-home-prices-filter-dialog-actions">
                    {hasActivePriceFilters ? (
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={!canConfigureHomeCard}
                        onClick={() => {
                          setPriceSearchQuery("");
                          clearPersistedPriceFilters();
                        }}
                      >
                        Clear filters
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => setPriceFiltersOpen(false)}
                    >
                      Done
                    </button>
                  </footer>
                </section>
              </div>
            ) : null}
            {pricesViewModel.status === "filtered_empty" ? (
              <div className="empty-state">
                <strong>No prices match the current filters</strong>
                <p>Clear filters to show all active price indices.</p>
              </div>
            ) : (
              <div className="prompt-home-prices-grid">
                <div className="prompt-home-price-header" role="row">
                  {PROMPT_HOME_PRICE_SORT_HEADERS.map(({ field, label }) => {
                    const isActiveSort = priceSortState?.field === field;
                    return (
                      <span
                        key={field}
                        role="columnheader"
                        aria-sort={formatPromptHomePriceSortDirection(
                          priceSortState,
                          field,
                        )}
                      >
                        <button
                          type="button"
                          className={mergePromptHomeClassNames(
                            "prompt-home-price-sort-button",
                            isActiveSort ? "is-active" : undefined,
                          )}
                          aria-label={`Sort prices by ${label}`}
                          onClick={() =>
                            updatePriceSortState(
                              nextPromptHomePriceSortState(
                                priceSortState,
                                field,
                              ),
                            )
                          }
                        >
                          <span>{label}</span>
                          <span
                            className={mergePromptHomeClassNames(
                              "prompt-home-price-sort-indicator",
                              isActiveSort && priceSortState?.direction === "asc"
                                ? "is-ascending"
                                : undefined,
                              isActiveSort && priceSortState?.direction === "desc"
                                ? "is-descending"
                                : undefined,
                            )}
                            aria-hidden="true"
                          />
                        </button>
                      </span>
                    );
                  })}
                </div>
                {priceRowsMovable ? (
                  <DndContext
                    sensors={priceRowSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handlePriceRowDragEnd}
                  >
                    <SortableContext
                      items={priceRowIds}
                      strategy={verticalListSortingStrategy}
                    >
                      {pricesViewModel.rows.map((row) => (
                        <SortablePromptHomePriceRow
                          key={row.key}
                          row={row}
                          onOpenPriceReport={onOpenPriceReport}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  pricesViewModel.rows.map((row) => (
                    <PromptHomePriceRow
                      key={row.key}
                      row={row}
                      onOpenPriceReport={onOpenPriceReport}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function PromptHomeNewsCard({
  priceIndices,
  referenceDataLoading,
  homeCard,
  canConfigureHomeCard,
  onHomeCardConfigurationChange,
  onOpenReportsWorkspace,
}: {
  priceIndices: PriceIndexRecord[];
  referenceDataLoading?: boolean;
  homeCard: PromptHomeTemplateCard | null;
  canConfigureHomeCard: boolean;
  onHomeCardConfigurationChange: (
    patch: {
      parameters?: Record<string, unknown>;
      filters?: Record<string, unknown>;
    },
  ) => void;
  onOpenReportsWorkspace: () => void;
}) {
  const homeCardInstanceId = homeCard
    ? getPromptHomeCardInstanceId(homeCard)
    : "news";
  const newsPanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_NEWS_PANEL_ID,
    homeCardInstanceId,
    "news",
  );
  const newsFilterDialogId = promptHomeInstanceScopedId(
    "prompt-home-news-filter-dialog",
    homeCardInstanceId,
    "news-filter-dialog",
  );
  const newsFilterDialogTitleId = `${newsFilterDialogId}-title`;
  const newsExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.news-card",
      homeCardInstanceId,
      "news",
    ),
    true,
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [newsFiltersOpen, setNewsFiltersOpen] = useState(false);
  const [newsHeaderHeadlines, setNewsHeaderHeadlines] = useState<
    MarketNewsHeadlineRecord[]
  >([]);
  const homeCardFilters = useMemo(
    () => homeCard?.filters ?? {},
    [homeCard],
  );
  const homeCardParameters = useMemo(
    () => homeCard?.parameters ?? {},
    [homeCard],
  );
  const newsCommodityFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "commodity_code",
  );
  const newsPriceIndexCodeFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "price_index_code",
  );
  const newsProviderFilter =
    getPromptHomeCardStringValue(homeCardFilters, "provider") ||
    PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER;
  const newsQuoteTypeFilter =
    getPromptHomeCardStringValue(homeCardFilters, "quote_type") ||
    PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE;
  const newsLocationCodeFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "location_code",
  );
  const newsRegionFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "region",
  );
  const newsMarketLocationFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "market_location",
  );
  const newsHorizonFilter = normalizeMarketNewsHorizonFilter(
    getPromptHomeCardStringValue(homeCardFilters, "impact_horizon"),
  );
  const newsSupplyEffectFilter = normalizeMarketNewsEffectFilter(
    getPromptHomeCardStringValue(homeCardFilters, "supply_effect"),
  );
  const newsDemandEffectFilter = normalizeMarketNewsEffectFilter(
    getPromptHomeCardStringValue(homeCardFilters, "demand_effect"),
  );
  const newsQueryParameter = getPromptHomeCardStringValue(
    homeCardParameters,
    "news_query",
  );
  const newsLimit = parsePromptHomeIntegerParameter(
    homeCardParameters.news_limit,
    {
      fallback: PROMPT_HOME_NEWS_DEFAULT_LIMIT,
      minimum: 1,
      maximum: 10,
    },
  );
  const newsLookbackDays = parsePromptHomeIntegerParameter(
    homeCardParameters.news_lookback_days,
    {
      fallback: PROMPT_HOME_NEWS_DEFAULT_LOOKBACK_DAYS,
      minimum: 1,
      maximum: 14,
    },
  );
  const activePriceIndices = useMemo(
    () => selectPromptHomePriceIndices(priceIndices),
    [priceIndices],
  );
  const newsProviderOptions = useMemo(
    () => listPromptHomePriceProviders(activePriceIndices),
    [activePriceIndices],
  );
  const newsQuoteTypeOptions = useMemo(
    () => listPromptHomePriceQuoteTypes(activePriceIndices),
    [activePriceIndices],
  );
  const newsCommodityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activePriceIndices
            .map((priceIndex) => priceIndex.commodity_code.trim().toUpperCase())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
    [activePriceIndices],
  );
  const newsPriceIndexOptions = useMemo(
    () =>
      activePriceIndices
        .filter((priceIndex) => {
          if (
            newsCommodityFilter &&
            priceIndex.commodity_code.trim().toUpperCase() !==
              newsCommodityFilter.trim().toUpperCase()
          ) {
            return false;
          }
          if (
            newsProviderFilter !== PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER &&
            priceIndex.provider.trim() !== newsProviderFilter
          ) {
            return false;
          }
          if (
            newsQuoteTypeFilter !== PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE &&
            priceIndex.quote_type?.trim().toUpperCase() !==
              newsQuoteTypeFilter.trim().toUpperCase()
          ) {
            return false;
          }
          if (
            newsLocationCodeFilter &&
            priceIndex.location_code?.trim().toUpperCase() !==
              newsLocationCodeFilter.trim().toUpperCase()
          ) {
            return false;
          }
          return true;
        })
        .map((priceIndex) => ({
          code: priceIndex.code,
          label: `${priceIndex.code} · ${priceIndex.name}`,
        })),
    [
      activePriceIndices,
      newsCommodityFilter,
      newsLocationCodeFilter,
      newsProviderFilter,
      newsQuoteTypeFilter,
    ],
  );
  const selectedNewsPriceIndex = useMemo(
    () =>
      activePriceIndices.find(
        (priceIndex) => priceIndex.code === newsPriceIndexCodeFilter,
      ) ?? null,
    [activePriceIndices, newsPriceIndexCodeFilter],
  );
  const resolvedNewsCommodity =
    selectedNewsPriceIndex?.commodity_code.trim().toUpperCase() ||
    newsCommodityFilter ||
    null;
  const resolvedNewsQuery = buildPromptHomeNewsSearchQuery({
    newsQuery: newsQueryParameter,
    priceIndex: selectedNewsPriceIndex,
    provider: newsProviderFilter,
    quoteType: newsQuoteTypeFilter,
    locationCode: newsLocationCodeFilter,
    region: newsRegionFilter,
  });
  const marketNewsQuery =
    resolvedNewsQuery || (resolvedNewsCommodity ? null : PROMPT_HOME_NEWS_DEFAULT_QUERY);
  const marketNewsTableFilters = useMemo(
    () => ({
      marketLocation: newsMarketLocationFilter,
      horizon: newsHorizonFilter,
      supplyEffect: newsSupplyEffectFilter,
      demandEffect: newsDemandEffectFilter,
    }),
    [
      newsDemandEffectFilter,
      newsHorizonFilter,
      newsMarketLocationFilter,
      newsSupplyEffectFilter,
    ],
  );
  const hasActiveNewsFilters = Boolean(
    newsCommodityFilter ||
      newsPriceIndexCodeFilter ||
      newsProviderFilter !== PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER ||
      newsQuoteTypeFilter !== PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE ||
      newsLocationCodeFilter ||
      newsRegionFilter ||
      newsMarketLocationFilter ||
      newsHorizonFilter !== "all" ||
      newsSupplyEffectFilter !== "all" ||
      newsDemandEffectFilter !== "all" ||
      newsQueryParameter ||
      newsLimit !== PROMPT_HOME_NEWS_DEFAULT_LIMIT ||
      newsLookbackDays !== PROMPT_HOME_NEWS_DEFAULT_LOOKBACK_DAYS,
  );
  const newsToggleSummary = `${resolvedNewsCommodity ?? "Markets"} · ${newsLookbackDays}d`;
  const newsDetail = selectedNewsPriceIndex
    ? `Live headlines matched to ${selectedNewsPriceIndex.name}.`
    : resolvedNewsCommodity
      ? `Live headlines matched to ${resolvedNewsCommodity}.`
      : "Live commodity-market headlines.";
  const updateNewsCardFilters = useCallback(
    (key: string, value: string) => {
      if (!canConfigureHomeCard) {
        return;
      }
      onHomeCardConfigurationChange({
        filters: setPromptHomeCardStringValue(homeCardFilters, key, value),
      });
    },
    [canConfigureHomeCard, homeCardFilters, onHomeCardConfigurationChange],
  );
  const updateNewsCardStringParameter = useCallback(
    (key: string, value: string) => {
      if (!canConfigureHomeCard) {
        return;
      }
      onHomeCardConfigurationChange({
        parameters: setPromptHomeCardStringValue(homeCardParameters, key, value),
      });
    },
    [canConfigureHomeCard, homeCardParameters, onHomeCardConfigurationChange],
  );
  const updateNewsCardIntegerParameter = useCallback(
    (key: string, value: number | null) => {
      if (!canConfigureHomeCard) {
        return;
      }
      onHomeCardConfigurationChange({
        parameters: setPromptHomeCardIntegerValue(
          homeCardParameters,
          key,
          value,
        ),
      });
    },
    [canConfigureHomeCard, homeCardParameters, onHomeCardConfigurationChange],
  );
  const clearNewsContext = useCallback(() => {
    if (!canConfigureHomeCard) {
      return;
    }
    onHomeCardConfigurationChange({
      filters: {},
      parameters: {},
    });
  }, [canConfigureHomeCard, onHomeCardConfigurationChange]);
  const handleNewsHeaderHeadlinesChange = useCallback(
    (items: MarketNewsHeadlineRecord[]) => {
      const nextHeadlines = items.slice(0, 4);
      setNewsHeaderHeadlines((currentHeadlines) => {
        if (
          currentHeadlines.length === nextHeadlines.length &&
          currentHeadlines.every(
            (headline, index) =>
              headline.title === nextHeadlines[index]?.title &&
              headline.link === nextHeadlines[index]?.link,
          )
        ) {
          return currentHeadlines;
        }

        return nextHeadlines;
      });
    },
    [],
  );
  const newsHeaderHeadlineTitles = useMemo(() => {
    const headlineTitles = newsHeaderHeadlines
      .map((headline) => headline.title.trim())
      .filter(Boolean);

    return headlineTitles.length > 0 ? headlineTitles : ["Headlines loading"];
  }, [newsHeaderHeadlines]);
  const newsHeaderTickerTitles =
    newsHeaderHeadlineTitles.length > 1
      ? [...newsHeaderHeadlineTitles, ...newsHeaderHeadlineTitles]
      : newsHeaderHeadlineTitles;
  const {
    dragHandleAttributes,
    dragHandleClassName,
  } =
    usePromptHomeCardHeaderDragProps<HTMLDivElement>();
  const newsFilterControls = (
    <div className="prompt-home-news-filter-bar" aria-label="News filters">
      <label className="prompt-home-prices-filter-field">
        <span>Search</span>
        <input
          type="search"
          value={newsQueryParameter}
          placeholder="OPEC, LNG, storm impacts"
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updateNewsCardStringParameter("news_query", event.target.value)
          }
        />
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Commodity</span>
        <select
          value={newsCommodityFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updateNewsCardFilters("commodity_code", event.target.value)
          }
        >
          <option value="">All commodities</option>
          {newsCommodityFilter &&
          !newsCommodityOptions.includes(newsCommodityFilter) ? (
            <option value={newsCommodityFilter}>
              {newsCommodityFilter} (unavailable)
            </option>
          ) : null}
          {newsCommodityOptions.map((commodityCode) => (
            <option key={commodityCode} value={commodityCode}>
              {commodityCode}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Market Location</span>
        <input
          type="search"
          value={newsMarketLocationFilter}
          placeholder="Region, country, city"
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updateNewsCardFilters("market_location", event.target.value)
          }
        />
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Index</span>
        <select
          value={newsPriceIndexCodeFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updateNewsCardFilters("price_index_code", event.target.value)
          }
        >
          <option value="">All indices</option>
          {newsPriceIndexCodeFilter &&
          !newsPriceIndexOptions.some(
            (priceIndexOption) =>
              priceIndexOption.code === newsPriceIndexCodeFilter,
          ) ? (
            <option value={newsPriceIndexCodeFilter}>
              {newsPriceIndexCodeFilter} (unavailable)
            </option>
          ) : null}
          {newsPriceIndexOptions.map((priceIndexOption) => (
            <option key={priceIndexOption.code} value={priceIndexOption.code}>
              {priceIndexOption.label}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Provider</span>
        <select
          value={newsProviderFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updateNewsCardFilters(
              "provider",
              event.target.value === PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER
                ? ""
                : event.target.value,
            )
          }
        >
          <option value={PROMPT_HOME_PRICE_FILTER_ALL_PROVIDER}>All providers</option>
          {newsProviderOptions.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Type</span>
        <select
          value={newsQuoteTypeFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updateNewsCardFilters(
              "quote_type",
              event.target.value === PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE
                ? ""
                : event.target.value,
            )
          }
        >
          <option value={PROMPT_HOME_PRICE_FILTER_ALL_QUOTE_TYPE}>All types</option>
          {newsQuoteTypeOptions.map((quoteType) => (
            <option key={quoteType} value={quoteType}>
              {formatPromptHomePriceQuoteTypeCode(quoteType)}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Term</span>
        <select
          value={newsHorizonFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) => {
            const nextFilter = normalizeMarketNewsHorizonFilter(
              event.target.value,
            );
            updateNewsCardFilters(
              "impact_horizon",
              nextFilter === "all" ? "" : nextFilter,
            );
          }}
        >
          {PROMPT_HOME_NEWS_HORIZON_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Supply Effect</span>
        <select
          value={newsSupplyEffectFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) => {
            const nextFilter = normalizeMarketNewsEffectFilter(
              event.target.value,
            );
            updateNewsCardFilters(
              "supply_effect",
              nextFilter === "all" ? "" : nextFilter,
            );
          }}
        >
          {PROMPT_HOME_NEWS_EFFECT_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value === "all" ? "All supply effects" : option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Demand Effect</span>
        <select
          value={newsDemandEffectFilter}
          disabled={!canConfigureHomeCard}
          onChange={(event) => {
            const nextFilter = normalizeMarketNewsEffectFilter(
              event.target.value,
            );
            updateNewsCardFilters(
              "demand_effect",
              nextFilter === "all" ? "" : nextFilter,
            );
          }}
        >
          {PROMPT_HOME_NEWS_EFFECT_FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value === "all" ? "All demand effects" : option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Lookback</span>
        <select
          value={String(newsLookbackDays)}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updateNewsCardIntegerParameter(
              "news_lookback_days",
              Number.parseInt(event.target.value, 10),
            )
          }
        >
          {PROMPT_HOME_NEWS_LOOKBACK_DAY_OPTIONS.map((days) => (
            <option key={days} value={days}>
              {days}d
            </option>
          ))}
        </select>
      </label>
      <label className="prompt-home-prices-filter-field">
        <span>Headlines</span>
        <select
          value={String(newsLimit)}
          disabled={!canConfigureHomeCard}
          onChange={(event) =>
            updateNewsCardIntegerParameter(
              "news_limit",
              Number.parseInt(event.target.value, 10),
            )
          }
        >
          {[3, 5, 8, 10].map((limit) => (
            <option key={limit} value={limit}>
              {limit}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
  const newsHeaderActions = newsExpandedState.expanded ? (
    <div
      className="prompt-home-news-card-head-actions"
      aria-label="Market news actions"
    >
      <button
        type="button"
        className={mergePromptHomeClassNames(
          "button button-secondary prompt-home-news-filter-button",
          hasActiveNewsFilters ? "is-active" : undefined,
        )}
        aria-controls={newsFilterDialogId}
        aria-expanded={newsFiltersOpen}
        onClick={() => setNewsFiltersOpen(true)}
      >
        Filter
      </button>
    </div>
  ) : null;

  return (
    <article
      className={`prompt-home-news-card ${newsExpandedState.expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <div
        {...dragHandleAttributes}
        className={mergePromptHomeClassNames(
          "prompt-home-news-card-head",
          dragHandleClassName,
        )}
      >
        <div className="prompt-home-news-card-copy">
          <span className="eyebrow">News</span>
          <div
            className={`prompt-home-news-headline-strip ${
              newsHeaderHeadlineTitles.length > 1 ? "is-scrolling" : "is-static"
            }`}
            aria-label="Scrolling market headlines"
          >
            <div className="prompt-home-news-headline-track">
              {newsHeaderTickerTitles.map((headlineTitle, index) => (
                <strong
                  key={`${headlineTitle}-${index}`}
                  className="prompt-home-news-headline"
                  aria-hidden={index >= newsHeaderHeadlineTitles.length}
                >
                  {headlineTitle}
                </strong>
              ))}
            </div>
          </div>
        </div>
        {newsHeaderActions}
        <div className="prompt-home-news-card-toggle-side">
          <button
            type="button"
            className="prompt-home-news-card-toggle"
            aria-expanded={newsExpandedState.expanded}
            aria-controls={newsPanelId}
            onClick={() => {
              if (newsExpandedState.expanded) {
                setNewsFiltersOpen(false);
              }
              newsExpandedState.setExpanded((current) => !current);
            }}
          >
            <div className="prompt-home-news-card-toggle-meta">
              <small>{newsToggleSummary}</small>
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {newsExpandedState.expanded ? "−" : "+"}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div
        id={newsPanelId}
        className="prompt-home-news-card-body"
        hidden={!newsExpandedState.expanded}
      >
        {referenceDataLoading ? (
          <p className="form-note">Loading market context for headline filters.</p>
        ) : null}
        {newsFiltersOpen ? (
          <div
            className="prompt-home-prices-filter-overlay prompt-home-news-filter-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setNewsFiltersOpen(false);
              }
            }}
          >
            <section
              id={newsFilterDialogId}
              className="prompt-home-prices-filter-dialog prompt-home-news-filter-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={newsFilterDialogTitleId}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setNewsFiltersOpen(false);
                }
              }}
            >
              <header className="prompt-home-prices-filter-dialog-head">
                <div>
                  <span className="eyebrow">News</span>
                  <h3 id={newsFilterDialogTitleId}>Filters</h3>
                </div>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setNewsFiltersOpen(false)}
                >
                  Close
                </button>
              </header>
              {newsFilterControls}
              <footer className="prompt-home-prices-filter-dialog-actions">
                {hasActiveNewsFilters ? (
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={!canConfigureHomeCard}
                    onClick={clearNewsContext}
                  >
                    Clear filters
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setNewsFiltersOpen(false)}
                >
                  Done
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        <MarketNewsPanel
          key={refreshKey}
          apiBase={appConfig.apiBase}
          commodity={resolvedNewsCommodity}
          query={marketNewsQuery}
          limit={newsLimit}
          lookbackDays={newsLookbackDays}
          variant="table"
          title="Latest Headlines"
          detail={newsDetail}
          filters={marketNewsTableFilters}
          onHeadlinesChange={handleNewsHeaderHeadlinesChange}
        />

        <div className="prompt-home-news-card-footer">
          <span>{marketNewsQuery || resolvedNewsCommodity || PROMPT_HOME_NEWS_DEFAULT_QUERY}</span>
          <div className="prompt-home-news-card-footer-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setRefreshKey((current) => current + 1)}
            >
              Refresh
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={onOpenReportsWorkspace}
            >
              Open Reports
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function PromptHomeMapTile({
  authSession,
  assets,
  deliveries,
  locations,
  priceIndices,
  spatialFeatures,
  referenceDataLoaded,
  homeCard,
  canConfigureHomeCard,
  onHomeCardConfigurationChange,
  onOpenMapWorkspace,
  initialMapAssetLayerVisible = true,
}: {
  authSession: StoredAuthSession | null;
  assets: AssetRecord[];
  deliveries: DeliveryRecord[];
  locations: LocationRecord[];
  priceIndices: PriceIndexRecord[];
  spatialFeatures: SpatialFeatureRecord[];
  referenceDataLoaded?: boolean;
  homeCard: PromptHomeTemplateCard | null;
  canConfigureHomeCard: boolean;
  onHomeCardConfigurationChange: (
    patch: {
      parameters?: Record<string, unknown>;
      filters?: Record<string, unknown>;
    },
  ) => void;
  onOpenMapWorkspace: () => void;
  initialMapAssetLayerVisible?: boolean;
}) {
  const homeCardInstanceId = homeCard
    ? getPromptHomeCardInstanceId(homeCard)
    : "map";
  const mapPanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_MAP_PANEL_ID,
    homeCardInstanceId,
    "map",
  );
  const mapFilterDialogId = promptHomeInstanceScopedId(
    "prompt-home-map-filter-dialog",
    homeCardInstanceId,
    "map-filter-dialog",
  );
  const mapFilterDialogTitleId = `${mapFilterDialogId}-title`;
  const mapExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.map-card",
      homeCardInstanceId,
      "map",
    ),
    true,
  );
  const [selectedAssetCode, setSelectedAssetCode] = useState<string | null>(
    null,
  );
  const [selectedVesselDeliveryId, setSelectedVesselDeliveryId] = useState<
    string | null
  >(null);
  const [mapFiltersOpen, setMapFiltersOpen] = useState(false);
  const [assetActivityVisibility, setAssetActivityVisibility] = useState<
    Record<string, boolean>
  >({});
  const assetGeographyVisibility = useMemo(
    () => buildPromptHomeMapGeographyVisibility(homeCard?.filters.geography),
    [homeCard?.filters.geography],
  );
  const [selectedCountryCode, setSelectedCountryCode] = useState("");
  const [selectedSubdivisionCode, setSelectedSubdivisionCode] = useState("");
  const [assetSubtypeVisibility, setAssetSubtypeVisibility] = useState<
    Record<string, boolean>
  >({});
  const mapRecordLimit = useMemo(
    () =>
      normalizePromptHomeMapRecordLimit(
        homeCard?.parameters.map_record_limit ?? getPromptHomeMapRecordLimit(),
      ),
    [homeCard?.parameters.map_record_limit],
  );
  const [showAssetLayer, setShowAssetLayer] = useState(
    initialMapAssetLayerVisible,
  );
  const [showVesselLayer, setShowVesselLayer] = useState(true);
  const [showMarketPriceLayer, setShowMarketPriceLayer] = useState(true);
  const [serverMapScopeSummary, setServerMapScopeSummary] =
    useState<AssetMapScopeSummary | null>(null);
  const homeCardFilters = useMemo(() => homeCard?.filters ?? {}, [homeCard]);
  const mapCommodityFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "commodity_code",
  );
  const mapLocationFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "location_code",
  );
  const mapRegionFilter = getPromptHomeCardStringValue(
    homeCardFilters,
    "region",
  );
  const mapFilteredPriceIndices = useMemo(
    () =>
      priceIndices.filter(
        (priceIndex) =>
          priceIndex.is_active &&
          Boolean(priceIndex.location_code?.trim()) &&
          promptHomeMapPriceIndexMatchesFilters(priceIndex, {
            commodityCode: mapCommodityFilter,
            locationCode: mapLocationFilter,
            region: mapRegionFilter,
          }),
      ),
    [mapCommodityFilter, mapLocationFilter, mapRegionFilter, priceIndices],
  );
  const mapPriceIndexCodes = useMemo(
    () => mapFilteredPriceIndices.map((priceIndex) => priceIndex.code),
    [mapFilteredPriceIndices],
  );
  const { latestMarksByCode: latestMapPriceMarksByCode } =
    useLatestPriceIndexMarks(mapPriceIndexCodes, {
      refreshIntervalMs: PROMPT_HOME_PRICE_REFRESH_INTERVAL_MS,
    });
  const mapSummary = useMemo(
    () => buildAssetMapSummary(assets, locations),
    [assets, locations],
  );
  const marketPriceRecords = useMemo(
    () =>
      buildAssetMapMarketPriceRecords({
        priceIndices: mapFilteredPriceIndices,
        locations,
        latestMarksByCode: latestMapPriceMarksByCode,
      }),
    [latestMapPriceMarksByCode, locations, mapFilteredPriceIndices],
  );
  const locationByCode = useMemo(
    () =>
      new Map(locations.map((location) => [location.code, location] as const)),
    [locations],
  );
  const assetSubtypeOptions = useMemo(
    () => sortedUniqueAssetSubtypes(mapSummary.records),
    [mapSummary.records],
  );
  const normalizedAssetActivityVisibility = useMemo(
    () => syncAssetActivityVisibilityState(assetActivityVisibility),
    [assetActivityVisibility],
  );
  const normalizedAssetGeographyVisibility = useMemo(
    () => syncAssetGeographyVisibilityState(assetGeographyVisibility),
    [assetGeographyVisibility],
  );
  const normalizedAssetSubtypeVisibility = useMemo(
    () =>
      syncAssetSubtypeVisibilityState(
        assetSubtypeOptions,
        assetSubtypeVisibility,
      ),
    [assetSubtypeOptions, assetSubtypeVisibility],
  );
  const hiddenAssetGeographies = useMemo(
    () =>
      ASSET_MAP_GEOGRAPHY_LABELS.filter(
        (geographyLabel) =>
          normalizedAssetGeographyVisibility[geographyLabel] === false,
      ),
    [normalizedAssetGeographyVisibility],
  );
  const hiddenAssetActivities = useMemo(
    () =>
      ASSET_MAP_ACTIVITY_LABELS.filter(
        (activityLabel) =>
          normalizedAssetActivityVisibility[activityLabel] === false,
      ),
    [normalizedAssetActivityVisibility],
  );
  const hiddenAssetSubtypes = useMemo(
    () =>
      assetSubtypeOptions.filter(
        (assetSubtype) =>
          normalizedAssetSubtypeVisibility[assetSubtype] === false,
      ),
    [assetSubtypeOptions, normalizedAssetSubtypeVisibility],
  );
  const geographyVisibleRecordCandidates = useMemo(
    () =>
      mapSummary.records.filter(
        (record) =>
          assetMapGeographyLabelForRecord(record) === null ||
          normalizedAssetGeographyVisibility[
            assetMapGeographyLabelForRecord(record) ?? ""
          ] !== false,
      ),
    [mapSummary.records, normalizedAssetGeographyVisibility],
  );
  const geographyVisibleMarketPriceCandidates = useMemo(
    () =>
      marketPriceRecords.filter(
        (record) =>
          assetMapGeographyLabelForMarketPrice(record) === null ||
          normalizedAssetGeographyVisibility[
            assetMapGeographyLabelForMarketPrice(record) ?? ""
          ] !== false,
      ),
    [marketPriceRecords, normalizedAssetGeographyVisibility],
  );
  const countryOptions = useMemo(
    () =>
      buildAssetMapCountryOptions({
        records: geographyVisibleRecordCandidates,
        marketPrices: geographyVisibleMarketPriceCandidates,
        weatherLocations: [],
        locationByCode,
      }),
    [
      geographyVisibleMarketPriceCandidates,
      geographyVisibleRecordCandidates,
      locationByCode,
    ],
  );
  const activeSelectedCountryCode = useMemo(
    () =>
      selectedCountryCode &&
      countryOptions.some(
        (countryOption) => countryOption.code === selectedCountryCode,
      )
        ? selectedCountryCode
        : "",
    [countryOptions, selectedCountryCode],
  );
  const countryVisibleRecordCandidates = useMemo(
    () =>
      geographyVisibleRecordCandidates.filter(
        (record) =>
          !activeSelectedCountryCode ||
          assetMapCountryCodeForRecord(record) === activeSelectedCountryCode,
      ),
    [activeSelectedCountryCode, geographyVisibleRecordCandidates],
  );
  const countryVisibleMarketPriceRecords = useMemo(
    () =>
      geographyVisibleMarketPriceCandidates.filter(
        (record) =>
          !activeSelectedCountryCode ||
          assetMapCountryCodeForMarketPrice(record) === activeSelectedCountryCode,
      ),
    [activeSelectedCountryCode, geographyVisibleMarketPriceCandidates],
  );
  const subdivisionOptions = useMemo(
    () =>
      buildAssetMapSubdivisionOptions({
        records: countryVisibleRecordCandidates,
        marketPrices: countryVisibleMarketPriceRecords,
        weatherLocations: [],
        locationByCode,
      }),
    [countryVisibleMarketPriceRecords, countryVisibleRecordCandidates, locationByCode],
  );
  const activeSelectedSubdivisionCode = useMemo(
    () =>
      selectedSubdivisionCode &&
      subdivisionOptions.some(
        (subdivisionOption) =>
          subdivisionOption.code === selectedSubdivisionCode,
      )
        ? selectedSubdivisionCode
        : "",
    [selectedSubdivisionCode, subdivisionOptions],
  );
  const subdivisionVisibleRecordCandidates = useMemo(
    () =>
      countryVisibleRecordCandidates.filter(
        (record) =>
          !activeSelectedSubdivisionCode ||
          assetMapSubdivisionCodeForRecord(record) ===
            activeSelectedSubdivisionCode,
      ),
    [activeSelectedSubdivisionCode, countryVisibleRecordCandidates],
  );
  const subdivisionVisibleMarketPriceRecords = useMemo(
    () =>
      countryVisibleMarketPriceRecords.filter(
        (record) =>
          !activeSelectedSubdivisionCode ||
          assetMapSubdivisionCodeForMarketPrice(record) ===
            activeSelectedSubdivisionCode,
      ),
    [activeSelectedSubdivisionCode, countryVisibleMarketPriceRecords],
  );
  const activityVisibleRecordCandidates = useMemo(
    () =>
      subdivisionVisibleRecordCandidates.filter((record) =>
        assetMapActivityLabelsForAsset(record.asset).some(
          (activityLabel) =>
            normalizedAssetActivityVisibility[activityLabel] !== false,
        ),
      ),
    [normalizedAssetActivityVisibility, subdivisionVisibleRecordCandidates],
  );
  const visibleRecordCandidates = useMemo(
    () =>
      activityVisibleRecordCandidates.filter(
        (record) =>
          normalizedAssetSubtypeVisibility[
            assetMapSubtypeLabelForAsset(record.asset)
          ] !== false,
      ),
    [activityVisibleRecordCandidates, normalizedAssetSubtypeVisibility],
  );
  const geographyVisibleMappedRecords = useMemo(
    () =>
      mapSummary.mappedRecords.filter(
        (record) =>
          assetMapGeographyLabelForRecord(record) === null ||
          normalizedAssetGeographyVisibility[
            assetMapGeographyLabelForRecord(record) ?? ""
          ] !== false,
      ),
    [mapSummary.mappedRecords, normalizedAssetGeographyVisibility],
  );
  const countryVisibleMappedRecords = useMemo(
    () =>
      geographyVisibleMappedRecords.filter(
        (record) =>
          !activeSelectedCountryCode ||
          assetMapCountryCodeForRecord(record) === activeSelectedCountryCode,
      ),
    [activeSelectedCountryCode, geographyVisibleMappedRecords],
  );
  const subdivisionVisibleMappedRecords = useMemo(
    () =>
      countryVisibleMappedRecords.filter(
        (record) =>
          !activeSelectedSubdivisionCode ||
          assetMapSubdivisionCodeForRecord(record) ===
            activeSelectedSubdivisionCode,
      ),
    [activeSelectedSubdivisionCode, countryVisibleMappedRecords],
  );
  const activityVisibleMappedRecords = useMemo(
    () =>
      subdivisionVisibleMappedRecords.filter((record) =>
        assetMapActivityLabelsForAsset(record.asset).some(
          (activityLabel) =>
            normalizedAssetActivityVisibility[activityLabel] !== false,
        ),
      ),
    [normalizedAssetActivityVisibility, subdivisionVisibleMappedRecords],
  );
  const visibleMappedRecords = useMemo(
    () =>
      activityVisibleMappedRecords.filter(
        (record) =>
          normalizedAssetSubtypeVisibility[
            assetMapSubtypeLabelForAsset(record.asset)
          ] !== false,
      ),
    [activityVisibleMappedRecords, normalizedAssetSubtypeVisibility],
  );
  const displayedMappedRecords = useMemo(
    () => visibleMappedRecords.slice(0, mapRecordLimit),
    [mapRecordLimit, visibleMappedRecords],
  );
  const displayedAssetMapRecords = useMemo(
    () => (showAssetLayer ? displayedMappedRecords : []),
    [displayedMappedRecords, showAssetLayer],
  );
  const displayedMarketPriceRecords = useMemo(
    () => (showMarketPriceLayer ? subdivisionVisibleMarketPriceRecords : []),
    [showMarketPriceLayer, subdivisionVisibleMarketPriceRecords],
  );
  const vesselPositions = useMemo(
    () => buildVesselMapRecords(deliveries),
    [deliveries],
  );
  const activeSelectedVesselDeliveryId = useMemo(
    () =>
      selectedVesselDeliveryId &&
      vesselPositions.some(
        (vessel) => vessel.deliveryId === selectedVesselDeliveryId,
      )
        ? selectedVesselDeliveryId
        : null,
    [selectedVesselDeliveryId, vesselPositions],
  );
  const activeSpatialFeatures = useMemo(
    () => spatialFeatures.filter((feature) => feature.is_active),
    [spatialFeatures],
  );
  const activeRailRouteSpatialFeatures = useMemo(
    () =>
      activeSpatialFeatures.filter(
        (feature) => feature.entity_type === "RAIL_ROUTE",
      ),
    [activeSpatialFeatures],
  );
  const activeSharedSpatialFeatures = useMemo(
    () =>
      activeSpatialFeatures.filter(
        (feature) => feature.entity_type !== "RAIL_ROUTE",
      ),
    [activeSpatialFeatures],
  );
  const activeServerMapScopeSummary =
    authSession && referenceDataLoaded ? serverMapScopeSummary : null;
  const exactFilteredMapReadyCount =
    activeServerMapScopeSummary?.filtered_map_ready_count ??
    visibleMappedRecords.length;
  const activeSelectedAssetCode = useMemo(
    () =>
      selectedAssetCode &&
      displayedAssetMapRecords.some(
        (record) => record.asset.code === selectedAssetCode,
      )
        ? selectedAssetCode
        : null,
    [displayedAssetMapRecords, selectedAssetCode],
  );
  const selectedRecord = useMemo(
    () =>
      displayedAssetMapRecords.find(
        (record) => record.asset.code === activeSelectedAssetCode,
      ) ?? null,
    [activeSelectedAssetCode, displayedAssetMapRecords],
  );
  const statusTitle =
    visibleMappedRecords.length === 0 &&
    displayedMarketPriceRecords.length === 0
      ? geographyVisibleRecordCandidates.length === 0
        ? "No selected geographies are visible right now."
        : countryVisibleRecordCandidates.length === 0 &&
            activeSelectedCountryCode
          ? `No assets are visible for ${formatAssetMapCountryLabel(activeSelectedCountryCode)} right now.`
          : subdivisionVisibleRecordCandidates.length === 0 &&
              activeSelectedSubdivisionCode
            ? `No assets are visible for ${activeSelectedSubdivisionCode} right now.`
            : activityVisibleRecordCandidates.length === 0
              ? "No selected activities are visible right now."
              : visibleRecordCandidates.length === 0 &&
                  assetSubtypeOptions.length > 0
                ? "No selected asset types are visible right now."
                : "No map-ready assets yet."
      : null;
  const statusDetail =
    visibleMappedRecords.length === 0 &&
    displayedMarketPriceRecords.length === 0
      ? geographyVisibleRecordCandidates.length === 0
        ? "Turn at least one geography back on to restore plotted assets."
        : countryVisibleRecordCandidates.length === 0 &&
            activeSelectedCountryCode
          ? "Choose All countries or a different country to restore plotted assets."
          : subdivisionVisibleRecordCandidates.length === 0 &&
              activeSelectedSubdivisionCode
            ? "Choose All states or territories or a different subdivision to restore plotted assets."
            : activityVisibleRecordCandidates.length === 0
              ? "Turn at least one activity back on to restore plotted assets."
              : visibleRecordCandidates.length === 0 &&
                  assetSubtypeOptions.length > 0
                ? "Turn at least one asset type back on to restore plotted assets."
                : "The base map still loads here. Assets appear once they have GeoJSON, direct coordinates, or linked location coordinates."
              : null;

  useEffect(() => {
    if (!authSession || !referenceDataLoaded) {
      return;
    }

    const currentAuthSession = authSession;
    let cancelled = false;

    async function loadScopeSummary() {
      try {
        const nextSummary = await loadAssetMapScopeSummary(
          appConfig.apiBase,
          {
            hiddenGeographies: hiddenAssetGeographies,
            selectedCountryCode: activeSelectedCountryCode,
            selectedSubdivisionCode: activeSelectedSubdivisionCode,
            hiddenActivities: hiddenAssetActivities,
            hiddenSubtypes: hiddenAssetSubtypes,
          },
          {
            readHeaders: sessionHeaders(currentAuthSession),
          },
        );
        if (!cancelled) {
          setServerMapScopeSummary(nextSummary);
        }
      } catch {
        if (!cancelled) {
          setServerMapScopeSummary(null);
        }
      }
    }

    void loadScopeSummary();

    return () => {
      cancelled = true;
    };
  }, [
    authSession,
    hiddenAssetActivities,
    hiddenAssetGeographies,
    hiddenAssetSubtypes,
    referenceDataLoaded,
    activeSelectedCountryCode,
    activeSelectedSubdivisionCode,
  ]);

  function handleToggleMapExpanded() {
    if (mapExpandedState.expanded) {
      setMapFiltersOpen(false);
    }
    mapExpandedState.setExpanded((current) => !current);
  }

  function handleToggleAssetActivity(activityLabel: string) {
    setAssetActivityVisibility((currentState) => {
      const nextState = syncAssetActivityVisibilityState(currentState);
      return {
        ...nextState,
        [activityLabel]: nextState[activityLabel] === false,
      };
    });
  }

  function handleToggleAssetGeography(geographyLabel: string) {
    if (!canConfigureHomeCard) {
      return;
    }
    const nextState = syncAssetGeographyVisibilityState(assetGeographyVisibility);
    const nextVisibilityState = {
      ...nextState,
      [geographyLabel]: nextState[geographyLabel] === false,
    };
    const visibleGeographies =
      visiblePromptHomeMapGeographiesFromState(nextVisibilityState);
    const nextFilters = { ...(homeCard?.filters ?? {}) };
    if (visibleGeographies.length === ASSET_MAP_GEOGRAPHY_LABELS.length) {
      delete nextFilters.geography;
    } else {
      nextFilters.geography = visibleGeographies;
    }
    onHomeCardConfigurationChange({ filters: nextFilters });
  }

  function handleSetAllAssetGeographiesVisible(visible: boolean) {
    if (!canConfigureHomeCard) {
      return;
    }
    const nextFilters = { ...(homeCard?.filters ?? {}) };
    if (visible) {
      delete nextFilters.geography;
    } else {
      nextFilters.geography = [];
    }
    onHomeCardConfigurationChange({ filters: nextFilters });
  }

  function handleSelectCountry(countryCode: string) {
    setSelectedCountryCode(countryCode);
  }

  function handleSelectSubdivision(subdivisionCode: string) {
    setSelectedSubdivisionCode(subdivisionCode);
  }

  function handleToggleAssetSubtype(assetSubtype: string) {
    setAssetSubtypeVisibility((currentState) => {
      const nextState = syncAssetSubtypeVisibilityState(
        assetSubtypeOptions,
        currentState,
      );
      return {
        ...nextState,
        [assetSubtype]: nextState[assetSubtype] === false,
      };
    });
  }

  function handleSetAllAssetSubtypesVisible(visible: boolean) {
    setAssetSubtypeVisibility(
      setAllAssetSubtypeVisibilityState(assetSubtypeOptions, visible),
    );
  }

  function handleMapRecordLimitChange(nextValue: string) {
    const normalizedLimit = savePromptHomeMapRecordLimit(nextValue);
    if (!canConfigureHomeCard) {
      return;
    }
    onHomeCardConfigurationChange({
      parameters: {
        ...(homeCard?.parameters ?? {}),
        map_record_limit: normalizedLimit,
      },
    });
  }
  const { dragHandleAttributes, dragHandleClassName } =
    usePromptHomeCardHeaderDragProps<HTMLDivElement>();

  return (
    <article
      className={`prompt-home-map-card ${mapExpandedState.expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <div
        {...dragHandleAttributes}
        className={mergePromptHomeClassNames(
          "prompt-home-map-card-head",
          dragHandleClassName,
        )}
      >
        <div className="prompt-home-map-card-copy">
          <span className="eyebrow">Map</span>
          <strong>Asset map</strong>
        </div>
        {mapExpandedState.expanded ? (
          <div
            className="prompt-home-map-card-head-actions"
            aria-label="Map actions"
          >
            <button
              type="button"
              className="button button-secondary prompt-home-map-filter-button"
              aria-controls={mapFilterDialogId}
              aria-expanded={mapFiltersOpen}
              onClick={() => setMapFiltersOpen(true)}
            >
              Filter
            </button>
          </div>
        ) : null}
        <div className="prompt-home-map-card-toggle-side">
          <button
            type="button"
            className="prompt-home-map-card-toggle"
            aria-label={
              mapExpandedState.expanded ? "Collapse Asset map" : "Expand Asset map"
            }
            aria-expanded={mapExpandedState.expanded}
            aria-controls={mapPanelId}
            onClick={handleToggleMapExpanded}
          >
            <div className="prompt-home-map-card-toggle-meta">
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {mapExpandedState.expanded ? "−" : "+"}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div
        id={mapPanelId}
        className="prompt-home-map-card-body"
        hidden={!mapExpandedState.expanded}
      >
        <AssetMapCanvas
          records={displayedMappedRecords}
          spatialFeatures={activeSharedSpatialFeatures}
          railRouteSpatialFeatures={activeRailRouteSpatialFeatures}
          vesselPositions={vesselPositions}
          marketPrices={subdivisionVisibleMarketPriceRecords}
          showAssets={showAssetLayer}
          showVessels={showVesselLayer}
          showMarketPrices={showMarketPriceLayer}
          filterCardStateKey="prompt-home.map-filters-card"
          assetActivityVisibility={normalizedAssetActivityVisibility}
          assetGeographyVisibility={normalizedAssetGeographyVisibility}
          countryOptions={countryOptions}
          selectedCountryCode={activeSelectedCountryCode}
          subdivisionOptions={subdivisionOptions}
          selectedSubdivisionCode={activeSelectedSubdivisionCode}
          assetSubtypeOptions={assetSubtypeOptions}
          assetSubtypeVisibility={normalizedAssetSubtypeVisibility}
          initialWeatherOverlayVisibility={
            PROMPT_HOME_INITIAL_WEATHER_OVERLAY_VISIBILITY
          }
          filterMode="dialog"
          filtersOpen={mapFiltersOpen}
          onFiltersOpenChange={setMapFiltersOpen}
          filterDialogId={mapFilterDialogId}
          filterDialogTitleId={mapFilterDialogTitleId}
          onShowAssetsChange={setShowAssetLayer}
          onShowVesselsChange={setShowVesselLayer}
          onShowMarketPricesChange={setShowMarketPriceLayer}
          onToggleAssetActivity={handleToggleAssetActivity}
          onToggleAssetGeography={handleToggleAssetGeography}
          onSelectCountry={handleSelectCountry}
          onSelectSubdivision={handleSelectSubdivision}
          onSetAllAssetGeographiesVisible={handleSetAllAssetGeographiesVisible}
          onToggleAssetSubtype={handleToggleAssetSubtype}
          onSetAllAssetSubtypesVisible={handleSetAllAssetSubtypesVisible}
          selectedAssetCode={activeSelectedAssetCode}
          onSelectAsset={setSelectedAssetCode}
          selectedVesselDeliveryId={activeSelectedVesselDeliveryId}
          onSelectVessel={setSelectedVesselDeliveryId}
          statusTitle={statusTitle}
          statusDetail={statusDetail}
        />

        <div className="prompt-home-map-card-settings">
          <label className="field prompt-home-map-record-limit-field">
            <span>Show up to</span>
            <select
              className="control"
              aria-label="Home map record limit"
              value={String(mapRecordLimit)}
              disabled={!canConfigureHomeCard}
              onChange={(event) =>
                handleMapRecordLimitChange(event.target.value)
              }
            >
              {PROMPT_HOME_MAP_RECORD_LIMIT_OPTIONS.map((limitOption) => (
                <option key={limitOption} value={limitOption}>
                  {`${limitOption.toLocaleString()} map records`}
                </option>
              ))}
            </select>
          </label>
          <p className="form-note prompt-home-map-record-limit-note">
            Higher limits draw more markers and rows in Home.
          </p>
        </div>

        <AssetMapRecordsCard
          records={displayedAssetMapRecords}
          totalRecordCount={showAssetLayer ? exactFilteredMapReadyCount : 0}
          selectedAssetCode={activeSelectedAssetCode}
          onSelectAsset={setSelectedAssetCode}
          collapsibleStateKey="prompt-home.map-records-card"
        />

        <div
          className={`prompt-home-map-card-footer ${selectedRecord ? "" : "is-actions-only"}`.trim()}
        >
          {selectedRecord ? (
            <div className="prompt-home-map-card-selection">
              <strong>{selectedRecord.asset.code}</strong>
              <p>{`${selectedRecord.asset.name} · ${formatAssetMapSource(selectedRecord)}`}</p>
              <p>{formatAssetMapPlacement(selectedRecord)}</p>
            </div>
          ) : null}
          <button
            type="button"
            className="button button-secondary"
            onClick={onOpenMapWorkspace}
          >
            Open Map Workspace
          </button>
        </div>
      </div>
    </article>
  );
}

function PromptHomeTimeframePanel({
  instanceId = "timeframe",
  currentTime,
  timeDisplaySettings,
  timeZoneOptions,
  onTimeZoneChange,
}: {
  instanceId?: string;
  currentTime: Date;
  timeDisplaySettings: TimeDisplaySettings;
  timeZoneOptions: TimeDisplayTimeZoneOption[];
  onTimeZoneChange: (nextTimeZone: string) => void;
}) {
  const timeframePanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_TIMEFRAME_PANEL_ID,
    instanceId,
    "timeframe",
  );
  const timeframeExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.timeframe-panel",
      instanceId,
      "timeframe",
    ),
    true,
  );
  const resolvedTimeZone = resolveTimeDisplayTimeZone(timeDisplaySettings);
  const timeZonePreferenceLabel =
    formatTimeDisplayTimeZonePreferenceLabel(timeDisplaySettings);
  const zonedDateParts = getPromptHomeZonedDateParts(
    currentTime,
    resolvedTimeZone,
  );
  const currentClockLabel = formatPromptHomeClockTime(
    currentTime,
    resolvedTimeZone,
  );
  const currentMonthLabel = formatPromptHomeMonthLabel(
    currentTime,
    resolvedTimeZone,
  );
  const currentMonthDayLabel = formatPromptHomeMonthDayLabel(
    currentTime,
    resolvedTimeZone,
  );
  const currentHourEndingLabel = formatHourEndingLabel(
    currentHourEnding(zonedDateParts),
  );
  const currentWeekdayLabel =
    PROMPT_HOME_WEEKDAY_FULL_LABELS[zonedDateParts.weekdayIndex];
  const timeframeCollapsedSummary = [
    currentClockLabel,
    currentHourEndingLabel,
  ].join(" | ");
  const { dragHandleAttributes, dragHandleClassName } =
    usePromptHomeCardHeaderDragProps<HTMLDivElement>();

  return (
    <section
      className={`prompt-home-timeframe-panel ${timeframeExpandedState.expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <div
        {...dragHandleAttributes}
        className={mergePromptHomeClassNames(
          "prompt-home-timeframe-panel-head",
          dragHandleClassName,
        )}
      >
        <div className="prompt-home-timeframe-panel-toggle">
          <div className="prompt-home-timeframe-panel-copy">
            <span className="eyebrow">Desk Time</span>
            <strong className="prompt-home-timeframe-panel-summary">
              {timeframeCollapsedSummary}
            </strong>
          </div>
        </div>

        <div className="prompt-home-timeframe-panel-side">
          <button
            type="button"
            className="prompt-home-timeframe-panel-toggle-action"
            aria-label={
              timeframeExpandedState.expanded
                ? "Collapse Desk Time"
                : "Expand Desk Time"
            }
            aria-expanded={timeframeExpandedState.expanded}
            aria-controls={timeframePanelId}
            onClick={() =>
              timeframeExpandedState.setExpanded((current) => !current)
            }
          >
            <div className="prompt-home-timeframe-panel-toggle-meta">
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {timeframeExpandedState.expanded ? "−" : "+"}
              </span>
            </div>
          </button>

          {timeframeExpandedState.expanded ? (
            <label className="field prompt-home-timezone-field">
              <span>Time zone</span>
              <select
                className="control"
                aria-label="Preferred time zone"
                value={timeDisplaySettings.timeZone}
                onChange={(event) => onTimeZoneChange(event.target.value)}
              >
                {timeZoneOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      <div
        id={timeframePanelId}
        className="prompt-home-timeframe-panel-body"
        hidden={!timeframeExpandedState.expanded}
      >
        <div className="prompt-home-desk-time-facts">
          <div className="prompt-home-desk-time-fact">
            <span>Clock</span>
            <strong>{currentClockLabel}</strong>
            <small>{timeZonePreferenceLabel}</small>
          </div>
          <div className="prompt-home-desk-time-fact">
            <span>Hour ending</span>
            <strong>{currentHourEndingLabel}</strong>
            <small>{currentWeekdayLabel}</small>
          </div>
          <div className="prompt-home-desk-time-fact">
            <span>Date</span>
            <strong>{currentMonthDayLabel}</strong>
            <small>{currentMonthLabel}</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function PromptHomeExchangesPanel({
  instanceId = "exchanges",
  currentTime,
  timeDisplaySettings,
}: {
  instanceId?: string;
  currentTime: Date;
  timeDisplaySettings: TimeDisplaySettings;
}) {
  const exchangesPanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_EXCHANGES_PANEL_ID,
    instanceId,
    "exchanges",
  );
  const exchangesExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.exchanges-card",
      instanceId,
      "exchanges",
    ),
    true,
  );
  const resolvedTimeZone = resolveTimeDisplayTimeZone(timeDisplaySettings);
  const timeZonePreferenceLabel =
    formatTimeDisplayTimeZonePreferenceLabel(timeDisplaySettings);
  const exchangeSessionLanes = PROMPT_HOME_MAJOR_EXCHANGE_SESSIONS.map(
    (session) =>
      buildPromptHomeExchangeSessionLane(
        session,
        resolvedTimeZone,
        currentTime,
      ),
  );
  const alphaVantageExchangeCount =
    PROMPT_HOME_ALPHA_VANTAGE_EXCHANGE_COVERAGE.reduce(
      (count, coverage) => count + coverage.primaryExchanges.length,
      0,
    );
  const alphaVantageMarketCount =
    PROMPT_HOME_ALPHA_VANTAGE_EXCHANGE_COVERAGE.length;
  const exchangesCollapsedSummary = `${exchangeSessionLanes.length} major venue sessions · ${alphaVantageExchangeCount} Alpha Vantage venues · ${timeZonePreferenceLabel}`;
  const { dragHandleAttributes, dragHandleClassName } =
    usePromptHomeCardHeaderDragProps<HTMLDivElement>();

  return (
    <section
      className={`prompt-home-exchanges-card ${exchangesExpandedState.expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <div
        {...dragHandleAttributes}
        className={mergePromptHomeClassNames(
          "prompt-home-exchanges-card-head",
          dragHandleClassName,
        )}
      >
        <div className="prompt-home-exchanges-card-copy">
          <span className="eyebrow">Exchanges</span>
          <strong>{exchangesCollapsedSummary}</strong>
        </div>

        <div className="prompt-home-exchanges-card-side">
          <button
            type="button"
            className="prompt-home-exchanges-card-toggle"
            aria-label={
              exchangesExpandedState.expanded
                ? "Collapse Exchanges"
                : "Expand Exchanges"
            }
            aria-expanded={exchangesExpandedState.expanded}
            aria-controls={exchangesPanelId}
            onClick={() =>
              exchangesExpandedState.setExpanded((current) => !current)
            }
          >
            <div className="prompt-home-exchanges-card-toggle-meta">
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {exchangesExpandedState.expanded ? "−" : "+"}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div
        id={exchangesPanelId}
        className="prompt-home-exchanges-card-body"
        hidden={!exchangesExpandedState.expanded}
      >
        <div className="prompt-home-session-board">
          <p className="prompt-home-session-board-note">
            Representative venue sessions converted into{" "}
            {timeZonePreferenceLabel}.
          </p>
          <div className="prompt-home-session-lane-list">
            {exchangeSessionLanes.map((session) => (
              <div
                key={session.key}
                className={`prompt-home-session-lane is-${session.tone}`}
              >
                <div className="prompt-home-session-lane-copy">
                  <strong>{session.label}</strong>
                  <span>{session.displayWindowLabel}</span>
                  <small>
                    {session.detail} · {session.sourceWindowLabel}
                  </small>
                </div>
                <div
                  className="prompt-home-session-lane-track"
                  aria-hidden="true"
                >
                  {session.segments.map((segment) => (
                    <span
                      key={segment.key}
                      className="prompt-home-session-lane-segment"
                      style={{
                        left: `${segment.startPercent}%`,
                        width: `${segment.widthPercent}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <section
            className="prompt-home-alpha-vantage-exchanges"
            aria-label="Alpha Vantage exchange coverage"
          >
            <div className="prompt-home-alpha-vantage-exchanges-head">
              <div>
                <strong>Alpha Vantage exchange coverage</strong>
                <span>
                  {alphaVantageExchangeCount} primary venues across{" "}
                  {alphaVantageMarketCount} market rows
                </span>
              </div>
              <small>MARKET_STATUS coverage</small>
            </div>
            <div className="prompt-home-alpha-vantage-exchange-grid">
              {PROMPT_HOME_ALPHA_VANTAGE_EXCHANGE_COVERAGE.map((coverage) => (
                <article
                  key={coverage.key}
                  className="prompt-home-alpha-vantage-exchange-card"
                >
                  <span>
                    {coverage.marketType} · {coverage.marketGroup}
                  </span>
                  <strong>{coverage.region}</strong>
                  <p>{coverage.primaryExchanges.join(", ")}</p>
                  <small>
                    {coverage.localWindowLabel}
                    {coverage.notes ? ` · ${coverage.notes}` : ""}
                  </small>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function PromptHomeCalendarPanel({
  instanceId = "calendar",
  currentTime,
  timeDisplaySettings,
  customEventsHref,
  onOpenCustomEvents,
}: {
  instanceId?: string;
  currentTime: Date;
  timeDisplaySettings: TimeDisplaySettings;
  customEventsHref: string;
  onOpenCustomEvents?: () => void;
}) {
  const timeframePanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_CALENDAR_PANEL_ID,
    instanceId,
    "calendar",
  );
  const dayPanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_DAY_PANEL_ID,
    instanceId,
    "calendar",
  );
  const weekPanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_WEEK_PANEL_ID,
    instanceId,
    "calendar",
  );
  const monthPanelId = promptHomeInstanceScopedId(
    PROMPT_HOME_MONTH_PANEL_ID,
    instanceId,
    "calendar",
  );
  const calendarSettingsDialogId = promptHomeInstanceScopedId(
    "prompt-home-calendar-settings-dialog",
    instanceId,
    "calendar-settings",
  );
  const calendarSettingsDialogTitleId = `${calendarSettingsDialogId}-title`;
  const timeframeExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.calendar-panel",
      instanceId,
      "calendar",
    ),
    true,
  );
  const dayCardExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.calendar.day-card",
      instanceId,
      "calendar",
    ),
    true,
  );
  const weekCardExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.calendar.week-card",
      instanceId,
      "calendar",
    ),
    true,
  );
  const monthCardExpandedState = usePersistentCollapsibleCardState(
    promptHomeInstanceStorageKey(
      "prompt-home.calendar.month-card",
      instanceId,
      "calendar",
    ),
    true,
  );
  const dayCalendarToggleState = usePersistentPromptHomeCalendarCardState(
    "day",
    true,
  );
  const weekCalendarToggleState = usePersistentPromptHomeCalendarCardState(
    "week",
    true,
  );
  const monthCalendarToggleState = usePersistentPromptHomeCalendarCardState(
    "month",
    true,
  );
  const resolvedTimeZone = resolveTimeDisplayTimeZone(timeDisplaySettings);
  const googleCalendarSession = useSyncExternalStore(
    subscribeGoogleCalendarSession,
    getGoogleCalendarSessionSnapshot,
    getGoogleCalendarSessionSnapshot,
  );
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [calendarSettingsOpen, setCalendarSettingsOpen] = useState(false);
  const [availableGoogleCalendars, setAvailableGoogleCalendars] = useState<
    GoogleCalendarListEntry[]
  >([]);
  const [calendarSettingsLoading, setCalendarSettingsLoading] = useState(false);
  const [calendarSettingsError, setCalendarSettingsError] = useState("");
  const zonedDateParts = getPromptHomeZonedDateParts(
    currentTime,
    resolvedTimeZone,
  );
  const currentClockLabel = formatPromptHomeClockTime(
    currentTime,
    resolvedTimeZone,
  );
  const currentMonthLabel = formatPromptHomeMonthLabel(
    currentTime,
    resolvedTimeZone,
  );
  const currentMonthDayLabel = formatPromptHomeMonthDayLabel(
    currentTime,
    resolvedTimeZone,
  );
  const currentSummaryMonthDayLabel = formatPromptHomeSummaryMonthDayLabel(
    currentTime,
    resolvedTimeZone,
  );
  const currentHourEndingLabel = formatHourEndingLabel(
    currentHourEnding(zonedDateParts),
  );
  const currentWeekdayLabel =
    PROMPT_HOME_WEEKDAY_FULL_LABELS[zonedDateParts.weekdayIndex];
  const currentDayPercent = meterPercentForRatio(
    minutesIntoDay(zonedDateParts),
    PROMPT_HOME_DAY_MINUTES,
  );
  const currentWeekPercent = meterPercentForRatio(
    zonedDateParts.weekdayIndex * PROMPT_HOME_DAY_MINUTES +
      minutesIntoDay(zonedDateParts),
    PROMPT_HOME_WEEK_MINUTES,
  );
  const currentDayKey = promptHomeCalendarDayKey(
    zonedDateParts.year,
    zonedDateParts.month,
    zonedDateParts.day,
  );
  const currentWeekStartDayKey = currentDayKey - zonedDateParts.weekdayIndex;
  const currentWeekEndDayKey =
    currentWeekStartDayKey + PROMPT_HOME_WEEK_DAYS - 1;
  const monthDayTotal = daysInMonth(zonedDateParts);
  const calendarRefreshKey = `${zonedDateParts.year}-${zonedDateParts.month}-${zonedDateParts.day}`;
  const hasCalendarTimelineEnabled =
    dayCalendarToggleState.enabled ||
    weekCalendarToggleState.enabled ||
    monthCalendarToggleState.enabled;
  const selectedGoogleCalendars = googleCalendarSession.selectedCalendars;
  const selectedGoogleCalendarSignature =
    googleCalendarSelectionSignature(selectedGoogleCalendars);
  const calendarSessionTokenIsUsable = googleCalendarSessionTokenIsUsable({
    accessToken: googleCalendarSession.accessToken,
    accessTokenExpiresAt: googleCalendarSession.accessTokenExpiresAt,
  });
  const calendarSessionCanRefresh =
    hasCalendarTimelineEnabled &&
    calendarSessionTokenIsUsable &&
    selectedGoogleCalendars.length > 0;
  const calendarCollapsedSummary = [
    currentWeekdayLabel,
    currentSummaryMonthDayLabel,
  ].join(" | ");
  const currentMonthPercent = meterPercentForRatio(
    (zonedDateParts.day - 1) * PROMPT_HOME_DAY_MINUTES +
      minutesIntoDay(zonedDateParts),
    monthDayTotal * PROMPT_HOME_DAY_MINUTES,
  );
  const tradingWindowStartPercent = meterPercentForHourEnding(
    PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING,
  );
  const tradingWindowEndPercent = meterPercentForHourEnding(
    PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING,
  );
  const tradingWindowWidthPercent =
    tradingWindowEndPercent - tradingWindowStartPercent;
  const dayTicks: PromptHomeMeterTick[] = PROMPT_HOME_DAY_METER_TICKS.map(
    (tick, index) => ({
      key: String(tick),
      label: formatHourEndingLabel(tick),
      percent: meterPercentForHourEnding(tick),
      align:
        index === 0
          ? "start"
          : index === PROMPT_HOME_DAY_METER_TICKS.length - 1
            ? "end"
            : "center",
    }),
  );
  const weekTicks = buildWeekMeterTicks();
  const monthTicks = buildMonthMeterTicks(monthDayTotal);
  const tradingWindowStartClockLabel = formatPromptHomeClockMinutes(
    PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING * 60,
  );
  const tradingWindowEndClockLabel = formatPromptHomeClockMinutes(
    PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING * 60,
  );
  const tradingMarkers: PromptHomeMeterMarker[] = [
    {
      key: "open",
      label: "Trading opens",
      detail: `${tradingWindowStartClockLabel} local · ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)}`,
      percent: tradingWindowStartPercent,
      align: "start",
    },
    {
      key: "close",
      label: "Desk EOD",
      detail: `${tradingWindowEndClockLabel} local · ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)}`,
      percent: tradingWindowEndPercent,
      align: "end",
    },
  ];
  const refreshCalendarTimeline = useEffectEvent(async () => {
    if (
      !calendarSessionCanRefresh ||
      !googleCalendarSession.accessToken ||
      selectedGoogleCalendars.length === 0
    ) {
      return;
    }

    const calendarsToRefresh = selectedGoogleCalendars;
    setCalendarLoading(true);
    setCalendarError("");
    try {
      const refreshedEvents = (
        await Promise.all(
          calendarsToRefresh.map(async (calendar) =>
            scopeGoogleCalendarEventsForHome({
              calendar,
              calendarCount: calendarsToRefresh.length,
              events: await loadUpcomingGoogleCalendarEvents(
                googleCalendarSession.accessToken ?? "",
                calendar.id,
                {
                  now: currentTime,
                  days: 31,
                  maxResults: 48,
                },
              ),
            }),
          ),
        )
      ).flat();
      saveGoogleCalendarEventCache({
        selectedCalendarSummary:
          formatGoogleCalendarSelectionSummary(calendarsToRefresh),
        events: refreshedEvents,
        cachedAt: new Date().toISOString(),
      });
    } catch (error) {
      setCalendarError(
        error instanceof Error
          ? error.message
          : "Could not refresh Google Calendar events for Home.",
      );
    } finally {
      setCalendarLoading(false);
    }
  });

  useEffect(() => {
    if (!calendarSessionCanRefresh || !googleCalendarSession.accessToken) {
      return;
    }

    void refreshCalendarTimeline();
  }, [
    calendarSessionCanRefresh,
    calendarRefreshKey,
    googleCalendarSession.accessToken,
    googleCalendarSession.accessTokenExpiresAt,
    selectedGoogleCalendarSignature,
  ]);

  async function loadCalendarSettingsSnapshot() {
    if (!googleCalendarSession.accessToken || !calendarSessionTokenIsUsable) {
      setAvailableGoogleCalendars([]);
      setCalendarSettingsError(
        googleCalendarSession.scopeGranted
          ? "Reconnect Google Calendar in Settings before adding calendars."
          : "Connect Google Calendar in Settings before adding calendars.",
      );
      return;
    }

    setCalendarSettingsLoading(true);
    setCalendarSettingsError("");
    try {
      const calendars = await loadGoogleCalendars(googleCalendarSession.accessToken);
      setAvailableGoogleCalendars(calendars);
    } catch (error) {
      setCalendarSettingsError(
        error instanceof Error
          ? error.message
          : "Could not load Google Calendar sources.",
      );
    } finally {
      setCalendarSettingsLoading(false);
    }
  }

  function handleOpenCalendarSettings() {
    setCalendarSettingsOpen(true);
    void loadCalendarSettingsSnapshot();
  }

  function handleCloseCalendarSettings() {
    setCalendarSettingsOpen(false);
  }

  function handleAddGoogleCalendar(calendar: GoogleCalendarListEntry) {
    const nextSelections = [
      ...selectedGoogleCalendars,
      {
        id: calendar.id,
        summary: calendar.summary,
      },
    ];
    saveGoogleCalendarSelectedCalendars(nextSelections);
    clearGoogleCalendarHomeEventCache(nextSelections);
  }

  function handleRemoveGoogleCalendar(calendarId: string) {
    const nextSelections = selectedGoogleCalendars.filter(
      (calendar) => calendar.id !== calendarId,
    );
    saveGoogleCalendarSelectedCalendars(nextSelections);
    clearGoogleCalendarHomeEventCache(nextSelections);
  }

  const calendarAgendaItems = useMemo(
    () =>
      hasCalendarTimelineEnabled
        ? buildPromptHomeCalendarAgendaItems({
            events: googleCalendarSession.cachedEvents,
            currentTime,
            timeZone: resolvedTimeZone,
          })
        : [],
    [
      currentTime,
      googleCalendarSession.cachedEvents,
      hasCalendarTimelineEnabled,
      resolvedTimeZone,
    ],
  );
  const dayCalendarItems = useMemo(
    () =>
      calendarAgendaItems.filter(
        (item) =>
          promptHomeCalendarDayKey(item.year, item.month, item.day) ===
          currentDayKey,
      ),
    [calendarAgendaItems, currentDayKey],
  );
  const weekCalendarItems = useMemo(
    () =>
      calendarAgendaItems.filter((item) => {
        const itemDayKey = promptHomeCalendarDayKey(
          item.year,
          item.month,
          item.day,
        );
        return (
          itemDayKey >= currentWeekStartDayKey &&
          itemDayKey <= currentWeekEndDayKey
        );
      }),
    [calendarAgendaItems, currentWeekEndDayKey, currentWeekStartDayKey],
  );
  const monthCalendarItems = useMemo(
    () =>
      calendarAgendaItems.filter(
        (item) =>
          item.year === zonedDateParts.year &&
          item.month === zonedDateParts.month,
      ),
    [calendarAgendaItems, zonedDateParts.month, zonedDateParts.year],
  );
  const dayCalendarItemsVisible = dayCalendarToggleState.enabled
    ? dayCalendarItems
    : [];
  const weekCalendarItemsVisible = weekCalendarToggleState.enabled
    ? weekCalendarItems
    : [];
  const monthCalendarItemsVisible = monthCalendarToggleState.enabled
    ? monthCalendarItems
    : [];
  const dayCalendarAgendaItemsVisible = dayCalendarItemsVisible.filter(
    (item) => !item.hasEnded,
  );
  const weekCalendarAgendaItemsVisible = weekCalendarItemsVisible.filter(
    (item) => !item.hasEnded,
  );
  const monthCalendarAgendaItemsVisible = monthCalendarItemsVisible.filter(
    (item) => !item.hasEnded,
  );
  const calendarAgendaSummary = formatPromptHomeCalendarAgendaSummary({
    calendarSession: googleCalendarSession,
    loading: calendarLoading && googleCalendarSession.cachedEvents.length === 0,
    error:
      googleCalendarSession.cachedEvents.length === 0 ? calendarError : "",
  });
  const calendarConnectionMessage = googleCalendarSession.scopeGranted
    ? "Reconnect Google Calendar in Settings to refresh schedule events here."
    : "Connect Google Calendar in Settings to overlay schedule events here.";
  const dayCalendarSummary =
    dayCalendarItemsVisible.length > 0
      ? `${calendarAgendaSummary} · ${formatCalendarEventCountLabel(
          dayCalendarItemsVisible.length,
        )} today`
      : calendarAgendaSummary;
  const weekCalendarSummary =
    weekCalendarItemsVisible.length > 0
      ? `${calendarAgendaSummary} · ${formatCalendarEventCountLabel(
          weekCalendarItemsVisible.length,
        )} this week`
      : calendarAgendaSummary;
  const monthCalendarSummary =
    monthCalendarItemsVisible.length > 0
      ? `${calendarAgendaSummary} · ${formatCalendarEventCountLabel(
          monthCalendarItemsVisible.length,
        )} this month`
      : calendarAgendaSummary;
  const dayCollapsedSummary = `${`Desk window ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)} to ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)}`} · EOD ${tradingWindowEndClockLabel} local${dayCalendarItemsVisible.length > 0 ? ` · ${formatCalendarEventCountLabel(dayCalendarItemsVisible.length)}` : dayCalendarToggleState.enabled ? "" : " · Google Calendar hidden in Settings"}`;
  const weekCollapsedSummary = `Sunday through Saturday · Week progress ${Math.round(currentWeekPercent)}%${weekCalendarItemsVisible.length > 0 ? ` · ${formatCalendarEventCountLabel(weekCalendarItemsVisible.length)}` : weekCalendarToggleState.enabled ? "" : " · Google Calendar hidden in Settings"}`;
  const monthCollapsedSummary = `1 through EOM · ${monthDayTotal} days this month${monthCalendarItemsVisible.length > 0 ? ` · ${formatCalendarEventCountLabel(monthCalendarItemsVisible.length)}` : monthCalendarToggleState.enabled ? "" : " · Google Calendar hidden in Settings"}`;
  const dayMeterMarkers = dayCalendarToggleState.enabled
    ? [...tradingMarkers, ...buildPromptHomeCalendarDayMarkers(dayCalendarItems)]
    : tradingMarkers;
  const weekMeterMarkers = weekCalendarToggleState.enabled
    ? buildPromptHomeCalendarWeekMarkers(weekCalendarItems)
    : [];
  const monthMeterMarkers = monthCalendarToggleState.enabled
    ? buildPromptHomeCalendarMonthMarkers({
        items: monthCalendarItems,
        monthDayTotal,
      })
    : [];
  const { dragHandleAttributes, dragHandleClassName } =
    usePromptHomeCardHeaderDragProps<HTMLDivElement>();
  const selectedGoogleCalendarIds = new Set(
    selectedGoogleCalendars.map((calendar) => calendar.id),
  );
  const selectedCalendarCountLabel = `${selectedGoogleCalendars.length} ${
    selectedGoogleCalendars.length === 1 ? "calendar" : "calendars"
  } active`;
  const availableCalendarCountLabel = calendarSettingsLoading
    ? "Loading calendars"
    : `${availableGoogleCalendars.length} available`;

  return (
    <section
      className={`prompt-home-calendar-card ${timeframeExpandedState.expanded ? "is-expanded" : "is-collapsed"}`}
    >
      <div
        {...dragHandleAttributes}
        className={mergePromptHomeClassNames(
          "prompt-home-calendar-card-head",
          dragHandleClassName,
        )}
      >
        <div className="prompt-home-calendar-card-toggle">
          <div className="prompt-home-calendar-card-copy">
            <span className="eyebrow">Calendar</span>
            <strong className="prompt-home-calendar-card-summary">
              {calendarCollapsedSummary}
            </strong>
          </div>
        </div>

        <div className="prompt-home-calendar-card-side">
          <button
            type="button"
            className="prompt-home-calendar-card-toggle-action"
            aria-label={
              timeframeExpandedState.expanded
                ? "Collapse Calendar"
                : "Expand Calendar"
            }
            aria-expanded={timeframeExpandedState.expanded}
            aria-controls={timeframePanelId}
            onClick={() =>
              timeframeExpandedState.setExpanded((current) => !current)
            }
          >
            <div className="prompt-home-calendar-card-toggle-meta">
              <span
                className="prompt-home-support-toggle-indicator"
                aria-hidden="true"
              >
                {timeframeExpandedState.expanded ? "−" : "+"}
              </span>
            </div>
          </button>
        </div>
      </div>

      <div
        id={timeframePanelId}
        className="prompt-home-calendar-card-body"
        hidden={!timeframeExpandedState.expanded}
      >
        <div className="prompt-home-calendar-card-actions">
          <button
            type="button"
            className="button button-secondary prompt-home-calendar-card-link"
            aria-controls={calendarSettingsDialogId}
            aria-expanded={calendarSettingsOpen}
            onClick={handleOpenCalendarSettings}
          >
            Settings
          </button>
          <a
            href={customEventsHref}
            className="button button-secondary prompt-home-calendar-card-link"
            onClick={(event) => {
              if (!onOpenCustomEvents) {
                return;
              }
              event.preventDefault();
              onOpenCustomEvents();
            }}
          >
            Add Event
          </a>
        </div>
        {calendarSettingsOpen ? (
          <div
            className="prompt-home-calendar-settings-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                handleCloseCalendarSettings();
              }
            }}
          >
            <section
              id={calendarSettingsDialogId}
              className="prompt-home-calendar-settings-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby={calendarSettingsDialogTitleId}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  handleCloseCalendarSettings();
                }
              }}
            >
              <header className="prompt-home-calendar-settings-head">
                <div>
                  <span className="eyebrow">Calendar</span>
                  <h3 id={calendarSettingsDialogTitleId}>Calendar Settings</h3>
                  <p>
                    {selectedCalendarCountLabel} · {availableCalendarCountLabel}
                  </p>
                </div>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={handleCloseCalendarSettings}
                >
                  Close
                </button>
              </header>

              <div className="prompt-home-calendar-settings-body">
                <section className="prompt-home-calendar-settings-section">
                  <div className="prompt-home-calendar-settings-section-head">
                    <strong>Active calendars</strong>
                    <span>{selectedCalendarCountLabel}</span>
                  </div>
                  {selectedGoogleCalendars.length > 0 ? (
                    <div className="prompt-home-calendar-source-list">
                      {selectedGoogleCalendars.map((calendar) => (
                        <article
                          key={calendar.id}
                          className="prompt-home-calendar-source-row"
                        >
                          <div className="prompt-home-calendar-source-copy">
                            <strong>{calendar.summary ?? calendar.id}</strong>
                            <span>{calendar.id}</span>
                          </div>
                          <button
                            type="button"
                            className="button button-ghost"
                            onClick={() => handleRemoveGoogleCalendar(calendar.id)}
                          >
                            Remove
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="prompt-home-calendar-settings-note">
                      No calendars are active for Home.
                    </p>
                  )}
                </section>

                <section className="prompt-home-calendar-settings-section">
                  <div className="prompt-home-calendar-settings-section-head">
                    <strong>Available Google calendars</strong>
                    <span>{availableCalendarCountLabel}</span>
                  </div>
                  {calendarSettingsError ? (
                    <p className="prompt-home-calendar-settings-note is-error">
                      {calendarSettingsError}
                    </p>
                  ) : null}
                  {calendarSettingsLoading ? (
                    <p className="prompt-home-calendar-settings-note">
                      Loading calendar sources...
                    </p>
                  ) : availableGoogleCalendars.length > 0 ? (
                    <div className="prompt-home-calendar-source-list">
                      {availableGoogleCalendars.map((calendar) => {
                        const selected = selectedGoogleCalendarIds.has(
                          calendar.id,
                        );
                        return (
                          <article
                            key={calendar.id}
                            className="prompt-home-calendar-source-row"
                          >
                            <div className="prompt-home-calendar-source-copy">
                              <strong>
                                {calendar.primary
                                  ? `${calendar.summary} (Primary)`
                                  : calendar.summary}
                              </strong>
                              <span>
                                {[calendar.accessRole, calendar.timeZone]
                                  .filter(Boolean)
                                  .join(" · ") || calendar.id}
                              </span>
                            </div>
                            {selected ? (
                              <button
                                type="button"
                                className="button button-ghost"
                                onClick={() =>
                                  handleRemoveGoogleCalendar(calendar.id)
                                }
                              >
                                Remove
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => handleAddGoogleCalendar(calendar)}
                              >
                                Add
                              </button>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="prompt-home-calendar-settings-note">
                      No Google calendars are loaded.
                    </p>
                  )}
                </section>
              </div>

              <footer className="prompt-home-calendar-settings-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleCloseCalendarSettings}
                >
                  Done
                </button>
              </footer>
            </section>
          </div>
        ) : null}
        <div className="prompt-home-timeframe-grid">
          <PromptHomeTimeMeterCard
            panelId={dayPanelId}
            eyebrow="Day"
            title={`${currentClockLabel} local`}
            detail={`Hour-ending day with the desk window and desk EOD at ${tradingWindowEndClockLabel} local.`}
            badge={currentHourEndingLabel}
            meta={`Desk window ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)} to ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)} · EOD ${tradingWindowEndClockLabel} local · ${dayCalendarToggleState.enabled ? dayCalendarItemsVisible.length > 0 ? formatCalendarEventCountLabel(dayCalendarItemsVisible.length) : "No calendar events scheduled today" : "Google Calendar hidden in Settings for this app"}`}
            collapsedSummary={dayCollapsedSummary}
            ticks={dayTicks}
            markers={dayMeterMarkers}
            currentPercent={currentDayPercent}
            highlightedWindowStartPercent={tradingWindowStartPercent}
            highlightedWindowWidthPercent={tradingWindowWidthPercent}
            ariaLabel={`Day meter in ${resolvedTimeZone}. Current local time ${currentClockLabel}, ${currentHourEndingLabel}. Desk trading hours run from ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_START_HOUR_ENDING)} to ${formatHourEndingLabel(PROMPT_HOME_TRADING_WINDOW_END_HOUR_ENDING)}, with desk EOD at ${tradingWindowEndClockLabel} local.`}
            expanded={dayCardExpandedState.expanded}
            onToggle={() =>
              dayCardExpandedState.setExpanded((current) => !current)
            }
          >
            {dayCalendarToggleState.enabled ? (
              <PromptHomeCalendarAgendaSection
                sectionKey="day"
                title="Calendar agenda"
                summary={dayCalendarSummary}
                items={dayCalendarAgendaItemsVisible}
                emptyMessage={
                  googleCalendarSession.cachedEvents.length > 0 ||
                  googleCalendarSession.scopeGranted
                    ? dayCalendarItemsVisible.length > 0
                      ? "Past calendar events remain on today's timeline, but no upcoming event details are shown."
                      : "No calendar events are scheduled on today's timeline."
                    : calendarConnectionMessage
                }
              />
            ) : null}
          </PromptHomeTimeMeterCard>
          <PromptHomeTimeMeterCard
            panelId={weekPanelId}
            eyebrow="Week"
            title={currentWeekdayLabel}
            detail="Sunday through Saturday."
            badge={currentMonthDayLabel}
            meta={`Week progress ${Math.round(currentWeekPercent)}% · ${weekCalendarToggleState.enabled ? weekCalendarItemsVisible.length > 0 ? formatCalendarEventCountLabel(weekCalendarItemsVisible.length) : "No calendar events scheduled this week" : "Google Calendar hidden in Settings for this app"}`}
            collapsedSummary={weekCollapsedSummary}
            ticks={weekTicks}
            markers={weekMeterMarkers}
            currentPercent={currentWeekPercent}
            ariaLabel={`Week meter in ${resolvedTimeZone}. Current day ${currentWeekdayLabel}. The week runs from Sunday through Saturday.`}
            expanded={weekCardExpandedState.expanded}
            onToggle={() =>
              weekCardExpandedState.setExpanded((current) => !current)
            }
          >
            {weekCalendarToggleState.enabled ? (
              <PromptHomeCalendarAgendaSection
                sectionKey="week"
                title="This week"
                summary={weekCalendarSummary}
                items={weekCalendarAgendaItemsVisible}
                emptyMessage={
                  googleCalendarSession.cachedEvents.length > 0 ||
                  googleCalendarSession.scopeGranted
                    ? weekCalendarItemsVisible.length > 0
                      ? "Past calendar events remain on this week's timeline, but no upcoming event details are shown."
                      : "No calendar events are scheduled in this week view."
                    : calendarConnectionMessage
                }
              />
            ) : null}
          </PromptHomeTimeMeterCard>
          <PromptHomeTimeMeterCard
            panelId={monthPanelId}
            eyebrow="Month"
            title={currentMonthLabel}
            detail="1 through EOM."
            badge={`Day ${formatOrdinal(zonedDateParts.day)}`}
            meta={`${monthDayTotal} days this month · ${monthCalendarToggleState.enabled ? monthCalendarItemsVisible.length > 0 ? formatCalendarEventCountLabel(monthCalendarItemsVisible.length) : "No calendar events scheduled this month" : "Google Calendar hidden in Settings for this app"}`}
            collapsedSummary={monthCollapsedSummary}
            ticks={monthTicks}
            markers={monthMeterMarkers}
            currentPercent={currentMonthPercent}
            ariaLabel={`Month meter in ${resolvedTimeZone}. Today is day ${zonedDateParts.day} of ${monthDayTotal}. The month runs from 1 through end of month.`}
            expanded={monthCardExpandedState.expanded}
            onToggle={() =>
              monthCardExpandedState.setExpanded((current) => !current)
            }
          >
            {monthCalendarToggleState.enabled ? (
              <PromptHomeCalendarAgendaSection
                sectionKey="month"
                title="This month"
                summary={monthCalendarSummary}
                items={monthCalendarAgendaItemsVisible}
                emptyMessage={
                  googleCalendarSession.cachedEvents.length > 0 ||
                  googleCalendarSession.scopeGranted
                    ? monthCalendarItemsVisible.length > 0
                      ? "Past calendar events remain on this month's timeline, but no upcoming event details are shown."
                      : "No calendar events are scheduled in this month view."
                    : calendarConnectionMessage
                }
              />
            ) : null}
          </PromptHomeTimeMeterCard>
        </div>
      </div>
    </section>
  );
}

export function PromptHomeWorkspace({
  authSession,
  health,
  counts,
  priceIndices = [],
  assets = [],
  deliveries = [],
  locations = [],
  spatialFeatures = [],
  referenceDataLoaded = false,
  referenceDataLoading = false,
  onEnsureReferenceData,
  deliveriesDataLoaded = false,
  deliveriesDataLoading = false,
  deliveriesDataError = "",
  onEnsureDeliveriesData,
  onOpenView,
  customEventsHref = `/?view=settings#${SETTINGS_CUSTOM_EVENTS_CARD_ANCHOR_ID}`,
  onOpenCustomEvents,
  onRefreshData,
  initialMessages = [],
  initialMapAssetLayerVisible = true,
}: PromptHomeWorkspaceProps) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [timeDisplaySettings, setTimeDisplaySettings] =
    useState<TimeDisplaySettings>(() => getTimeDisplaySettingsSnapshot());
  const [runtimeSettings, setRuntimeSettings] =
    useState<AssistantRuntimeSettings | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [draft, setDraft] = useState("");
  const [verbalizeResponses, setVerbalizeResponses] = useState(false);
  const [draftApplicationContext, setDraftApplicationContext] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<AssistantPersona | "">("");
  const [draftSummaryTargets, setDraftSummaryTargets] = useState<
    AssistantWorkspaceSummaryTarget[]
  >([]);
  const [pendingVoicePlaybackMessage, setPendingVoicePlaybackMessage] =
    useState<{
      id: string;
      content: string;
    } | null>(null);
  const [messages, setMessages] = useState<PromptHomeMessage[]>(
    () => initialMessages,
  );
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [actionRequestIdsInFlight, setActionRequestIdsInFlight] = useState<
    number[]
  >([]);
  const [promptRouteRecommendations, setPromptRouteRecommendations] = useState<
    AssistantPromptRouteRecommendation[]
  >([]);
  const [
    promptRouteRecommendationsLoading,
    setPromptRouteRecommendationsLoading,
  ] = useState(false);
  const [promptRouteRecommendationsError, setPromptRouteRecommendationsError] =
    useState("");
  const [tradeAttentionCandidates, setTradeAttentionCandidates] = useState<
    TradeAttentionCandidateRecord[]
  >([]);
  const [invoiceIssueCandidates, setInvoiceIssueCandidates] = useState<
    InvoiceIssueCandidateRecord[]
  >([]);
  const [communicationSourceRecords, setCommunicationSourceRecords] = useState<
    MessagingWorkspaceConversationRecord[]
  >([]);
  const [communicationSourceLoading, setCommunicationSourceLoading] =
    useState(false);
  const [communicationSourceError, setCommunicationSourceError] = useState("");
  const cardVisibilityState = usePersistentPromptHomeCardVisibility({
    apiBase: appConfig.apiBase,
    authSession,
  });
  const communicationCardVisible =
    cardVisibilityState.isCardVisible("communication");
  const [homeViewNameDraft, setHomeViewNameDraft] = useState("");
  const [pasteTargetReady, setPasteTargetReady] = useState(false);
  const [homeCardDeleteDragging, setHomeCardDeleteDragging] = useState(false);
  const homeCardSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const cardFilterExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.card-filter",
    false,
  );
  const promptCardExpandedState = usePersistentCollapsibleCardState(
    "prompt-home.prompt-card",
    true,
  );
  const setPromptCardExpanded = promptCardExpandedState.setExpanded;
  const promptResumeIntent = useSyncExternalStore(
    subscribePromptResumeIntent,
    getPromptResumeIntent,
    () => null,
  );
  const consumedPromptResumeKeyRef = useRef<string | null>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const promptChatLogRef = useRef<HTMLDivElement | null>(null);
  const timeZoneOptions = useMemo(() => listTimeDisplayTimeZoneOptions(), []);

  useEffect(() => {
    setHomeViewNameDraft(
      cardVisibilityState.canRenameActiveHomeView
        ? cardVisibilityState.activeHomeViewName
        : "",
    );
  }, [
    cardVisibilityState.activeHomeViewName,
    cardVisibilityState.activeHomeViewValue,
    cardVisibilityState.canRenameActiveHomeView,
  ]);

  useEffect(() => {
    if (!cardVisibilityState.cardClipboard) {
      setPasteTargetReady(false);
    }
  }, [cardVisibilityState.cardClipboard]);

  useEffect(() => {
    if (
      !shouldAutoEnsurePromptHomeData({
        hasSession: Boolean(authSession),
        dataLoaded: referenceDataLoaded,
        dataLoading: referenceDataLoading,
        hasEnsureHandler: Boolean(onEnsureReferenceData),
      })
    ) {
      return;
    }

    if (!onEnsureReferenceData) {
      return;
    }

    void onEnsureReferenceData().catch(() => undefined);
  }, [
    authSession,
    onEnsureReferenceData,
    referenceDataLoaded,
    referenceDataLoading,
  ]);

  useEffect(() => {
    if (
      !shouldAutoEnsurePromptHomeData({
        hasSession: Boolean(authSession),
        dataLoaded: deliveriesDataLoaded,
        dataLoading: deliveriesDataLoading,
        dataError: deliveriesDataError,
        hasEnsureHandler: Boolean(onEnsureDeliveriesData),
      })
    ) {
      return;
    }

    if (!onEnsureDeliveriesData) {
      return;
    }

    void onEnsureDeliveriesData().catch(() => undefined);
  }, [
    authSession,
    deliveriesDataError,
    deliveriesDataLoaded,
    deliveriesDataLoading,
    onEnsureDeliveriesData,
  ]);

  const refreshCommunicationSourceMessages = useCallback(async () => {
    if (!communicationCardVisible) {
      setCommunicationSourceRecords([]);
      setCommunicationSourceLoading(false);
      setCommunicationSourceError("");
      return;
    }

    setCommunicationSourceLoading(true);

    try {
      const state = await loadMessagingWorkspaceState(appConfig.apiBase, {
        accessToken: authSession?.accessToken,
      });
      setCommunicationSourceRecords(state.conversations);
      setCommunicationSourceError("");
    } catch (error) {
      setCommunicationSourceRecords([]);
      setCommunicationSourceError(
        error instanceof Error
          ? error.message
          : "Could not load synced message sources.",
      );
    } finally {
      setCommunicationSourceLoading(false);
    }
  }, [authSession?.accessToken, communicationCardVisible]);

  useEffect(() => {
    void refreshCommunicationSourceMessages();
  }, [refreshCommunicationSourceMessages]);

  useEffect(() => {
    let timeoutId: number | null = null;

    const scheduleNextClockRefresh = (now: Date) => {
      timeoutId = window.setTimeout(() => {
        syncClockToCurrentMinute();
      }, getPromptHomeNextClockTickDelay(now));
    };

    const syncClockToCurrentMinute = () => {
      const now = new Date();
      setCurrentTime(now);
      scheduleNextClockRefresh(now);
    };

    const resyncClock = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      syncClockToCurrentMinute();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resyncClock();
      }
    };

    scheduleNextClockRefresh(new Date());
    window.addEventListener("focus", resyncClock);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener("focus", resyncClock);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const operatorContext = useMemo(
    () =>
      buildPromptHomeContext({
        health,
        counts,
        displayName: authSession?.user.display_name ?? "Signed-out user",
      }),
    [authSession?.user.display_name, counts, health],
  );
  const promotedRoutes = useMemo(
    () =>
      buildPromptHomePromotedRoutes({
        recommendations: promptRouteRecommendations,
        tradeAttentionCandidates,
        invoiceIssueCandidates,
      }),
    [
      invoiceIssueCandidates,
      promptRouteRecommendations,
      tradeAttentionCandidates,
    ],
  );
  const communicationSourceMessages = useMemo(
    () => buildSlackMessagingInboxMessages(communicationSourceRecords),
    [communicationSourceRecords],
  );
  const displayedMessages = useMemo(() => messages, [messages]);

  useEffect(() => {
    const chatLog = promptChatLogRef.current;
    if (!chatLog) {
      return;
    }

    chatLog.scrollTop = chatLog.scrollHeight;
  }, [displayedMessages]);

  const resolvePromptMessageAuthorLabel = useCallback(
    (message: PromptHomeMessage): string =>
      message.role === "assistant"
        ? message.agentName?.trim() || "Assistant"
        : authSession?.user.display_name?.trim() || "You",
    [authSession?.user.display_name],
  );

  const resolvePromptMessageAvatarLabel = useCallback(
    (message: PromptHomeMessage): string =>
      buildMessageInitials(
        resolvePromptMessageAuthorLabel(message),
        message.role === "assistant" ? "AI" : "YU",
      ),
    [resolvePromptMessageAuthorLabel],
  );

  const recordPromptNavigationOutcome = useCallback(
    (
      runId: number | null | undefined,
      payload: {
        outcome: "ACCEPTED" | "DISMISSED" | "FAILED";
        intentKey: string;
        targetView?: ViewKey;
        targetLabel?: string;
        targetRationale?: string;
        focusType?: AssistantPromptNavigationFocusType;
        focusId?: string;
        focusLabel?: string;
        detail?: string;
      },
    ) => {
      if (!authSession) {
        return;
      }

      void submitAssistantPromptNavigationOutcome(
        appConfig.apiBase,
        runId,
        payload,
        { accessToken: authSession.accessToken },
      ).catch(() => undefined);
    },
    [authSession],
  );

  const refreshPromptRouteRecommendations = useCallback(async () => {
    if (!authSession) {
      setPromptRouteRecommendations([]);
      setPromptRouteRecommendationsError("");
      return;
    }

    setPromptRouteRecommendationsLoading(true);
    setPromptRouteRecommendationsError("");
    try {
      const recommendations = await listAssistantPromptRouteRecommendations(
        appConfig.apiBase,
        {
          accessToken: authSession.accessToken,
        },
      );
      setPromptRouteRecommendations(recommendations);
    } catch (error) {
      setPromptRouteRecommendations([]);
      setPromptRouteRecommendationsError(
        error instanceof Error
          ? error.message
          : "Could not load promoted prompt routes.",
      );
    } finally {
      setPromptRouteRecommendationsLoading(false);
    }
  }, [authSession]);

  useEffect(() => {
    void refreshPromptRouteRecommendations();
  }, [refreshPromptRouteRecommendations]);

  useEffect(() => {
    if (!authSession || promptRouteRecommendations.length === 0) {
      setTradeAttentionCandidates([]);
      setInvoiceIssueCandidates([]);
      return;
    }

    const readHeaders = new Headers({
      Authorization: `Bearer ${authSession.accessToken}`,
    });
    void Promise.allSettled([
      loadTradeAttentionCandidates(
        appConfig.apiBase,
        { limit: 6 },
        { readHeaders },
      ),
      loadInvoiceIssueCandidates(
        appConfig.apiBase,
        { readyOnly: true, limit: 6 },
        { readHeaders },
      ),
    ]).then((results) => {
      const [tradeCandidatesResult, invoiceCandidatesResult] = results;
      if (tradeCandidatesResult.status === "fulfilled") {
        setTradeAttentionCandidates(tradeCandidatesResult.value.items);
      } else {
        setTradeAttentionCandidates([]);
      }

      if (invoiceCandidatesResult.status === "fulfilled") {
        setInvoiceIssueCandidates(invoiceCandidatesResult.value.items);
      } else {
        setInvoiceIssueCandidates([]);
      }
    });
  }, [authSession, promptRouteRecommendations]);

  const loadRuntimeSettings = useCallback(async (): Promise<AssistantRuntimeSettings> => {
    if (runtimeSettings) {
      return runtimeSettings;
    }

    try {
      const payload = await loadAssistantRuntimeSettings(appConfig.apiBase);
      setRuntimeSettings(payload);
      setRuntimeError("");
      return payload;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not load assistant runtime.";
      setRuntimeError(message);
      throw new Error(message);
    }
  }, [runtimeSettings]);

  const transcribeVoiceNote = useCallback(
    async (audioFile: File) => {
      if (!authSession) {
        throw new Error("Sign in to use recorded voice transcription.");
      }

      const runtime = await loadRuntimeSettings();
      if (!runtime.voice_transcription?.enabled) {
        throw new Error("Backend voice transcription is not configured on this API.");
      }

      const transcript = await transcribeAssistantVoice(appConfig.apiBase, audioFile, {
        accessToken: authSession.accessToken,
        filename: audioFile.name,
      });
      return transcript.text;
    },
    [authSession, loadRuntimeSettings],
  );
  const voiceTranscriptionSettings = runtimeSettings?.voice_transcription;
  const voiceGenerationSettings = runtimeSettings?.voice_generation;
  const synthesizeVoicePlayback = useCallback(
    async (text: string) => {
      if (!authSession) {
        throw new Error("Sign in to use generated voice playback.");
      }

      return synthesizeAssistantVoice(appConfig.apiBase, text, {
        accessToken: authSession.accessToken,
      });
    },
    [authSession],
  );

  const voiceComposer = useVoiceComposer({
    draft,
    onDraftChange: setDraft,
    backendTranscription: {
      enabled: Boolean(authSession && voiceTranscriptionSettings?.enabled),
      supportedContentTypes:
        voiceTranscriptionSettings?.supported_content_types ?? [],
      transcribeAudio: transcribeVoiceNote,
      unavailableMessage: !authSession
        ? "Sign in to use recorded voice transcription when browser dictation is unavailable."
        : runtimeSettings
          ? voiceTranscriptionSettings?.enabled
            ? ""
            : "Backend voice transcription is not configured on this API."
          : "Checking whether backend voice transcription is available.",
    },
  });
  const voicePlayback = useVoicePlayback({
    backendSynthesis: {
      enabled: Boolean(authSession && voiceGenerationSettings?.enabled),
      synthesizeAudio: synthesizeVoicePlayback,
    },
  });

  useEffect(() => {
    if (!voicePlayback.activePlaybackId) {
      return;
    }

    if (
      displayedMessages.some(
        (message) => message.id === voicePlayback.activePlaybackId,
      )
    ) {
      return;
    }

    voicePlayback.stopPlayback();
  }, [displayedMessages, voicePlayback]);

  useEffect(() => {
    if (!pendingVoicePlaybackMessage) {
      return;
    }

    if (!messages.some((message) => message.id === pendingVoicePlaybackMessage.id)) {
      return;
    }

    setPendingVoicePlaybackMessage(null);
    if (
      !verbalizeResponses ||
      !voicePlayback.supported ||
      !voicePlayback.canPlay(pendingVoicePlaybackMessage.content)
    ) {
      return;
    }

    voiceComposer.cancelListening();
    voicePlayback.togglePlayback(
      pendingVoicePlaybackMessage.id,
      pendingVoicePlaybackMessage.content,
    );
  }, [
    messages,
    pendingVoicePlaybackMessage,
    verbalizeResponses,
    voiceComposer,
    voicePlayback,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(PROMPT_HOME_VERBALIZE_STORAGE_KEY);
  }, []);

  useEffect(() => {
    if (!authSession || runtimeSettings) {
      return;
    }

    void loadRuntimeSettings().catch(() => undefined);
  }, [authSession, loadRuntimeSettings, runtimeSettings]);

  async function submitPrompt(
    prompt: string,
    summaryTargets: AssistantWorkspaceSummaryTarget[] = [],
    applicationContext?: string,
  ) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || !authSession || submitting) {
      return;
    }

    const userMessage: PromptHomeMessage = {
      id: createPromptMessageId(),
      role: "user",
      content: trimmedPrompt,
      recordedAt: new Date().toISOString(),
    };
    const assistantMessageId = createPromptMessageId();
    const assistantPlaceholder: PromptHomeMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      recordedAt: new Date().toISOString(),
      activity: buildInitialAssistantActivity(),
      activityState: "active",
      activityLabel: "Preparing context",
    };
    const promptMessages = [...messages, userMessage];
    const nextMessages = [...promptMessages, assistantPlaceholder];

    setMessages(nextMessages);
    setDraft("");
    setSubmitError("");
    setSubmitting(true);
    setPendingVoicePlaybackMessage(null);

    try {
      const settings = await loadRuntimeSettings();
      if (!settings.enabled) {
        throw new Error(
          "No configured assistant provider is currently ready on the API.",
        );
      }

      const provider = resolveDefaultProvider(settings);
      const providerDetails = settings.providers.find(
        (entry) => entry.provider === provider,
      );
      if (!provider || !providerDetails?.enabled) {
        throw new Error(
          "No enabled assistant provider is available for the operator prompt.",
        );
      }

      setMessages((current) =>
        updatePromptMessage(current, assistantMessageId, (message) => ({
          ...message,
          activity: buildRunningAssistantActivity(),
          activityLabel: "Checking context",
        })),
      );

      let completedResponse: AssistantPromptResponse | null = null;
      await streamAssistantResponse(
        appConfig.apiBase,
        {
          conversation_id: conversationId ?? undefined,
          provider,
          workspace: "assistant",
          persona: selectedPersona || undefined,
          context: mergePromptContexts(operatorContext, applicationContext),
          summary_targets: summaryTargets,
          use_live_tools: true,
          messages: promptMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
        },
        {
          accessToken: authSession.accessToken,
          onEvent: (event) => {
            if (event.event === "status") {
              setMessages((current) =>
                updatePromptMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  activity: buildRunningAssistantActivity(),
                  activityLabel: "Working",
                })),
              );
              return;
            }

            if (event.event === "conversation") {
              const nextConversationId = event.data.conversation_id;
              if (
                typeof nextConversationId === "number" &&
                Number.isFinite(nextConversationId)
              ) {
                setConversationId(nextConversationId);
              }
              return;
            }

            if (event.event === "assistant.metadata") {
              const metadata = event.data as Partial<AssistantPromptResponse>;
              setMessages((current) =>
                updatePromptMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  provider: metadata.provider ?? message.provider,
                  model: metadata.model ?? message.model,
                  agentName: metadata.agent_name ?? message.agentName,
                  runId: metadata.run_id ?? message.runId,
                  warnings: metadata.warnings ?? message.warnings,
                  actionRequests:
                    metadata.action_requests ?? message.actionRequests,
                  toolCalls: metadata.tool_calls ?? message.toolCalls,
                  activity: buildStreamingAssistantActivity(),
                  activityLabel: "Writing",
                })),
              );
              return;
            }

            if (event.event === "assistant.delta") {
              const delta =
                typeof event.data.delta === "string"
                  ? event.data.delta
                  : typeof event.data.chunk === "string"
                    ? event.data.chunk
                    : "";
              if (!delta) {
                return;
              }

              setMessages((current) =>
                updatePromptMessage(current, assistantMessageId, (message) => ({
                  ...message,
                  content: `${message.content}${delta}`,
                  activity: buildStreamingAssistantActivity(),
                  activityLabel: "Writing",
                })),
              );
              return;
            }

            if (event.event !== "assistant.complete") {
              return;
            }

            const response = event.data as AssistantPromptResponse;
            if (response.message?.role !== "assistant") {
              return;
            }

            completedResponse = response;
            const responseConversationId =
              response.conversation_id ?? conversationId;
            const parsedResponse =
              parsePromptNavigationIntentsFromAssistantContent(
                response.message.content,
                {
                  sourceRunId: response.run_id,
                  sourceConversationId: responseConversationId,
                },
              );
            const responseContent =
              parsedResponse.intents.length > 0 ||
              parsedResponse.warnings.length > 0
                ? parsedResponse.content
                : parsedResponse.content || response.message.content;

            if (
              parsedResponse.warnings.includes(
                INVALID_PROMPT_NAVIGATION_WARNING,
              )
            ) {
              recordPromptNavigationOutcome(response.run_id, {
                outcome: "FAILED",
                intentKey: "invalid_navigation_payload",
                detail: INVALID_PROMPT_NAVIGATION_WARNING,
              });
            }

            const assistantMessage: PromptHomeMessage = {
              id: assistantMessageId,
              role: "assistant",
              content: responseContent,
              recordedAt:
                response.run_recorded_at ?? assistantPlaceholder.recordedAt,
              provider: response.provider,
              model: response.model,
              agentName: response.agent_name,
              runId: response.run_id,
              warnings: [...response.warnings, ...parsedResponse.warnings],
              actionRequests: response.action_requests,
              navigationIntents: parsedResponse.intents,
              toolCalls: response.tool_calls,
              activity: buildCompletedAssistantActivity(response.tool_calls),
              activityState: "complete",
              activityLabel: "Ready",
            };

            setConversationId(responseConversationId);
            setDraftApplicationContext("");
            setDraftSummaryTargets([]);
            setMessages((current) =>
              updatePromptMessage(
                current,
                assistantMessageId,
                () => assistantMessage,
              ),
            );
            setPendingVoicePlaybackMessage(
              verbalizeResponses ? assistantMessage : null,
            );
          },
        },
      );

      if (!completedResponse) {
        throw new Error("Assistant stream ended before a response was ready.");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Assistant request failed.";
      setPendingVoicePlaybackMessage(null);
      setMessages((current) =>
        updatePromptMessage(current, assistantMessageId, (promptMessage) => ({
          ...promptMessage,
          activity: buildErroredAssistantActivity(message),
          activityState: "error",
          activityLabel: "Stopped",
        })),
      );
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const submitResumedPrompt = useEffectEvent(
    (
      prompt: string,
      summaryTargets: AssistantWorkspaceSummaryTarget[] = [],
      applicationContext?: string,
    ) => {
      void submitPrompt(prompt, summaryTargets, applicationContext);
    },
  );

  useEffect(() => {
    if (!authSession || !promptResumeIntent) {
      return;
    }

    const resumeKey = `${promptResumeIntent.createdAt}:${promptResumeIntent.draft}`;
    if (consumedPromptResumeKeyRef.current === resumeKey) {
      return;
    }

    consumedPromptResumeKeyRef.current = resumeKey;
    clearPromptResumeIntent();
    setPromptCardExpanded(true);
    setDraft(promptResumeIntent.draft);
    setDraftApplicationContext(promptResumeIntent.applicationContext ?? "");
    setDraftSummaryTargets(promptResumeIntent.summaryTargets ?? []);
    setSubmitError("");

    if (promptResumeIntent.submitAfterSignIn) {
      submitResumedPrompt(
        promptResumeIntent.draft,
        promptResumeIntent.summaryTargets ?? [],
        promptResumeIntent.applicationContext,
      );
    }
  }, [authSession, promptResumeIntent, setPromptCardExpanded]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    voicePlayback.stopPlayback();
    voiceComposer.cancelListening();
    if (!authSession) {
      const trimmedDraft = draft.trim();
      if (!trimmedDraft) {
        return;
      }

      savePromptResumeIntent({
        draft: trimmedDraft,
        applicationContext: draftApplicationContext,
        summaryTargets: draftSummaryTargets,
        submitAfterSignIn: true,
      });
      setSubmitError("");
      onOpenView("settings");
      return;
    }

    void submitPrompt(draft, draftSummaryTargets, draftApplicationContext);
  }

  function handlePromptComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (!shouldSubmitPromptHomeComposerKey(event)) {
      return;
    }

    event.preventDefault();
    if (!draft.trim() || submitting || voiceComposer.listening) {
      return;
    }

    event.currentTarget.form?.requestSubmit();
  }

  function handleSignIn() {
    const trimmedDraft = draft.trim();
    if (trimmedDraft) {
      savePromptResumeIntent({
        draft: trimmedDraft,
        applicationContext: draftApplicationContext,
        summaryTargets: draftSummaryTargets,
        submitAfterSignIn: false,
      });
    } else {
      savePromptSignInReturnIntent();
    }

    setSubmitError("");
    onOpenView("settings");
  }

  function openNavigationIntent(
    intent: PromptNavigationIntent,
    options: {
      includeHandoff?: boolean;
      recordOutcome?: boolean;
    } = {},
  ) {
    const normalizedIntent = normalizePromptNavigationIntent(intent);
    if (!normalizedIntent) {
      setSubmitError("That navigation suggestion is no longer available.");
      if (options.recordOutcome) {
        recordPromptNavigationOutcome(intent.sourceRunId, {
          outcome: "FAILED",
          intentKey: buildPromptNavigationIntentKey(intent),
          detail: "That navigation suggestion is no longer available.",
        });
      }
      return;
    }

    if (options.recordOutcome) {
      recordPromptNavigationOutcome(normalizedIntent.sourceRunId, {
        outcome: "ACCEPTED",
        intentKey: buildPromptNavigationIntentKey(normalizedIntent),
        targetView: normalizedIntent.targetView,
        targetLabel: promptNavigationIntentLabel(normalizedIntent),
        targetRationale: normalizedIntent.rationale,
        focusType: normalizedIntent.focus?.type,
        focusId: normalizedIntent.focus?.id,
        focusLabel: normalizedIntent.focus?.label,
      });
    }

    onOpenView(
      normalizedIntent.targetView,
      options.includeHandoff === false
        ? null
        : buildPromptNavigationRouteHandoff(normalizedIntent),
    );
  }

  function handleDismissNavigationIntent(
    messageId: string,
    intent: PromptNavigationIntent,
  ) {
    const intentKey = buildPromptNavigationIntentKey(intent);
    setMessages((current) =>
      removePromptNavigationIntent(current, { messageId, intentKey }),
    );
    recordPromptNavigationOutcome(intent.sourceRunId, {
      outcome: "DISMISSED",
      intentKey,
      targetView: intent.targetView,
      targetLabel: promptNavigationIntentLabel(intent),
      targetRationale: intent.rationale,
      focusType: intent.focus?.type,
      focusId: intent.focus?.id,
      focusLabel: intent.focus?.label,
    });
  }

  const handleActionRequestDecision = useCallback(
    async (
      actionRequestId: number,
      decision: "approve" | "reject",
      payload: AssistantActionDecisionPayload,
    ) => {
      setSubmitError("");
      setActionRequestIdsInFlight((current) =>
        current.includes(actionRequestId)
          ? current
          : [...current, actionRequestId],
      );

      try {
        const updatedActionRequest =
          decision === "approve"
            ? await approveAssistantActionRequest(
                appConfig.apiBase,
                actionRequestId,
                payload,
              )
            : await rejectAssistantActionRequest(
                appConfig.apiBase,
                actionRequestId,
                payload,
              );

        setMessages((current) =>
          replacePromptMessageActionRequest(current, updatedActionRequest),
        );

        if (
          (updatedActionRequest.status === "EXECUTED" ||
            updatedActionRequest.status === "FAILED") &&
          onRefreshData
        ) {
          await onRefreshData();
        }
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Could not update the governed action request.",
        );
      } finally {
        setActionRequestIdsInFlight((current) =>
          current.filter((id) => id !== actionRequestId),
        );
      }
    },
    [onRefreshData],
  );

  const composerNote =
    submitError ||
    (!authSession
      ? "You can draft the prompt here. We will only send it after you sign in."
      : runtimeError);
  const availablePersonas = runtimeSettings?.available_personas ?? [];
  const defaultPersonaKey =
    authSession?.user.default_assistant_persona ??
    resolveAssistantPersonaFromRole(availablePersonas, authSession?.user.role);
  const defaultPersonaDetails =
    availablePersonas.find((persona) => persona.key === defaultPersonaKey) ??
    null;
  const promptRouteRecommendationNote = !authSession
    ? "Sign in to load promoted routes from accepted Home handoffs."
    : promptRouteRecommendationsLoading
      ? "Loading promoted routes."
      : promptRouteRecommendationsError
        ? promptRouteRecommendationsError
        : formatPromotedRouteSummary(promotedRoutes);
  const homeCardPersistenceBusy =
    cardVisibilityState.persistenceStatus === "loading" ||
    cardVisibilityState.persistenceStatus === "saving";
  const normalizedHomeViewNameDraft = homeViewNameDraft.trim();
  const canSaveHomeViewAs =
    cardVisibilityState.canManageHomeViews &&
    !homeCardPersistenceBusy &&
    normalizedHomeViewNameDraft.length > 0;
  const canRenameHomeView =
    cardVisibilityState.canRenameActiveHomeView &&
    !homeCardPersistenceBusy &&
    normalizedHomeViewNameDraft.length > 0 &&
    normalizedHomeViewNameDraft !== cardVisibilityState.activeHomeViewName;
  const canPublishHomeView =
    cardVisibilityState.canPublishActiveHomeView && !homeCardPersistenceBusy;
  const canRetireHomeView =
    cardVisibilityState.canRetireActiveHomeView && !homeCardPersistenceBusy;
  const visibleHomeCards = cardVisibilityState.visibleCards;
  const visibleHomeCardInstanceIds =
    cardVisibilityState.visibleCardInstanceIds;
  const canConfigureActiveHomeCards =
    cardVisibilityState.canEditCards && !homeCardPersistenceBusy;
  const homeCardsMovable =
    cardVisibilityState.canEditCards && visibleHomeCardInstanceIds.length > 0;
  const homeCardOrderIndexByInstanceId = useMemo(
    () =>
      new Map<string, number>(
        visibleHomeCardInstanceIds.map((instanceId, index) => [
          instanceId,
          index,
        ]),
      ),
    [visibleHomeCardInstanceIds],
  );
  const handleHomeCardDragEnd = useCallback(
    (event: DragEndEvent) => {
      setHomeCardDeleteDragging(false);
      const activeInstanceId = String(event.active.id);
      const overInstanceId = event.over ? String(event.over.id) : null;
      if (!overInstanceId) {
        return;
      }
      if (overInstanceId === PROMPT_HOME_CARD_DELETE_DROP_TARGET_ID) {
        setPasteTargetReady(false);
        cardVisibilityState.deleteCardInstance(activeInstanceId);
        return;
      }
      if (activeInstanceId === overInstanceId) {
        return;
      }

      cardVisibilityState.moveCard(activeInstanceId, overInstanceId);
    },
    [cardVisibilityState],
  );

  function renderHomeCardSlot(
    card: PromptHomeTemplateCard,
    children: ReactNode,
  ) {
    if (!card.visible) {
      return null;
    }

    const instanceId = getPromptHomeCardInstanceId(card);
    const orderIndex = homeCardOrderIndexByInstanceId.get(instanceId) ?? 0;
    const actions = (
      <PromptHomeCardSlotActions
        card={card}
        clipboard={cardVisibilityState.cardClipboard}
        disabled={!canConfigureActiveHomeCards}
        onCopy={() => {
          setPasteTargetReady(false);
          cardVisibilityState.copyCardInstance(instanceId);
        }}
        onCut={() => {
          setPasteTargetReady(false);
          cardVisibilityState.cutCardInstance(instanceId);
        }}
        onDelete={() => {
          setPasteTargetReady(false);
          cardVisibilityState.deleteCardInstance(instanceId);
        }}
        onDuplicate={() => {
          setPasteTargetReady(false);
          cardVisibilityState.duplicateCardInstance(instanceId);
        }}
        onResizeToSpan={(state, axis, span) => {
          setPasteTargetReady(false);
          cardVisibilityState.resizeCardInstanceToSpan(
            instanceId,
            state,
            axis,
            span,
          );
        }}
      />
    );

    if (homeCardsMovable) {
      return (
        <SortablePromptHomeCardSlot
          key={instanceId}
          card={card}
          orderIndex={orderIndex}
          actions={actions}
        >
          {children}
        </SortablePromptHomeCardSlot>
      );
    }

    return (
      <PromptHomeCardSlot
        key={instanceId}
        card={card}
        orderIndex={orderIndex}
        actions={actions}
      >
        {children}
      </PromptHomeCardSlot>
    );
  }

  function renderPromptCardContent() {
    return (
      <>
        <form className="prompt-home-composer" onSubmit={handleSubmit}>
          <label className="field prompt-home-composer-field">
            <span>Operator prompt</span>
            <textarea
              ref={composerTextareaRef}
              className="control prompt-home-textarea"
              value={draft}
              onChange={(event) => {
                voiceComposer.cancelListening();
                setDraft(event.target.value);
                setSubmitError("");
              }}
              onKeyDown={handlePromptComposerKeyDown}
              placeholder="Ask what needs attention, where to go next, or how to handle a trade, queue, exposure, invoice, or report question."
            />
          </label>

          <div className="toolbar settings-actions prompt-home-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                setSubmitError("");
                voiceComposer.toggleListening();
              }}
              disabled={!voiceComposer.canToggle || submitting}
              aria-pressed={voiceComposer.listening}
            >
              {voiceComposer.buttonLabel}
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={!draft.trim() || submitting || voiceComposer.listening}
            >
              {submitting
                ? "Sending..."
                : authSession
                  ? "Send Prompt"
                  : "Sign In to Send Prompt"}
            </button>
          </div>

          <div className="prompt-home-composer-preferences">
            <label className="prompt-home-verbalize-toggle">
              <input
                type="checkbox"
                checked={verbalizeResponses}
                onChange={(event) =>
                  setVerbalizeResponses(event.target.checked)
                }
              />
              <span>Verbalize</span>
            </label>
            {availablePersonas.length > 0 ? (
              <label className="field prompt-home-persona-field">
                <span>Persona</span>
                <select
                  className="control"
                  value={selectedPersona}
                  onChange={(event) =>
                    setSelectedPersona(event.target.value as AssistantPersona | "")
                  }
                >
                  <option value="">
                    {defaultPersonaDetails
                      ? `User default (${defaultPersonaDetails.label})`
                      : "User default"}
                  </option>
                  {availablePersonas.map((persona) => (
                    <option key={persona.key} value={persona.key}>
                      {persona.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {composerNote ? (
            <p
              className={`form-note ${submitError || runtimeError ? "form-note-error" : ""}`}
            >
              {composerNote}
            </p>
          ) : null}
        </form>

        <section
          className="prompt-home-promoted-routes"
          aria-label="Promoted routes"
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">Promoted Routes</span>
              <h3>Go straight to proven destinations</h3>
            </div>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => void refreshPromptRouteRecommendations()}
              disabled={!authSession || promptRouteRecommendationsLoading}
            >
              Refresh
            </button>
          </div>
          <p
            className={`form-note ${promptRouteRecommendationsError ? "form-note-error" : ""}`}
          >
            {promptRouteRecommendationNote}
          </p>
          {promotedRoutes.length > 0 ? (
            <div className="prompt-home-destination-list">
              {promotedRoutes.map((route) => {
                if (route.readiness === "ready") {
                  return (
                    <button
                      key={route.key}
                      type="button"
                      className="prompt-home-destination prompt-home-promoted-route"
                      onClick={() =>
                        openNavigationIntent(route.intent, {
                          includeHandoff: route.hasFocusedHandoff,
                          recordOutcome: route.recordOutcomeOnOpen,
                        })
                      }
                    >
                      <div className="prompt-home-destination-head">
                        <strong>{route.displayLabel}</strong>
                        <span
                          className={`status-pill status-pill-${route.readinessTone}`}
                        >
                          {route.readinessLabel}
                        </span>
                      </div>
                      <span>{route.displayDetail}</span>
                      {route.displayFocusLabel ? (
                        <small>{route.displayFocusLabel}</small>
                      ) : null}
                      {route.ageLabel ? <small>{route.ageLabel}</small> : null}
                      <small>
                        {formatPromotedRouteEvidence(route.recommendation)}
                      </small>
                    </button>
                  );
                }

                return (
                  <article
                    key={route.key}
                    className="prompt-home-destination prompt-home-promoted-route is-unavailable"
                  >
                    <div className="prompt-home-destination-head">
                      <strong>{route.displayLabel}</strong>
                      <span
                        className={`status-pill status-pill-${route.readinessTone}`}
                      >
                        {route.readinessLabel}
                      </span>
                    </div>
                    <span>{route.displayDetail}</span>
                    {route.ageLabel ? <small>{route.ageLabel}</small> : null}
                    <div className="prompt-home-destination-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() =>
                          openNavigationIntent(route.intent, {
                            includeHandoff: false,
                          })
                        }
                      >
                        {promptNavigationIntentLabel(route.intent)}
                      </button>
                    </div>
                    <small>
                      {formatPromotedRouteEvidence(route.recommendation)}
                    </small>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="prompt-home-chat" aria-label="Desk Assistant thread">
          <div className="prompt-home-chat-log" ref={promptChatLogRef}>
            {displayedMessages.length === 0 ? (
              <div className="empty-state prompt-home-empty">
                <strong>No prompt yet</strong>
                <p>
                  Use the composer above or pick a quick prompt to start from
                  intent instead of choosing a screen first.
                </p>
              </div>
            ) : (
              displayedMessages.map((message, index) => {
                const renderedMessage =
                  parseAssistantChartArtifacts(message.content);
                const renderedParagraphs = splitAssistantMessageText(
                  renderedMessage.text,
                );
                const canReadAloud =
                  message.role === "assistant" &&
                  voicePlayback.canPlay(renderedMessage.text);
                const readingMessage = voicePlayback.isPlaying(message.id);
                const authorLabel = resolvePromptMessageAuthorLabel(message);
                const timestampLabel = formatPromptThreadTimestamp(
                  message.recordedAt,
                );
                const currentDayLabel = formatPromptThreadDayLabel(
                  message.recordedAt,
                );
                const previousDayLabel =
                  index > 0
                    ? formatPromptThreadDayLabel(
                        displayedMessages[index - 1]?.recordedAt,
                      )
                    : null;
                const showDayDivider =
                  currentDayLabel !== null &&
                  currentDayLabel !== previousDayLabel;

                return (
                  <div key={message.id} className="assistant-message-stack">
                    {showDayDivider ? (
                      <div className="assistant-message-divider">
                        <span>{currentDayLabel}</span>
                      </div>
                    ) : null}
                    <article
                      className={`assistant-message assistant-message-${message.role}`}
                    >
                      <div className="assistant-message-avatar" aria-hidden="true">
                        {resolvePromptMessageAvatarLabel(message)}
                      </div>
                      <div className="assistant-message-body">
                        <div className="assistant-message-head">
                          <div className="assistant-message-head-main">
                            <strong>{authorLabel}</strong>
                            {timestampLabel ? <span>{timestampLabel}</span> : null}
                          </div>
                          {message.provider && message.model ? (
                            <span>
                              {message.provider} · {message.model}
                            </span>
                          ) : null}
                        </div>
                        <PromptHomeAssistantActivityList message={message} />
                        {renderedParagraphs.length > 0 ||
                        renderedMessage.charts.length > 0 ? (
                          <div className="assistant-message-bubble">
                            {renderedParagraphs.map(
                              (paragraph, paragraphIndex) => (
                                <p
                                  key={`${message.id}-paragraph-${paragraphIndex}`}
                                >
                                  {paragraph}
                                </p>
                              ),
                            )}
                            <AssistantChartArtifactList
                              charts={renderedMessage.charts}
                            />
                          </div>
                        ) : null}
                        {canReadAloud ? (
                          <div className="assistant-message-meta">
                            <button
                              type="button"
                              className={`assistant-run-link ${readingMessage ? "is-selected" : ""}`}
                              aria-pressed={readingMessage}
                              disabled={!voicePlayback.supported}
                              title={
                                voicePlayback.supported
                                  ? readingMessage
                                    ? "Stop reading this assistant response aloud."
                                    : "Read this assistant response aloud."
                                  : "Read aloud is not supported in this browser."
                              }
                              onClick={() => {
                                voiceComposer.cancelListening();
                                voicePlayback.togglePlayback(
                                  message.id,
                                  renderedMessage.text,
                                );
                              }}
                            >
                              {resolveVoicePlaybackButtonLabel(readingMessage)}
                            </button>
                          </div>
                        ) : null}
                        {message.runId ? (
                          <div className="assistant-message-meta">
                            <span>Run #{message.runId}</span>
                            <button
                              type="button"
                              className="assistant-run-link"
                              onClick={() => onOpenView("assistant")}
                            >
                              Open diagnostics
                            </button>
                          </div>
                        ) : null}
                        {message.actionRequests &&
                        message.actionRequests.length > 0 ? (
                          <div className="prompt-home-action-review">
                            <div className="feedback-banner prompt-home-action-banner">
                              <strong>
                                {message.actionRequests.length.toLocaleString()}{" "}
                                governed action request
                                {message.actionRequests.length === 1 ? "" : "s"}{" "}
                                staged
                              </strong>
                              <p>
                                Nothing changes until the typed review path
                                approves and executes it.
                              </p>
                            </div>
                            <AssistantActionRequestList
                              actionRequests={message.actionRequests}
                              actionRequestIdsInFlight={actionRequestIdsInFlight}
                              formatDate={formatPromptTimestamp}
                              onDecision={handleActionRequestDecision}
                              onOpenRun={() => onOpenView("assistant")}
                              showUserId
                            />
                            <div className="assistant-message-meta prompt-home-action-path">
                              <span>
                                Need the old review inbox or full run trace?
                              </span>
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => onOpenView("assistant")}
                              >
                                Open Assistant Console
                              </button>
                            </div>
                          </div>
                        ) : null}
                        {message.navigationIntents &&
                        message.navigationIntents.length > 0 ? (
                          <div
                            className="prompt-home-handoff-list"
                            aria-label="Assistant workspace handoffs"
                          >
                            {message.navigationIntents.map((intent) => (
                              <div
                                key={buildPromptNavigationIntentKey(intent)}
                                className="prompt-home-handoff-item"
                              >
                                <button
                                  type="button"
                                  className="prompt-home-handoff"
                                  onClick={() =>
                                    openNavigationIntent(intent, {
                                      includeHandoff: true,
                                      recordOutcome: true,
                                    })
                                  }
                                >
                                  <strong>
                                    {promptNavigationIntentLabel(intent)}
                                  </strong>
                                  <span>
                                    {promptNavigationIntentDetail(intent)}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  className="button button-ghost prompt-home-handoff-dismiss"
                                  aria-label={`Dismiss ${promptNavigationIntentLabel(intent)}`}
                                  onClick={() =>
                                    handleDismissNavigationIntent(
                                      message.id,
                                      intent,
                                    )
                                  }
                                >
                                  Dismiss
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {message.warnings && message.warnings.length > 0 ? (
                          <div className="assistant-message-meta">
                            {message.warnings.map((warning) => (
                              <span key={warning}>{warning}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </>
    );
  }

  function renderHomeCardInstance(card: PromptHomeTemplateCard) {
    const instanceId = getPromptHomeCardInstanceId(card);

    switch (card.cardId) {
      case "timeframe":
        return renderHomeCardSlot(card, (
          <PromptHomeTimeframePanel
            instanceId={instanceId}
            currentTime={currentTime}
            timeDisplaySettings={timeDisplaySettings}
            timeZoneOptions={timeZoneOptions}
            onTimeZoneChange={(nextTimeZone) => {
              const savedSettings = saveTimeDisplaySettingsSnapshot({
                ...timeDisplaySettings,
                timeZone: nextTimeZone,
              });
              setTimeDisplaySettings(savedSettings);
            }}
          />
        ));
      case "exchanges":
        return renderHomeCardSlot(card, (
          <PromptHomeExchangesPanel
            instanceId={instanceId}
            currentTime={currentTime}
            timeDisplaySettings={timeDisplaySettings}
          />
        ));
      case "calendar":
        return renderHomeCardSlot(card, (
          <PromptHomeCalendarPanel
            instanceId={instanceId}
            currentTime={currentTime}
            timeDisplaySettings={timeDisplaySettings}
            customEventsHref={customEventsHref}
            onOpenCustomEvents={onOpenCustomEvents}
          />
        ));
      case "prices":
        return renderHomeCardSlot(card, (
          <PromptHomePricesCard
            authSession={authSession}
            priceIndices={priceIndices}
            referenceDataLoading={referenceDataLoading}
            homeCard={card}
            canConfigureHomeCard={canConfigureActiveHomeCards}
            onHomeCardConfigurationChange={(patch) =>
              cardVisibilityState.updateCardInstanceConfiguration(
                instanceId,
                patch,
              )
            }
            onOpenPriceSourcesReview={() =>
              onOpenView("admin", null, {
                hash: ADMIN_PRICE_SOURCES_SECTION_ID,
              })
            }
            onOpenPriceReport={(row) =>
              onOpenView(
                "reports",
                buildPriceIndexBiReportHandoff({
                  priceIndexCode: row.priceIndex.code,
                  priceIndexName: row.priceIndex.name,
                  product: row.product,
                  location: row.location,
                  source: row.source,
                }),
                { hash: PRICE_INDEX_BI_REPORT_ID },
              )
            }
          />
        ));
      case "news":
        return renderHomeCardSlot(card, (
          <PromptHomeNewsCard
            priceIndices={priceIndices}
            referenceDataLoading={referenceDataLoading}
            homeCard={card}
            canConfigureHomeCard={canConfigureActiveHomeCards}
            onHomeCardConfigurationChange={(patch) =>
              cardVisibilityState.updateCardInstanceConfiguration(
                instanceId,
                patch,
              )
            }
            onOpenReportsWorkspace={() => onOpenView("reports")}
          />
        ));
      case "map":
        return renderHomeCardSlot(card, (
          <PromptHomeMapTile
            authSession={authSession}
            assets={assets}
            deliveries={deliveries}
            locations={locations}
            priceIndices={priceIndices}
            spatialFeatures={spatialFeatures}
            referenceDataLoaded={referenceDataLoaded}
            homeCard={card}
            canConfigureHomeCard={canConfigureActiveHomeCards}
            onHomeCardConfigurationChange={(patch) =>
              cardVisibilityState.updateCardInstanceConfiguration(
                instanceId,
                patch,
              )
            }
            onOpenMapWorkspace={() => onOpenView("map")}
            initialMapAssetLayerVisible={initialMapAssetLayerVisible}
          />
        ));
      case "documents":
        return renderHomeCardSlot(card, (
          <PromptHomeDocumentUploadCard
            instanceId={instanceId}
            authSession={authSession}
            onOpenLibraryWorkspace={() => onOpenView("library")}
            onSignIn={handleSignIn}
          />
        ));
      case "communication":
        return renderHomeCardSlot(card, (
          <PromptHomeCommunicationCard
            instanceId={instanceId}
            authSession={authSession}
            counts={counts}
            sourceMessages={communicationSourceMessages}
            sourceMessagesLoading={communicationSourceLoading}
            sourceMessagesError={communicationSourceError}
            onOpenMessagesWorkspace={() => onOpenView("messages")}
            onRefreshSourceMessages={refreshCommunicationSourceMessages}
          />
        ));
      case "prompt":
        return renderHomeCardSlot(card, (
          <PromptHomePromptCardChrome
            instanceId={instanceId}
            expanded={promptCardExpandedState.expanded}
            onToggle={() =>
              promptCardExpandedState.setExpanded((current) => !current)
            }
          >
            {renderPromptCardContent()}
          </PromptHomePromptCardChrome>
        ));
      default:
        return null;
    }
  }

  function renderPromptHomePasteTarget() {
    const clipboard = cardVisibilityState.cardClipboard;
    if (!clipboard) {
      return null;
    }

    return (
      <div
        className={`prompt-home-paste-target ${pasteTargetReady ? "is-ready" : ""}`}
        role="button"
        tabIndex={0}
        style={{ order: visibleHomeCards.length }}
        onClick={() => setPasteTargetReady(true)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          setPasteTargetReady(true);
        }}
      >
        <div className="prompt-home-paste-target-copy">
          <strong>{pasteTargetReady ? "Paste ready" : "Empty area"}</strong>
          <span>
            {clipboard.mode === "cut" ? "Move" : "Paste copy of"}{" "}
            {clipboard.label}
          </span>
        </div>
        <div className="prompt-home-paste-target-actions">
          {pasteTargetReady ? (
            <button
              type="button"
              className="button button-primary"
              onClick={(event) => {
                event.stopPropagation();
                cardVisibilityState.pasteCardFromClipboard();
                setPasteTargetReady(false);
              }}
              disabled={!canConfigureActiveHomeCards}
            >
              Paste
            </button>
          ) : null}
          <button
            type="button"
            className="button button-ghost"
            onClick={(event) => {
              event.stopPropagation();
              cardVisibilityState.clearCardClipboard();
              setPasteTargetReady(false);
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  function renderHomeCardGrid(children: ReactNode) {
    if (!homeCardsMovable) {
      return (
        <div className="prompt-home-card-grid" aria-label="Home apps">
          {children}
        </div>
      );
    }

    return (
      <SortableContext
        items={visibleHomeCardInstanceIds}
        strategy={rectSortingStrategy}
      >
        <div className="prompt-home-card-grid" aria-label="Movable Home apps">
          {children}
        </div>
      </SortableContext>
    );
  }

  const homeCardsWorkspaceContent = (
    <>
      <PromptHomeCardDeleteDropTarget
        active={homeCardDeleteDragging}
        enabled={homeCardsMovable}
      >
        <div className="prompt-home-card-filter-head">
          <div className="prompt-home-card-filter-copy">
            <span className="eyebrow">Apps</span>
          </div>
          <div className="prompt-home-card-filter-side">
            <button
              type="button"
              className="button button-secondary prompt-home-undo-button"
              onClick={cardVisibilityState.undoLastCardAction}
              disabled={
                homeCardPersistenceBusy ||
                !cardVisibilityState.canUndoLastCardAction
              }
              title={
                cardVisibilityState.lastCardActionLabel
                  ? `Undo ${cardVisibilityState.lastCardActionLabel}`
                  : "Undo the last Home app layout action"
              }
            >
              Undo
            </button>
            <label className="prompt-home-preset-switcher">
              <span>Presets</span>
              <select defaultValue={PROMPT_HOME_PRESET_OPTIONS[0]}>
                {PROMPT_HOME_PRESET_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="prompt-home-view-switcher">
              <span>Saved Views</span>
              <select
                value={cardVisibilityState.activeHomeViewValue}
                onChange={(event) =>
                  cardVisibilityState.selectHomeView(event.target.value)
                }
                disabled={homeCardPersistenceBusy}
              >
                {cardVisibilityState.homeViewOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {option.kind === "system" ? " (System)" : ""}
                    {option.kind === "shared" ? " (Shared)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="prompt-home-card-filter-toggle"
              aria-expanded={cardFilterExpandedState.expanded}
              aria-controls={PROMPT_HOME_CARD_FILTER_PANEL_ID}
              onClick={() =>
                cardFilterExpandedState.setExpanded((current) => !current)
              }
            >
              <div className="prompt-home-card-filter-toggle-meta">
                <small>
                  {cardFilterExpandedState.expanded
                    ? "Close app manager"
                    : "Manage Apps"}
                </small>
                <span
                  className="prompt-home-support-toggle-indicator"
                  aria-hidden="true"
                >
                  {cardFilterExpandedState.expanded ? "−" : "+"}
                </span>
              </div>
            </button>
          </div>
        </div>

          <div
            id={PROMPT_HOME_CARD_FILTER_PANEL_ID}
            className="prompt-home-card-filter-body"
            hidden={!cardFilterExpandedState.expanded}
          >
            {cardFilterExpandedState.expanded ? (
              <>
                <div className="prompt-home-view-actions">
                  <div className="prompt-home-view-actions-copy">
                    <strong>{cardVisibilityState.activeHomeViewName}</strong>
                    <small>{cardVisibilityState.activeHomeViewDetail}</small>
                  </div>
                  <label className="prompt-home-view-name-field">
                    <span>View name</span>
                    <input
                      type="text"
                      value={homeViewNameDraft}
                      placeholder="New Home view"
                      onChange={(event) =>
                        setHomeViewNameDraft(event.target.value)
                      }
                      disabled={
                        homeCardPersistenceBusy ||
                        !cardVisibilityState.canManageHomeViews
                      }
                    />
                  </label>
                  <div className="prompt-home-view-action-buttons">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        cardVisibilityState.saveHomeViewAs(homeViewNameDraft)
                      }
                      disabled={!canSaveHomeViewAs}
                    >
                      Save As
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        cardVisibilityState.renameActiveHomeView(
                          homeViewNameDraft,
                        )
                      }
                      disabled={!canRenameHomeView}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() =>
                        cardVisibilityState.publishActiveHomeView(
                          normalizedHomeViewNameDraft || undefined,
                        )
                      }
                      disabled={!canPublishHomeView}
                    >
                      Publish
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => {
                        if (
                          typeof window !== "undefined" &&
                          !window.confirm(
                            `Retire ${cardVisibilityState.activeHomeViewName}?`,
                          )
                        ) {
                          return;
                        }

                        cardVisibilityState.retireActiveHomeView();
                      }}
                      disabled={!canRetireHomeView}
                    >
                      Retire
                    </button>
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => {
                        if (
                          typeof window !== "undefined" &&
                          !window.confirm(
                            `Delete ${cardVisibilityState.activeHomeViewName}?`,
                          )
                        ) {
                          return;
                        }

                        cardVisibilityState.deleteActiveHomeView();
                      }}
                      disabled={
                        homeCardPersistenceBusy ||
                        !cardVisibilityState.canDeleteActiveHomeView
                      }
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div
                  className="prompt-home-card-filter-grid"
                  role="group"
                  aria-label="Apps"
                >
                  {PROMPT_HOME_CARD_VISIBILITY_OPTIONS.map((cardOption) => {
                    const cardVisible = cardVisibilityState.isCardVisible(
                      cardOption.key,
                    );

                    return (
                      <div
                        key={cardOption.key}
                        className={`prompt-home-card-filter-choice ${cardVisible ? "is-visible" : "is-hidden"}`}
                      >
                        <span className="prompt-home-card-filter-choice-copy">
                          <strong>{cardOption.label}</strong>
                          <small>{cardVisible ? "Added" : "Available"}</small>
                        </span>
                        <button
                          type="button"
                          className="button button-secondary prompt-home-card-filter-add-button"
                          disabled={
                            cardVisible ||
                            homeCardPersistenceBusy ||
                            !cardVisibilityState.canEditCards
                          }
                          onClick={() =>
                            cardVisibilityState.setCardVisible(
                              cardOption.key,
                              true,
                            )
                          }
                          aria-label={`Add ${cardOption.label} to Home apps`}
                          title={
                            cardVisible
                              ? `${cardOption.label} is already added`
                              : undefined
                          }
                        >
                          Add
                        </button>
                      </div>
                    );
                  })}
                </div>
                {cardVisibilityState.persistenceError ? (
                  <p className="form-note form-note-error">
                    {cardVisibilityState.persistenceError}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </PromptHomeCardDeleteDropTarget>

        {visibleHomeCards.length > 0 || cardVisibilityState.cardClipboard
          ? renderHomeCardGrid(
              <>
                {visibleHomeCards.map((card) => renderHomeCardInstance(card))}
                {renderPromptHomePasteTarget()}
              </>,
            )
          : null}
    </>
  );

  return (
    <div className="prompt-home">
      <DndContext
        sensors={homeCardSensors}
        collisionDetection={closestCenter}
        onDragStart={() => setHomeCardDeleteDragging(true)}
        onDragEnd={handleHomeCardDragEnd}
        onDragCancel={() => setHomeCardDeleteDragging(false)}
      >
        {homeCardsWorkspaceContent}
      </DndContext>
    </div>
  );
}
