export const PROMPT_HOME_SYSTEM_TEMPLATE_KEY = "system_home";
export const PROMPT_HOME_SYSTEM_TEMPLATE_VERSION = 1;

export const PROMPT_HOME_CARD_KEYS = [
  "timeframe",
  "exchanges",
  "calendar",
  "prices",
  "news",
  "map",
  "documents",
  "communication",
  "prompt",
] as const;

export type PromptHomeCardKey = (typeof PROMPT_HOME_CARD_KEYS)[number];

export type PromptHomeCardKind =
  | "desk_time"
  | "exchange_sessions"
  | "calendar"
  | "market_prices"
  | "market_news"
  | "asset_map"
  | "document_upload"
  | "communication_center"
  | "assistant_prompt";

export type PromptHomeCardParameterKey =
  | "calendar_display"
  | "default_summary_targets"
  | "map_record_limit"
  | "news_limit"
  | "news_lookback_days"
  | "news_query"
  | "price_mark_status"
  | "price_sort"
  | "starter_kit"
  | "time_zone"
  | "weather_overlays";

export type PromptHomeCardFilterField =
  | "calendar_source"
  | "commodity_code"
  | "document_kind"
  | "geography"
  | "location_code"
  | "message_category"
  | "price_index_code"
  | "provider"
  | "quote_type"
  | "region"
  | "review_status"
  | "workflow_category";

export type PromptHomeCardDataBinding =
  | "asset_map"
  | "assistant_conversation"
  | "calendar_events"
  | "document_ingestion"
  | "latest_price_marks"
  | "market_news_headlines"
  | "market_price_indices"
  | "message_threads"
  | "operator_attention_counts"
  | "spatial_features"
  | "user_events"
  | "weather_overlays";

export type PromptHomeCardHorizontalSpan = 1 | 2 | 3 | 4;
export type PromptHomeCardVerticalSpan = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const PROMPT_HOME_CARD_MIN_SPAN = 1;
export const PROMPT_HOME_CARD_MAX_HORIZONTAL_SPAN = 4;
export const PROMPT_HOME_CARD_MAX_COLLAPSED_ROW_SPAN = 4;
export const PROMPT_HOME_CARD_MAX_EXPANDED_ROW_SPAN = 8;

export type PromptHomeCardPlacement = {
  order: number;
  columnSpan: PromptHomeCardHorizontalSpan;
  rowSpan: PromptHomeCardVerticalSpan;
  collapsedColumnSpan: PromptHomeCardHorizontalSpan;
  collapsedRowSpan: PromptHomeCardVerticalSpan;
  expandedColumnSpan: PromptHomeCardHorizontalSpan;
  expandedRowSpan: PromptHomeCardVerticalSpan;
};

export type PromptHomeCardInstanceId = string;

export type PromptHomeCardDefinition = {
  cardId: PromptHomeCardKey;
  kind: PromptHomeCardKind;
  label: string;
  defaultVisible: boolean;
  defaultPlacement: PromptHomeCardPlacement;
  allowedParameters: readonly PromptHomeCardParameterKey[];
  allowedFilterFields: readonly PromptHomeCardFilterField[];
  dataBindings: readonly PromptHomeCardDataBinding[];
  requiredEntitlements: readonly string[];
};

export type PromptHomeTemplateCard = {
  instanceId: PromptHomeCardInstanceId;
  cardId: PromptHomeCardKey;
  visible: boolean;
  placement: PromptHomeCardPlacement;
  parameters: Record<string, unknown>;
  filters: Record<string, unknown>;
  dataBindings: readonly PromptHomeCardDataBinding[];
};

export type PromptHomeSystemTemplate = {
  templateKey: typeof PROMPT_HOME_SYSTEM_TEMPLATE_KEY;
  templateVersion: typeof PROMPT_HOME_SYSTEM_TEMPLATE_VERSION;
  label: string;
  immutable: true;
  cards: readonly PromptHomeTemplateCard[];
};

export type PromptHomeCardVisibilityOption = {
  key: PromptHomeCardKey;
  label: string;
};

export const PROMPT_HOME_DEFAULT_CARD_COLUMN_SPAN: PromptHomeCardHorizontalSpan = 2;
export const PROMPT_HOME_DEFAULT_CARD_COLLAPSED_ROW_SPAN: PromptHomeCardVerticalSpan = 1;
export const PROMPT_HOME_DEFAULT_CARD_EXPANDED_ROW_SPAN: PromptHomeCardVerticalSpan = 4;

function defaultPromptHomeCardPlacement(
  order: number,
  expandedRowSpan: PromptHomeCardVerticalSpan = PROMPT_HOME_DEFAULT_CARD_EXPANDED_ROW_SPAN,
): PromptHomeCardPlacement {
  return {
    order,
    columnSpan: PROMPT_HOME_DEFAULT_CARD_COLUMN_SPAN,
    rowSpan: expandedRowSpan,
    collapsedColumnSpan: PROMPT_HOME_DEFAULT_CARD_COLUMN_SPAN,
    collapsedRowSpan: PROMPT_HOME_DEFAULT_CARD_COLLAPSED_ROW_SPAN,
    expandedColumnSpan: PROMPT_HOME_DEFAULT_CARD_COLUMN_SPAN,
    expandedRowSpan,
  };
}

export const PROMPT_HOME_CARD_REGISTRY = [
  {
    cardId: "timeframe",
    kind: "desk_time",
    label: "Desk Time",
    defaultVisible: true,
    defaultPlacement: defaultPromptHomeCardPlacement(0),
    allowedParameters: ["time_zone"],
    allowedFilterFields: [],
    dataBindings: [],
    requiredEntitlements: [],
  },
  {
    cardId: "exchanges",
    kind: "exchange_sessions",
    label: "Exchanges",
    defaultVisible: true,
    defaultPlacement: defaultPromptHomeCardPlacement(1),
    allowedParameters: ["time_zone"],
    allowedFilterFields: ["region"],
    dataBindings: [],
    requiredEntitlements: [],
  },
  {
    cardId: "calendar",
    kind: "calendar",
    label: "Calendar",
    defaultVisible: true,
    defaultPlacement: defaultPromptHomeCardPlacement(2),
    allowedParameters: ["calendar_display", "time_zone"],
    allowedFilterFields: ["calendar_source"],
    dataBindings: ["calendar_events", "user_events"],
    requiredEntitlements: [],
  },
  {
    cardId: "prices",
    kind: "market_prices",
    label: "Market Prices",
    defaultVisible: true,
    defaultPlacement: defaultPromptHomeCardPlacement(3),
    allowedParameters: ["price_mark_status", "price_sort"],
    allowedFilterFields: [
      "commodity_code",
      "location_code",
      "price_index_code",
      "provider",
      "quote_type",
      "region",
    ],
    dataBindings: ["latest_price_marks", "market_price_indices"],
    requiredEntitlements: [],
  },
  {
    cardId: "news",
    kind: "market_news",
    label: "Market News",
    defaultVisible: true,
    defaultPlacement: defaultPromptHomeCardPlacement(4),
    allowedParameters: ["news_limit", "news_lookback_days", "news_query"],
    allowedFilterFields: [
      "commodity_code",
      "location_code",
      "price_index_code",
      "provider",
      "quote_type",
      "region",
    ],
    dataBindings: ["market_news_headlines", "market_price_indices"],
    requiredEntitlements: [],
  },
  {
    cardId: "map",
    kind: "asset_map",
    label: "Asset map",
    defaultVisible: true,
    defaultPlacement: defaultPromptHomeCardPlacement(5),
    allowedParameters: ["map_record_limit", "weather_overlays"],
    allowedFilterFields: ["commodity_code", "geography", "location_code", "region"],
    dataBindings: ["asset_map", "spatial_features", "weather_overlays"],
    requiredEntitlements: [],
  },
  {
    cardId: "documents",
    kind: "document_upload",
    label: "Upload documents",
    defaultVisible: true,
    defaultPlacement: defaultPromptHomeCardPlacement(6),
    allowedParameters: [],
    allowedFilterFields: ["document_kind", "review_status"],
    dataBindings: ["document_ingestion"],
    requiredEntitlements: [],
  },
  {
    cardId: "communication",
    kind: "communication_center",
    label: "Communication center",
    defaultVisible: true,
    defaultPlacement: defaultPromptHomeCardPlacement(7),
    allowedParameters: [],
    allowedFilterFields: ["message_category", "workflow_category"],
    dataBindings: ["message_threads", "operator_attention_counts"],
    requiredEntitlements: [],
  },
  {
    cardId: "prompt",
    kind: "assistant_prompt",
    label: "Desk Assistant",
    defaultVisible: true,
    defaultPlacement: defaultPromptHomeCardPlacement(8),
    allowedParameters: ["default_summary_targets", "starter_kit"],
    allowedFilterFields: ["workflow_category"],
    dataBindings: ["assistant_conversation", "operator_attention_counts"],
    requiredEntitlements: [],
  },
] as const satisfies readonly PromptHomeCardDefinition[];

const PROMPT_HOME_CARD_KEY_SET: ReadonlySet<string> = new Set(
  PROMPT_HOME_CARD_KEYS,
);
const PROMPT_HOME_CARD_INSTANCE_ID_MAX_LENGTH = 80;

const PROMPT_HOME_CARD_DEFINITION_BY_KEY = new Map<
  PromptHomeCardKey,
  PromptHomeCardDefinition
>(
  PROMPT_HOME_CARD_REGISTRY.map((definition) => [
    definition.cardId,
    definition,
  ]),
);

export const PROMPT_HOME_CARD_VISIBILITY_OPTIONS: readonly PromptHomeCardVisibilityOption[] =
  PROMPT_HOME_CARD_REGISTRY.map((definition) => ({
    key: definition.cardId,
    label: definition.label,
  }));

export function isPromptHomeCardKey(
  value: unknown,
): value is PromptHomeCardKey {
  return typeof value === "string" && PROMPT_HOME_CARD_KEY_SET.has(value);
}

export function getPromptHomeCardDefinition(
  cardKey: PromptHomeCardKey,
): PromptHomeCardDefinition {
  const definition = PROMPT_HOME_CARD_DEFINITION_BY_KEY.get(cardKey);
  if (!definition) {
    throw new Error(`Unsupported Prompt Home card key: ${cardKey}`);
  }
  return definition;
}

export function getPromptHomeCardLabel(cardKey: PromptHomeCardKey): string {
  return getPromptHomeCardDefinition(cardKey).label;
}

export function getPromptHomeCardInstanceId(
  card: Pick<PromptHomeTemplateCard, "cardId" | "instanceId">,
): PromptHomeCardInstanceId {
  return card.instanceId || card.cardId;
}

export function listPromptHomeCardDefinitions(): PromptHomeCardDefinition[] {
  return PROMPT_HOME_CARD_REGISTRY.map((definition) => ({ ...definition }));
}

function clonePlacement(
  placement: PromptHomeCardPlacement,
): PromptHomeCardPlacement {
  return {
    order: placement.order,
    columnSpan: placement.columnSpan,
    rowSpan: placement.rowSpan,
    collapsedColumnSpan: placement.collapsedColumnSpan,
    collapsedRowSpan: placement.collapsedRowSpan,
    expandedColumnSpan: placement.expandedColumnSpan,
    expandedRowSpan: placement.expandedRowSpan,
  };
}

function createTemplateCard(
  definition: PromptHomeCardDefinition,
  order: number,
): PromptHomeTemplateCard {
  return {
    instanceId: definition.cardId,
    cardId: definition.cardId,
    visible: definition.defaultVisible,
    placement: {
      ...clonePlacement(definition.defaultPlacement),
      order,
    },
    parameters: {},
    filters: {},
    dataBindings: [...definition.dataBindings],
  };
}

export function buildPromptHomeSystemTemplate(): PromptHomeSystemTemplate {
  return {
    templateKey: PROMPT_HOME_SYSTEM_TEMPLATE_KEY,
    templateVersion: PROMPT_HOME_SYSTEM_TEMPLATE_VERSION,
    label: "System Home",
    immutable: true,
    cards: PROMPT_HOME_CARD_REGISTRY.map((definition, index) =>
      createTemplateCard(definition, index),
    ),
  };
}

function freezeTemplateCard(
  card: PromptHomeTemplateCard,
): PromptHomeTemplateCard {
  Object.freeze(card.placement);
  Object.freeze(card.parameters);
  Object.freeze(card.filters);
  Object.freeze(card.dataBindings);
  return Object.freeze(card);
}

function freezeSystemTemplate(
  template: PromptHomeSystemTemplate,
): PromptHomeSystemTemplate {
  template.cards.forEach(freezeTemplateCard);
  Object.freeze(template.cards);
  return Object.freeze(template);
}

export const PROMPT_HOME_SYSTEM_TEMPLATE = freezeSystemTemplate(
  buildPromptHomeSystemTemplate(),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeHorizontalSpan(
  value: unknown,
  fallback: PromptHomeCardHorizontalSpan,
): PromptHomeCardHorizontalSpan {
  return value === 1 || value === 2 || value === 3 || value === 4
    ? value
    : fallback;
}

function normalizeVerticalSpan(
  value: unknown,
  fallback: PromptHomeCardVerticalSpan,
  maxSpan: number = PROMPT_HOME_CARD_MAX_EXPANDED_ROW_SPAN,
): PromptHomeCardVerticalSpan {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const roundedValue = Math.round(value);
  if (roundedValue < PROMPT_HOME_CARD_MIN_SPAN || roundedValue > maxSpan) {
    return fallback;
  }

  return roundedValue as PromptHomeCardVerticalSpan;
}

function normalizePromptHomeCardInstanceId(
  value: unknown,
  fallback: PromptHomeCardKey,
): PromptHomeCardInstanceId {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate) {
    return fallback;
  }

  return candidate.slice(0, PROMPT_HOME_CARD_INSTANCE_ID_MAX_LENGTH);
}

function makeUniquePromptHomeCardInstanceId(
  candidate: PromptHomeCardInstanceId,
  cardId: PromptHomeCardKey,
  usedInstanceIds: ReadonlySet<string>,
): PromptHomeCardInstanceId {
  const sanitizedBase =
    candidate
      .replace(/[^A-Za-z0-9_.:-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, PROMPT_HOME_CARD_INSTANCE_ID_MAX_LENGTH) || cardId;

  if (!usedInstanceIds.has(sanitizedBase)) {
    return sanitizedBase;
  }

  let index = 2;
  while (index < 10_000) {
    const suffix = `-${index}`;
    const prefix = sanitizedBase.slice(
      0,
      PROMPT_HOME_CARD_INSTANCE_ID_MAX_LENGTH - suffix.length,
    );
    const nextInstanceId = `${prefix}${suffix}`;
    if (!usedInstanceIds.has(nextInstanceId)) {
      return nextInstanceId;
    }
    index += 1;
  }

  return `${cardId}-${Date.now().toString(36)}`.slice(
    0,
    PROMPT_HOME_CARD_INSTANCE_ID_MAX_LENGTH,
  );
}

function normalizeTemplateCard(
  value: unknown,
  order: number,
): PromptHomeTemplateCard | null {
  if (!isRecord(value) || !isPromptHomeCardKey(value.cardId)) {
    return null;
  }

  const definition = getPromptHomeCardDefinition(value.cardId);
  const placement = isRecord(value.placement) ? value.placement : {};
  const collapsedColumnSpan = normalizeHorizontalSpan(
    placement.collapsedColumnSpan ?? placement.collapsed_column_span,
    definition.defaultPlacement.collapsedColumnSpan ??
      PROMPT_HOME_DEFAULT_CARD_COLUMN_SPAN,
  );
  const expandedColumnSpan = normalizeHorizontalSpan(
    placement.expandedColumnSpan ?? placement.expanded_column_span,
    definition.defaultPlacement.expandedColumnSpan ??
      PROMPT_HOME_DEFAULT_CARD_COLUMN_SPAN,
  );
  const collapsedRowSpan = normalizeVerticalSpan(
    placement.collapsedRowSpan ?? placement.collapsed_row_span,
    definition.defaultPlacement.collapsedRowSpan ??
      PROMPT_HOME_DEFAULT_CARD_COLLAPSED_ROW_SPAN,
    PROMPT_HOME_CARD_MAX_COLLAPSED_ROW_SPAN,
  );
  const expandedRowSpan = normalizeVerticalSpan(
    placement.expandedRowSpan ?? placement.expanded_row_span,
    definition.defaultPlacement.expandedRowSpan ??
      PROMPT_HOME_DEFAULT_CARD_EXPANDED_ROW_SPAN,
    PROMPT_HOME_CARD_MAX_EXPANDED_ROW_SPAN,
  );
  const instanceId = normalizePromptHomeCardInstanceId(
    value.instanceId ?? value.instance_id,
    definition.cardId,
  );

  return {
    instanceId,
    cardId: definition.cardId,
    visible:
      typeof value.visible === "boolean"
        ? value.visible
        : definition.defaultVisible,
    placement: {
      order,
      columnSpan: expandedColumnSpan,
      rowSpan: expandedRowSpan,
      collapsedColumnSpan,
      collapsedRowSpan,
      expandedColumnSpan,
      expandedRowSpan,
    },
    parameters: isRecord(value.parameters) ? { ...value.parameters } : {},
    filters: isRecord(value.filters) ? { ...value.filters } : {},
    dataBindings: [...definition.dataBindings],
  };
}

export function normalizePromptHomeTemplateCards(
  value: unknown,
): PromptHomeTemplateCard[] {
  const candidateCards =
    Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.cards)
        ? value.cards
        : [];
  const seenCardKeys = new Set<PromptHomeCardKey>();
  const seenInstanceIds = new Set<PromptHomeCardInstanceId>();
  const normalizedCards: PromptHomeTemplateCard[] = [];

  for (const candidateCard of candidateCards) {
    const normalizedCard = normalizeTemplateCard(
      candidateCard,
      normalizedCards.length,
    );
    if (!normalizedCard) {
      continue;
    }

    const instanceId = makeUniquePromptHomeCardInstanceId(
      normalizedCard.instanceId,
      normalizedCard.cardId,
      seenInstanceIds,
    );
    seenInstanceIds.add(instanceId);
    seenCardKeys.add(normalizedCard.cardId);
    normalizedCards.push({
      ...normalizedCard,
      instanceId,
      placement: {
        ...normalizedCard.placement,
        order: normalizedCards.length,
      },
    });
  }

  for (const definition of PROMPT_HOME_CARD_REGISTRY) {
    if (seenCardKeys.has(definition.cardId)) {
      continue;
    }

    const defaultCard = createTemplateCard(definition, normalizedCards.length);
    const instanceId = makeUniquePromptHomeCardInstanceId(
      defaultCard.instanceId,
      defaultCard.cardId,
      seenInstanceIds,
    );
    seenInstanceIds.add(instanceId);
    normalizedCards.push({
      ...defaultCard,
      instanceId,
    });
  }

  return normalizedCards;
}
