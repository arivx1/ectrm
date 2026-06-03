export const PROMPT_HOME_SYSTEM_TEMPLATE_KEY = "system_home";
export const PROMPT_HOME_SYSTEM_TEMPLATE_VERSION = 1;

export const PROMPT_HOME_CARD_KEYS = [
  "timeframe",
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

export type PromptHomeCardPlacement = {
  order: number;
  columnSpan: 1 | 2;
  rowSpan: 1 | 2;
};

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

export const PROMPT_HOME_CARD_REGISTRY = [
  {
    cardId: "timeframe",
    kind: "desk_time",
    label: "Desk Time",
    defaultVisible: true,
    defaultPlacement: { order: 0, columnSpan: 1, rowSpan: 1 },
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
    defaultPlacement: { order: 1, columnSpan: 2, rowSpan: 1 },
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
    defaultPlacement: { order: 2, columnSpan: 2, rowSpan: 1 },
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
    defaultPlacement: { order: 3, columnSpan: 2, rowSpan: 2 },
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
    defaultPlacement: { order: 4, columnSpan: 1, rowSpan: 1 },
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
    defaultPlacement: { order: 5, columnSpan: 1, rowSpan: 1 },
    allowedParameters: [],
    allowedFilterFields: ["message_category", "workflow_category"],
    dataBindings: ["message_threads", "operator_attention_counts"],
    requiredEntitlements: [],
  },
  {
    cardId: "prompt",
    kind: "assistant_prompt",
    label: "Ask the desk assistant",
    defaultVisible: true,
    defaultPlacement: { order: 6, columnSpan: 2, rowSpan: 1 },
    allowedParameters: ["default_summary_targets", "starter_kit"],
    allowedFilterFields: ["workflow_category"],
    dataBindings: ["assistant_conversation", "operator_attention_counts"],
    requiredEntitlements: [],
  },
] as const satisfies readonly PromptHomeCardDefinition[];

const PROMPT_HOME_CARD_KEY_SET: ReadonlySet<string> = new Set(
  PROMPT_HOME_CARD_KEYS,
);

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
  };
}

function createTemplateCard(
  definition: PromptHomeCardDefinition,
  order: number,
): PromptHomeTemplateCard {
  return {
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

function normalizeColumnSpan(value: unknown, fallback: 1 | 2): 1 | 2 {
  return value === 1 || value === 2 ? value : fallback;
}

function normalizeRowSpan(value: unknown, fallback: 1 | 2): 1 | 2 {
  return value === 1 || value === 2 ? value : fallback;
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

  return {
    cardId: definition.cardId,
    visible:
      typeof value.visible === "boolean"
        ? value.visible
        : definition.defaultVisible,
    placement: {
      order,
      columnSpan: normalizeColumnSpan(
        placement.columnSpan,
        definition.defaultPlacement.columnSpan,
      ),
      rowSpan: normalizeRowSpan(
        placement.rowSpan,
        definition.defaultPlacement.rowSpan,
      ),
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
  const normalizedCards: PromptHomeTemplateCard[] = [];

  for (const candidateCard of candidateCards) {
    const normalizedCard = normalizeTemplateCard(
      candidateCard,
      normalizedCards.length,
    );
    if (!normalizedCard || seenCardKeys.has(normalizedCard.cardId)) {
      continue;
    }

    seenCardKeys.add(normalizedCard.cardId);
    normalizedCards.push(normalizedCard);
  }

  for (const definition of PROMPT_HOME_CARD_REGISTRY) {
    if (seenCardKeys.has(definition.cardId)) {
      continue;
    }

    normalizedCards.push(
      createTemplateCard(definition, normalizedCards.length),
    );
  }

  return normalizedCards;
}
