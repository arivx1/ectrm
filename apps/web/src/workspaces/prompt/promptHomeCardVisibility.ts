import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ApiError } from "../../shared/api";
import type { StoredAuthSession } from "../../shared/mutation";
import {
  createHomeViewDefinition,
  deleteHomeViewDefinition,
  duplicateHomeViewDefinition,
  homeViewCardPayloadToPromptHomeCard,
  listHomeViewDefinitions,
  loadHomeViewSystemTemplate,
  publishHomeViewDefinition,
  retireHomeViewDefinition,
  resetHomeViewDefinition,
  toHomeViewCardPayload,
  updateHomeViewDefinition,
  type HomeViewDefinition,
  type HomeViewDefinitionCreatePayload,
} from "../../entities/home-views/api";
import {
  isPromptHomeCardKey,
  getPromptHomeCardLabel,
  getPromptHomeCardInstanceId,
  normalizePromptHomeTemplateCards,
  PROMPT_HOME_CARD_KEYS,
  PROMPT_HOME_CARD_VISIBILITY_OPTIONS,
  PROMPT_HOME_CARD_MAX_COLLAPSED_ROW_SPAN,
  PROMPT_HOME_CARD_MAX_EXPANDED_ROW_SPAN,
  PROMPT_HOME_CARD_MAX_HORIZONTAL_SPAN,
  PROMPT_HOME_CARD_MIN_SPAN,
  PROMPT_HOME_SYSTEM_TEMPLATE,
  PROMPT_HOME_SYSTEM_TEMPLATE_KEY,
  PROMPT_HOME_SYSTEM_TEMPLATE_VERSION,
  type PromptHomeCardKey,
  type PromptHomeCardHorizontalSpan,
  type PromptHomeCardPlacement,
  type PromptHomeTemplateCard,
  type PromptHomeCardVerticalSpan,
} from "./promptHomeCards";

export { PROMPT_HOME_CARD_VISIBILITY_OPTIONS, type PromptHomeCardKey } from "./promptHomeCards";

export const PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY =
  "ectrm.prompt-home.card-visibility";
export const PROMPT_HOME_CARD_ORDER_STORAGE_KEY =
  "ectrm.prompt-home.card-order";
export const PROMPT_HOME_TEMPLATE_CARDS_STORAGE_KEY =
  "ectrm.prompt-home.cards.v2";

const PROMPT_HOME_CARD_VISIBILITY_STORAGE_EVENT =
  "ectrm:prompt-home-card-visibility-change";
const PROMPT_HOME_CARD_ORDER_STORAGE_EVENT =
  "ectrm:prompt-home-card-order-change";
const PROMPT_HOME_TEMPLATE_CARDS_STORAGE_EVENT =
  "ectrm:prompt-home-cards-change";
export const PROMPT_HOME_DEFAULT_PERSONAL_VIEW_NAME = "My Home";
export const PROMPT_HOME_PERSONAL_VIEW_MIGRATION_STORAGE_KEY_PREFIX =
  "ectrm.prompt-home.default-view-migrated";
export const PROMPT_HOME_ACTIVE_VIEW_STORAGE_KEY_PREFIX =
  "ectrm.prompt-home.active-view";
export const PROMPT_HOME_SYSTEM_VIEW_VALUE = "system";
export const PROMPT_HOME_LOCAL_VIEW_VALUE = "local";

export type PromptHomeViewOption = {
  value: string;
  label: string;
  detail: string;
  kind: "system" | "personal" | "shared" | "local";
  canEdit: boolean;
};

export type PromptHomeCardPersistenceStatus =
  | "loading"
  | "system"
  | "personal"
  | "shared"
  | "saving"
  | "local"
  | "fallback";

type PersonalHomeViewState = {
  definitions: HomeViewDefinition[];
  activeDefinitionId: number | null;
  cards: PromptHomeTemplateCard[] | null;
  systemCards: PromptHomeTemplateCard[] | null;
  loading: boolean;
  saving: boolean;
  fallback: boolean;
  error: string;
};

type UsePersistentPromptHomeCardVisibilityOptions = {
  apiBase?: string;
  authSession?: StoredAuthSession | null;
};

export type PromptHomeCardConfigurationPatch = {
  parameters?: Record<string, unknown>;
  filters?: Record<string, unknown>;
};

export type PromptHomeCardClipboard = {
  mode: "copy" | "cut";
  sourceInstanceId: string;
  cardId: PromptHomeCardKey;
  label: string;
};

export type PromptHomeCardSizeState = "collapsed" | "expanded";
export type PromptHomeCardSizeAxis = "horizontal" | "vertical";
export type PromptHomeCardSizeDirection = "decrease" | "increase";

type PromptHomeCardClipboardState = PromptHomeCardClipboard & {
  card: PromptHomeTemplateCard;
};

type PromptHomeCardUndoState = {
  label: string;
  cards: PromptHomeTemplateCard[];
};

function uniquePromptHomeCardKeys(candidate: unknown): PromptHomeCardKey[] {
  const orderedKeys: PromptHomeCardKey[] = [];
  const items = Array.isArray(candidate) ? candidate : [];

  for (const item of items) {
    if (
      typeof item === "string" &&
      isPromptHomeCardKey(item) &&
      !orderedKeys.includes(item)
    ) {
      orderedKeys.push(item);
    }
  }

  return orderedKeys;
}

export function normalizePromptHomeHiddenCardKeys(
  value: unknown,
): PromptHomeCardKey[] {
  const candidate = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { hidden?: unknown }).hidden)
      ? (value as { hidden: unknown[] }).hidden
      : [];
  return uniquePromptHomeCardKeys(candidate);
}

export function normalizePromptHomeCardOrder(
  value: unknown,
): PromptHomeCardKey[] {
  const candidate = Array.isArray(value)
    ? value
    : value &&
        typeof value === "object" &&
        Array.isArray((value as { order?: unknown }).order)
      ? (value as { order: unknown[] }).order
      : [];
  const orderedKeys = uniquePromptHomeCardKeys(candidate);

  return [
    ...orderedKeys,
    ...PROMPT_HOME_CARD_KEYS.filter((cardKey) => !orderedKeys.includes(cardKey)),
  ];
}

export function getPromptHomeHiddenCardKeysSnapshot(): PromptHomeCardKey[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedValue = window.localStorage.getItem(
    PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY,
  );
  if (!storedValue) {
    return [];
  }

  try {
    return normalizePromptHomeHiddenCardKeys(JSON.parse(storedValue));
  } catch {
    return [];
  }
}

export function getPromptHomeCardOrderSnapshot(): PromptHomeCardKey[] {
  if (typeof window === "undefined") {
    return [...PROMPT_HOME_CARD_KEYS];
  }

  const storedValue = window.localStorage.getItem(
    PROMPT_HOME_CARD_ORDER_STORAGE_KEY,
  );
  if (!storedValue) {
    return [...PROMPT_HOME_CARD_KEYS];
  }

  try {
    return normalizePromptHomeCardOrder(JSON.parse(storedValue));
  } catch {
    return [...PROMPT_HOME_CARD_KEYS];
  }
}

function promptHomeTemplateCardsToStorageCards(
  cards: readonly PromptHomeTemplateCard[],
): Array<Record<string, unknown>> {
  return normalizePromptHomeTemplateCards(cards).map((card) => ({
    instanceId: getPromptHomeCardInstanceId(card),
    cardId: card.cardId,
    visible: card.visible,
    placement: {
      order: card.placement.order,
      columnSpan: card.placement.columnSpan,
      rowSpan: card.placement.rowSpan,
      collapsedColumnSpan: card.placement.collapsedColumnSpan,
      collapsedRowSpan: card.placement.collapsedRowSpan,
      expandedColumnSpan: card.placement.expandedColumnSpan,
      expandedRowSpan: card.placement.expandedRowSpan,
    },
    parameters: { ...card.parameters },
    filters: { ...card.filters },
    dataBindings: [...card.dataBindings],
  }));
}

function getPromptHomeTemplateCardsSnapshot(): PromptHomeTemplateCard[] {
  if (typeof window === "undefined") {
    return normalizePromptHomeTemplateCards(PROMPT_HOME_SYSTEM_TEMPLATE.cards);
  }

  const storedValue = window.localStorage.getItem(
    PROMPT_HOME_TEMPLATE_CARDS_STORAGE_KEY,
  );
  if (storedValue) {
    try {
      return normalizePromptHomeTemplateCards(JSON.parse(storedValue));
    } catch {
      // Fall through to the legacy split order/visibility preferences.
    }
  }

  return buildPromptHomeCardsFromOrderAndHidden(
    getPromptHomeCardOrderSnapshot(),
    getPromptHomeHiddenCardKeysSnapshot(),
  );
}

function promptHomeLocalPreferencesExist(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.localStorage.getItem(PROMPT_HOME_TEMPLATE_CARDS_STORAGE_KEY) !==
      null ||
    window.localStorage.getItem(PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY) !==
      null ||
    window.localStorage.getItem(PROMPT_HOME_CARD_ORDER_STORAGE_KEY) !== null
  );
}

function defaultPersonalViewMigrationStorageKey(userId: string): string {
  return `${PROMPT_HOME_PERSONAL_VIEW_MIGRATION_STORAGE_KEY_PREFIX}.${userId}`;
}

function defaultPersonalViewWasMigrated(userId: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(defaultPersonalViewMigrationStorageKey(userId)) === "true";
}

function markDefaultPersonalViewMigrated(userId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(defaultPersonalViewMigrationStorageKey(userId), "true");
  } catch {
    // The migration marker is advisory; the server definition is the durable record.
  }
}

function activeHomeViewStorageKey(userId: string): string {
  return `${PROMPT_HOME_ACTIVE_VIEW_STORAGE_KEY_PREFIX}.${userId}`;
}

function personalHomeViewValue(definitionId: number): string {
  return `personal:${definitionId}`;
}

function sharedHomeViewValue(definitionId: number): string {
  return `shared:${definitionId}`;
}

function homeViewDefinitionValue(definition: HomeViewDefinition): string {
  return definition.is_shared
    ? sharedHomeViewValue(definition.definition_id)
    : personalHomeViewValue(definition.definition_id);
}

function parseHomeViewDefinitionValue(value: string): number | null {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  const prefix = value.slice(0, separatorIndex);
  if (prefix !== "personal" && prefix !== "shared") {
    return null;
  }

  const parsedValue = Number.parseInt(value.slice(separatorIndex + 1), 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getStoredActiveHomeViewValue(userId: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(activeHomeViewStorageKey(userId));
}

function saveActiveHomeViewValue(userId: string, value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(activeHomeViewStorageKey(userId), value);
  } catch {
    // The active selection is a convenience; server definitions remain durable.
  }
}

function getPromptHomeTemplateCardsSnapshotValue(): string {
  return JSON.stringify(
    promptHomeTemplateCardsToStorageCards(getPromptHomeTemplateCardsSnapshot()),
  );
}

function clonePromptHomeTemplateCard(
  card: PromptHomeTemplateCard,
  args: {
    instanceId?: string;
    order: number;
    visible: boolean;
    placement?: PromptHomeCardPlacement;
    parameters?: Record<string, unknown>;
    filters?: Record<string, unknown>;
  },
): PromptHomeTemplateCard {
  const placement = args.placement ?? card.placement;
  return {
    instanceId: args.instanceId ?? getPromptHomeCardInstanceId(card),
    cardId: card.cardId,
    visible: args.visible,
    placement: {
      order: args.order,
      columnSpan: placement.columnSpan,
      rowSpan: placement.rowSpan,
      collapsedColumnSpan: placement.collapsedColumnSpan,
      collapsedRowSpan: placement.collapsedRowSpan,
      expandedColumnSpan: placement.expandedColumnSpan,
      expandedRowSpan: placement.expandedRowSpan,
    },
    parameters: args.parameters ? { ...args.parameters } : { ...card.parameters },
    filters: args.filters ? { ...args.filters } : { ...card.filters },
    dataBindings: [...card.dataBindings],
  };
}

export function buildPromptHomeCardsFromOrderAndHidden(
  order: readonly string[],
  hidden: readonly string[],
  baseCards: readonly PromptHomeTemplateCard[] = PROMPT_HOME_SYSTEM_TEMPLATE.cards,
): PromptHomeTemplateCard[] {
  const normalizedBaseCards = normalizePromptHomeTemplateCards(baseCards);
  const cardsByKey = new Map<PromptHomeCardKey, PromptHomeTemplateCard>(
    normalizedBaseCards.map((card) => [card.cardId, card]),
  );
  const normalizedOrder = normalizePromptHomeCardOrder([...order]);
  const normalizedHiddenKeys = normalizePromptHomeHiddenCardKeys([...hidden]);
  const hiddenKeySet = new Set<PromptHomeCardKey>(normalizedHiddenKeys);

  return normalizedOrder.map((cardKey, index) =>
    clonePromptHomeTemplateCard(
      cardsByKey.get(cardKey) ??
        PROMPT_HOME_SYSTEM_TEMPLATE.cards.find((card) => card.cardId === cardKey) ??
        normalizedBaseCards[index] ??
        PROMPT_HOME_SYSTEM_TEMPLATE.cards[index]!,
      {
        order: index,
        visible: !hiddenKeySet.has(cardKey),
      },
    ),
  );
}

export function buildPromptHomeCardsFromLocalPreferences(): PromptHomeTemplateCard[] {
  return getPromptHomeTemplateCardsSnapshot();
}

export function promptHomeTemplateCardsToOrderAndHidden(
  cards: readonly PromptHomeTemplateCard[],
): {
  order: PromptHomeCardKey[];
  hidden: PromptHomeCardKey[];
} {
  const normalizedCards = normalizePromptHomeTemplateCards(cards);
  const orderedCardKeys: PromptHomeCardKey[] = [];

  return {
    order: normalizedCards.reduce<PromptHomeCardKey[]>((order, card) => {
      if (!orderedCardKeys.includes(card.cardId)) {
        orderedCardKeys.push(card.cardId);
        order.push(card.cardId);
      }
      return order;
    }, []),
    hidden: PROMPT_HOME_CARD_KEYS.filter((cardKey) =>
      normalizedCards
        .filter((card) => card.cardId === cardKey)
        .every((card) => !card.visible),
    ),
  };
}

function savePromptHomeTemplateCardsToLocalStorage(
  cards: readonly PromptHomeTemplateCard[],
): void {
  const normalizedCards = normalizePromptHomeTemplateCards(cards);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        PROMPT_HOME_TEMPLATE_CARDS_STORAGE_KEY,
        JSON.stringify({
          cards: promptHomeTemplateCardsToStorageCards(normalizedCards),
        }),
      );
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event(PROMPT_HOME_TEMPLATE_CARDS_STORAGE_EVENT));
      }
    } catch {
      // Keep the legacy preference write below as a small fallback.
    }
  }

  const { hidden, order } = promptHomeTemplateCardsToOrderAndHidden(cards);
  savePromptHomeCardOrder(order);
  savePromptHomeHiddenCardKeys(hidden);
}

export function normalizePromptHomeCardsFromDefinition(
  definition: Pick<HomeViewDefinition, "cards">,
): PromptHomeTemplateCard[] {
  return normalizePromptHomeTemplateCards(
    definition.cards.map(homeViewCardPayloadToPromptHomeCard),
  );
}

function normalizePromptHomeCardsFromSystemTemplate(
  systemTemplate: Awaited<ReturnType<typeof loadHomeViewSystemTemplate>>,
): PromptHomeTemplateCard[] {
  return normalizePromptHomeTemplateCards(
    systemTemplate.cards.map(homeViewCardPayloadToPromptHomeCard),
  );
}

function createHomeViewPayload(args: {
  name?: string;
  cards: readonly PromptHomeTemplateCard[];
  personaHint?: HomeViewDefinition["persona_hint"];
}): HomeViewDefinitionCreatePayload {
  return {
    name: args.name ?? PROMPT_HOME_DEFAULT_PERSONAL_VIEW_NAME,
    scope: "PERSONAL" as const,
    base_template_key: PROMPT_HOME_SYSTEM_TEMPLATE_KEY,
    base_template_version: PROMPT_HOME_SYSTEM_TEMPLATE_VERSION,
    persona_hint: args.personaHint ?? null,
    cards: args.cards.map(toHomeViewCardPayload),
    global_filters: {},
  };
}

function upsertHomeViewDefinition(
  definitions: readonly HomeViewDefinition[],
  definition: HomeViewDefinition,
): HomeViewDefinition[] {
  const withoutDefinition = definitions.filter(
    (candidate) => candidate.definition_id !== definition.definition_id,
  );
  return [definition, ...withoutDefinition];
}

function findHomeViewDefinition(
  definitions: readonly HomeViewDefinition[],
  definitionId: number | null,
): HomeViewDefinition | null {
  if (definitionId === null) {
    return null;
  }

  return (
    definitions.find((definition) => definition.definition_id === definitionId) ??
    null
  );
}

function resolveActiveHomeViewDefinitionId(
  userId: string,
  definitions: readonly HomeViewDefinition[],
): number | null {
  const storedValue = getStoredActiveHomeViewValue(userId);
  if (storedValue === PROMPT_HOME_SYSTEM_VIEW_VALUE) {
    return null;
  }

  const storedDefinitionId = storedValue
    ? parseHomeViewDefinitionValue(storedValue)
    : null;
  if (
    storedDefinitionId !== null &&
    definitions.some(
      (definition) => definition.definition_id === storedDefinitionId,
    )
  ) {
    return storedDefinitionId;
  }

  const defaultDefinition =
    definitions.find((definition) => definition.scope === "PERSONAL") ??
    definitions[0] ??
    null;

  return defaultDefinition?.definition_id ?? null;
}

function formatPromptHomeViewScopeDetail(definition: HomeViewDefinition): string {
  if (definition.scope === "PERSONAL") {
    return `Personal · v${definition.version}`;
  }
  if (definition.scope === "TEAM") {
    return `Team · ${definition.scope_owner_key.replace(/^team:/, "")} · v${definition.version}`;
  }
  return `Organization · v${definition.version}`;
}

export function savePromptHomeHiddenCardKeys(
  cardKeys: readonly string[],
): PromptHomeCardKey[] {
  const hiddenKeys = normalizePromptHomeHiddenCardKeys([...cardKeys]);

  if (typeof window !== "undefined") {
    try {
      if (hiddenKeys.length > 0) {
        window.localStorage.setItem(
          PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY,
          JSON.stringify({ hidden: hiddenKeys }),
        );
      } else {
        window.localStorage.removeItem(PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY);
      }

      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(
          new Event(PROMPT_HOME_CARD_VISIBILITY_STORAGE_EVENT),
        );
      }
    } catch {
      // Ignore persistence failures and keep the default card set available.
    }
  }

  return hiddenKeys;
}

function promptHomeCardOrderMatchesDefault(cardKeys: PromptHomeCardKey[]) {
  return (
    cardKeys.length === PROMPT_HOME_CARD_KEYS.length &&
    cardKeys.every((cardKey, index) => cardKey === PROMPT_HOME_CARD_KEYS[index])
  );
}

export function savePromptHomeCardOrder(
  cardKeys: readonly string[],
): PromptHomeCardKey[] {
  const orderedKeys = normalizePromptHomeCardOrder([...cardKeys]);

  if (typeof window !== "undefined") {
    try {
      if (promptHomeCardOrderMatchesDefault(orderedKeys)) {
        window.localStorage.removeItem(PROMPT_HOME_CARD_ORDER_STORAGE_KEY);
      } else {
        window.localStorage.setItem(
          PROMPT_HOME_CARD_ORDER_STORAGE_KEY,
          JSON.stringify({ order: orderedKeys }),
        );
      }

      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new Event(PROMPT_HOME_CARD_ORDER_STORAGE_EVENT));
      }
    } catch {
      // Ignore persistence failures and keep the default card order available.
    }
  }

  return orderedKeys;
}

function subscribeToPromptHomeTemplateCards(
  onStoreChange: () => void,
): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.addEventListener !== "function" ||
    typeof window.removeEventListener !== "function"
  ) {
    return () => undefined;
  }

  const handleStoreEvent = (event: Event) => {
    if (event.type === "storage") {
      const storageEvent = event as StorageEvent;
      if (
        typeof storageEvent.key === "string" &&
        storageEvent.key !== PROMPT_HOME_TEMPLATE_CARDS_STORAGE_KEY &&
        storageEvent.key !== PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY &&
        storageEvent.key !== PROMPT_HOME_CARD_ORDER_STORAGE_KEY
      ) {
        return;
      }
    }

    onStoreChange();
  };

  window.addEventListener(
    PROMPT_HOME_TEMPLATE_CARDS_STORAGE_EVENT,
    handleStoreEvent,
  );
  window.addEventListener(
    PROMPT_HOME_CARD_VISIBILITY_STORAGE_EVENT,
    handleStoreEvent,
  );
  window.addEventListener(PROMPT_HOME_CARD_ORDER_STORAGE_EVENT, handleStoreEvent);
  window.addEventListener("storage", handleStoreEvent);

  return () => {
    window.removeEventListener(
      PROMPT_HOME_TEMPLATE_CARDS_STORAGE_EVENT,
      handleStoreEvent,
    );
    window.removeEventListener(
      PROMPT_HOME_CARD_VISIBILITY_STORAGE_EVENT,
      handleStoreEvent,
    );
    window.removeEventListener(
      PROMPT_HOME_CARD_ORDER_STORAGE_EVENT,
      handleStoreEvent,
    );
    window.removeEventListener("storage", handleStoreEvent);
  };
}

function reindexPromptHomeCards(
  cards: readonly PromptHomeTemplateCard[],
): PromptHomeTemplateCard[] {
  return normalizePromptHomeTemplateCards(cards).map((card, index) =>
    clonePromptHomeTemplateCard(card, {
      order: index,
      visible: card.visible,
    }),
  );
}

function clonePromptHomeCardsSnapshot(
  cards: readonly PromptHomeTemplateCard[],
): PromptHomeTemplateCard[] {
  return cards.map((card, index) =>
    clonePromptHomeTemplateCard(card, {
      order: index,
      visible: card.visible,
    }),
  );
}

function findPromptHomeCardByInstanceId(
  cards: readonly PromptHomeTemplateCard[],
  instanceId: string,
): PromptHomeTemplateCard | null {
  return (
    cards.find((card) => getPromptHomeCardInstanceId(card) === instanceId) ??
    null
  );
}

function resolvePromptHomeCardInstanceId(
  cards: readonly PromptHomeTemplateCard[],
  instanceIdOrCardKey: string,
): string | null {
  if (
    cards.some((card) => getPromptHomeCardInstanceId(card) === instanceIdOrCardKey)
  ) {
    return instanceIdOrCardKey;
  }

  return (
    cards.find((card) => card.cardId === instanceIdOrCardKey)?.instanceId ??
    null
  );
}

function createPromptHomeCopyInstanceId(
  cards: readonly PromptHomeTemplateCard[],
  cardKey: PromptHomeCardKey,
): string {
  const usedInstanceIds = new Set(
    cards.map((card) => getPromptHomeCardInstanceId(card)),
  );
  let copyIndex =
    cards.filter((card) => card.cardId === cardKey).length + 1;

  while (copyIndex < 10_000) {
    const candidate = `${cardKey}-copy-${copyIndex}`;
    if (!usedInstanceIds.has(candidate)) {
      return candidate;
    }
    copyIndex += 1;
  }

  return `${cardKey}-copy-${Date.now().toString(36)}`;
}

function insertPromptHomeCardAfterInstance(
  cards: readonly PromptHomeTemplateCard[],
  sourceInstanceId: string,
  card: PromptHomeTemplateCard,
): PromptHomeTemplateCard[] {
  const nextCards = clonePromptHomeCardsSnapshot(cards);
  const sourceIndex = nextCards.findIndex(
    (candidate) => getPromptHomeCardInstanceId(candidate) === sourceInstanceId,
  );
  const insertIndex = sourceIndex === -1 ? nextCards.length : sourceIndex + 1;
  nextCards.splice(insertIndex, 0, card);
  return reindexPromptHomeCards(nextCards);
}

function insertPromptHomeCardAtEnd(
  cards: readonly PromptHomeTemplateCard[],
  card: PromptHomeTemplateCard,
): PromptHomeTemplateCard[] {
  const nextCards = clonePromptHomeCardsSnapshot(cards);
  let lastVisibleIndex = -1;
  for (let index = nextCards.length - 1; index >= 0; index -= 1) {
    if (nextCards[index]?.visible) {
      lastVisibleIndex = index;
      break;
    }
  }
  nextCards.splice(lastVisibleIndex === -1 ? 0 : lastVisibleIndex + 1, 0, card);
  return reindexPromptHomeCards(nextCards);
}

function movePromptHomeCardInstance(
  cards: readonly PromptHomeTemplateCard[],
  activeInstanceId: string,
  overInstanceId: string,
): PromptHomeTemplateCard[] {
  const normalizedCards = clonePromptHomeCardsSnapshot(cards);
  const activeCard = findPromptHomeCardByInstanceId(
    normalizedCards,
    activeInstanceId,
  );
  const overCard = findPromptHomeCardByInstanceId(normalizedCards, overInstanceId);
  if (!activeCard || !overCard || activeInstanceId === overInstanceId) {
    return normalizedCards;
  }

  const activeIndex = normalizedCards.findIndex(
    (card) => getPromptHomeCardInstanceId(card) === activeInstanceId,
  );
  const overIndex = normalizedCards.findIndex(
    (card) => getPromptHomeCardInstanceId(card) === overInstanceId,
  );
  if (activeIndex === -1 || overIndex === -1) {
    return normalizedCards;
  }

  const nextCards = [...normalizedCards];
  const [removedCard] = nextCards.splice(activeIndex, 1);
  if (!removedCard) {
    return normalizedCards;
  }

  const nextOverIndex = nextCards.findIndex(
    (card) => getPromptHomeCardInstanceId(card) === overInstanceId,
  );
  nextCards.splice(nextOverIndex === -1 ? overIndex : nextOverIndex, 0, removedCard);
  return reindexPromptHomeCards(nextCards);
}

export function deletePromptHomeCardInstance(
  cards: readonly PromptHomeTemplateCard[],
  instanceId: string,
): PromptHomeTemplateCard[] {
  const normalizedCards = clonePromptHomeCardsSnapshot(cards);
  const sourceCard = findPromptHomeCardByInstanceId(normalizedCards, instanceId);
  if (!sourceCard) {
    return normalizedCards;
  }

  const sameKindCount = normalizedCards.filter(
    (card) => card.cardId === sourceCard.cardId,
  ).length;
  if (sameKindCount > 1) {
    return reindexPromptHomeCards(
      normalizedCards.filter(
        (card) => getPromptHomeCardInstanceId(card) !== instanceId,
      ),
    );
  }

  return reindexPromptHomeCards(
    normalizedCards.map((card, index) =>
      clonePromptHomeTemplateCard(card, {
        order: index,
        visible:
          getPromptHomeCardInstanceId(card) === instanceId
            ? false
            : card.visible,
      }),
    ),
  );
}

function shiftPromptHomeCardHorizontalSpan(
  value: PromptHomeCardHorizontalSpan,
  direction: PromptHomeCardSizeDirection,
): PromptHomeCardHorizontalSpan {
  const nextValue = value + (direction === "increase" ? 1 : -1);
  if (nextValue <= PROMPT_HOME_CARD_MIN_SPAN) {
    return PROMPT_HOME_CARD_MIN_SPAN;
  }
  if (nextValue >= PROMPT_HOME_CARD_MAX_HORIZONTAL_SPAN) {
    return PROMPT_HOME_CARD_MAX_HORIZONTAL_SPAN;
  }
  return nextValue as PromptHomeCardHorizontalSpan;
}

function shiftPromptHomeCardVerticalSpan(
  value: PromptHomeCardVerticalSpan,
  direction: PromptHomeCardSizeDirection,
  maxSpan: number,
): PromptHomeCardVerticalSpan {
  const nextValue = value + (direction === "increase" ? 1 : -1);
  if (nextValue <= PROMPT_HOME_CARD_MIN_SPAN) {
    return PROMPT_HOME_CARD_MIN_SPAN;
  }
  if (nextValue >= maxSpan) {
    return maxSpan as PromptHomeCardVerticalSpan;
  }
  return nextValue as PromptHomeCardVerticalSpan;
}

function normalizePromptHomeCardHorizontalSpan(
  value: number,
): PromptHomeCardHorizontalSpan {
  const roundedValue = Math.round(value);
  if (roundedValue <= PROMPT_HOME_CARD_MIN_SPAN) {
    return PROMPT_HOME_CARD_MIN_SPAN;
  }
  if (roundedValue >= PROMPT_HOME_CARD_MAX_HORIZONTAL_SPAN) {
    return PROMPT_HOME_CARD_MAX_HORIZONTAL_SPAN;
  }
  return roundedValue as PromptHomeCardHorizontalSpan;
}

function normalizePromptHomeCardVerticalSpan(
  value: number,
  maxSpan: number,
): PromptHomeCardVerticalSpan {
  const roundedValue = Math.round(value);
  if (roundedValue <= PROMPT_HOME_CARD_MIN_SPAN) {
    return PROMPT_HOME_CARD_MIN_SPAN;
  }
  if (roundedValue >= maxSpan) {
    return maxSpan as PromptHomeCardVerticalSpan;
  }
  return roundedValue as PromptHomeCardVerticalSpan;
}

export function resizePromptHomeCardPlacement(
  placement: PromptHomeCardPlacement,
  state: PromptHomeCardSizeState,
  axis: PromptHomeCardSizeAxis,
  direction: PromptHomeCardSizeDirection,
): PromptHomeCardPlacement {
  const nextPlacement = { ...placement };

  if (axis === "horizontal") {
    const nextColumnSpan = shiftPromptHomeCardHorizontalSpan(
      placement.expandedColumnSpan,
      direction,
    );
    nextPlacement.collapsedColumnSpan = nextColumnSpan;
    nextPlacement.expandedColumnSpan = nextColumnSpan;
  } else if (state === "collapsed") {
    nextPlacement.collapsedRowSpan = shiftPromptHomeCardVerticalSpan(
      placement.collapsedRowSpan,
      direction,
      PROMPT_HOME_CARD_MAX_COLLAPSED_ROW_SPAN,
    );
  } else {
    nextPlacement.expandedRowSpan = shiftPromptHomeCardVerticalSpan(
      placement.expandedRowSpan,
      direction,
      PROMPT_HOME_CARD_MAX_EXPANDED_ROW_SPAN,
    );
  }

  return {
    ...nextPlacement,
    columnSpan: nextPlacement.expandedColumnSpan,
    rowSpan: nextPlacement.expandedRowSpan,
  };
}

export function resizePromptHomeCardPlacementToSpan(
  placement: PromptHomeCardPlacement,
  state: PromptHomeCardSizeState,
  axis: PromptHomeCardSizeAxis,
  span: number,
): PromptHomeCardPlacement {
  const nextPlacement = { ...placement };

  if (axis === "horizontal") {
    const nextColumnSpan = normalizePromptHomeCardHorizontalSpan(span);
    nextPlacement.collapsedColumnSpan = nextColumnSpan;
    nextPlacement.expandedColumnSpan = nextColumnSpan;
  } else if (state === "collapsed") {
    nextPlacement.collapsedRowSpan = normalizePromptHomeCardVerticalSpan(
      span,
      PROMPT_HOME_CARD_MAX_COLLAPSED_ROW_SPAN,
    );
  } else {
    nextPlacement.expandedRowSpan = normalizePromptHomeCardVerticalSpan(
      span,
      PROMPT_HOME_CARD_MAX_EXPANDED_ROW_SPAN,
    );
  }

  return {
    ...nextPlacement,
    columnSpan: nextPlacement.expandedColumnSpan,
    rowSpan: nextPlacement.expandedRowSpan,
  };
}

export function usePersistentPromptHomeCardVisibility(
  options: UsePersistentPromptHomeCardVisibilityOptions = {},
): {
  homeViewOptions: PromptHomeViewOption[];
  activeHomeViewValue: string;
  activeHomeViewName: string;
  activeHomeViewDetail: string;
  canEditCards: boolean;
  canManageHomeViews: boolean;
  canRenameActiveHomeView: boolean;
  canDeleteActiveHomeView: boolean;
  canPublishActiveHomeView: boolean;
  canRetireActiveHomeView: boolean;
  canResetHomeView: boolean;
  selectHomeView: (value: string) => void;
  saveHomeViewAs: (name: string) => void;
  renameActiveHomeView: (name: string) => void;
  deleteActiveHomeView: () => void;
  publishActiveHomeView: (name?: string) => void;
  retireActiveHomeView: () => void;
  getCard: (cardKey: PromptHomeCardKey) => PromptHomeTemplateCard | null;
  getCardByInstanceId: (instanceId: string) => PromptHomeTemplateCard | null;
  updateCardConfiguration: (
    cardKey: PromptHomeCardKey,
    patch: PromptHomeCardConfigurationPatch,
  ) => void;
  updateCardInstanceConfiguration: (
    instanceId: string,
    patch: PromptHomeCardConfigurationPatch,
  ) => void;
  hiddenCardKeys: PromptHomeCardKey[];
  visibleCardKeys: PromptHomeCardKey[];
  visibleCards: PromptHomeTemplateCard[];
  visibleCardInstanceIds: string[];
  isCardVisible: (cardKey: PromptHomeCardKey) => boolean;
  setCardVisible: (cardKey: PromptHomeCardKey, visible: boolean) => void;
  moveCard: (activeCardKey: string, overCardKey: string) => void;
  resizeCardInstance: (
    instanceId: string,
    state: PromptHomeCardSizeState,
    axis: PromptHomeCardSizeAxis,
    direction: PromptHomeCardSizeDirection,
  ) => void;
  resizeCardInstanceToSpan: (
    instanceId: string,
    state: PromptHomeCardSizeState,
    axis: PromptHomeCardSizeAxis,
    span: number,
  ) => void;
  deleteCardInstance: (instanceId: string) => void;
  cardClipboard: PromptHomeCardClipboard | null;
  copyCardInstance: (instanceId: string) => void;
  cutCardInstance: (instanceId: string) => void;
  duplicateCardInstance: (instanceId: string) => void;
  pasteCardFromClipboard: () => void;
  clearCardClipboard: () => void;
  canUndoLastCardAction: boolean;
  lastCardActionLabel: string;
  undoLastCardAction: () => void;
  showAllCards: () => void;
  resetHomeView: () => void;
  persistenceStatus: PromptHomeCardPersistenceStatus;
  persistenceLabel: string;
  persistenceDetail: string;
  persistenceError: string;
} {
  const apiBase = options.apiBase ?? "";
  const accessToken = options.authSession?.accessToken ?? "";
  const userId = options.authSession?.user.user_id ?? "";
  const personaHint = options.authSession?.user.default_assistant_persona ?? null;
  const loadRunRef = useRef(0);
  const saveRunRef = useRef(0);
  const [personalHomeViewState, setPersonalHomeViewState] =
    useState<PersonalHomeViewState>({
      definitions: [],
      activeDefinitionId: null,
      cards: null,
      systemCards: null,
      loading: false,
      saving: false,
      fallback: false,
      error: "",
    });
  const [cardClipboardState, setCardClipboardState] =
    useState<PromptHomeCardClipboardState | null>(null);
  const [lastUndoState, setLastUndoState] =
    useState<PromptHomeCardUndoState | null>(null);
  const localTemplateCardSnapshot = useSyncExternalStore(
    subscribeToPromptHomeTemplateCards,
    getPromptHomeTemplateCardsSnapshotValue,
    () =>
      JSON.stringify(
        promptHomeTemplateCardsToStorageCards(PROMPT_HOME_SYSTEM_TEMPLATE.cards),
      ),
  );
  const localCards = useMemo(
    () => {
      try {
        return normalizePromptHomeTemplateCards(
          JSON.parse(localTemplateCardSnapshot),
        );
      } catch {
        return normalizePromptHomeTemplateCards(PROMPT_HOME_SYSTEM_TEMPLATE.cards);
      }
    },
    [localTemplateCardSnapshot],
  );

  useEffect(() => {
    loadRunRef.current += 1;
    const runId = loadRunRef.current;

    if (!apiBase || !accessToken || !userId) {
      setPersonalHomeViewState({
        definitions: [],
        activeDefinitionId: null,
        cards: null,
        systemCards: null,
        loading: false,
        saving: false,
        fallback: false,
        error: "",
      });
      return;
    }

    setPersonalHomeViewState((current) => ({
      ...current,
      loading: true,
      fallback: false,
      error: "",
    }));

    void (async () => {
      try {
        const [systemTemplate, definitions] = await Promise.all([
          loadHomeViewSystemTemplate(apiBase, accessToken),
          listHomeViewDefinitions(apiBase, accessToken),
        ]);
        let definition =
          definitions.find((candidate) => candidate.scope === "PERSONAL") ??
          definitions[0] ??
          null;

        if (
          !definitions.some((candidate) => candidate.scope === "PERSONAL") &&
          !defaultPersonalViewWasMigrated(userId)
        ) {
          const systemCards =
            normalizePromptHomeCardsFromSystemTemplate(systemTemplate);
          const shouldMigrateLocalPreferences =
            promptHomeLocalPreferencesExist();
          const seedCards = shouldMigrateLocalPreferences
            ? buildPromptHomeCardsFromLocalPreferences()
            : systemCards;

          try {
            definition = await createHomeViewDefinition(
              apiBase,
              accessToken,
              createHomeViewPayload({
                cards: seedCards,
                personaHint,
              }),
            );
            markDefaultPersonalViewMigrated(userId);
            definitions.unshift(definition);
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              const refreshedDefinitions = await listHomeViewDefinitions(
                apiBase,
                accessToken,
              );
              definitions.splice(0, definitions.length, ...refreshedDefinitions);
              definition =
                definitions.find((candidate) => candidate.scope === "PERSONAL") ??
                definitions[0] ??
                null;
            } else {
              throw error;
            }
          }
        }

        if (loadRunRef.current !== runId) {
          return;
        }

        const systemCards =
          normalizePromptHomeCardsFromSystemTemplate(systemTemplate);
        const activeDefinitionId = resolveActiveHomeViewDefinitionId(
          userId,
          definitions,
        );
        const activeDefinition = findHomeViewDefinition(
          definitions,
          activeDefinitionId,
        );
        const nextCards = activeDefinition
          ? normalizePromptHomeCardsFromDefinition(activeDefinition)
          : systemCards;
        savePromptHomeTemplateCardsToLocalStorage(nextCards);

        setPersonalHomeViewState({
          definitions,
          activeDefinitionId,
          cards: nextCards,
          systemCards,
          loading: false,
          saving: false,
          fallback: false,
          error: "",
        });
      } catch (error) {
        if (loadRunRef.current !== runId) {
          return;
        }

        setPersonalHomeViewState({
          definitions: [],
          activeDefinitionId: null,
          cards: null,
          systemCards: null,
          loading: false,
          saving: false,
          fallback: true,
          error:
            error instanceof Error
              ? error.message
              : "Could not load the personal Home view.",
        });
      }
    })();
  }, [accessToken, apiBase, personaHint, userId]);

  const cards = useMemo(
    () =>
      personalHomeViewState.cards && !personalHomeViewState.fallback
        ? personalHomeViewState.cards
        : localCards,
    [localCards, personalHomeViewState.cards, personalHomeViewState.fallback],
  );
  const hiddenCardKeys = useMemo(
    () =>
      PROMPT_HOME_CARD_KEYS.filter((cardKey) =>
        cards
          .filter((card) => card.cardId === cardKey)
          .every((card) => !card.visible),
      ),
    [cards],
  );
  const hiddenCardKeySet = useMemo(
    () => new Set<PromptHomeCardKey>(hiddenCardKeys),
    [hiddenCardKeys],
  );
  const visibleCards = useMemo(
    () => cards.filter((card) => card.visible),
    [cards],
  );
  const visibleCardKeys = useMemo(
    () => visibleCards.map((card) => card.cardId),
    [visibleCards],
  );
  const visibleCardInstanceIds = useMemo(
    () => visibleCards.map((card) => getPromptHomeCardInstanceId(card)),
    [visibleCards],
  );
  const isCardVisible = useCallback(
    (cardKey: PromptHomeCardKey) => !hiddenCardKeySet.has(cardKey),
    [hiddenCardKeySet],
  );
  const activeHomeViewDefinition = useMemo(
    () =>
      findHomeViewDefinition(
        personalHomeViewState.definitions,
        personalHomeViewState.activeDefinitionId,
      ),
    [personalHomeViewState.activeDefinitionId, personalHomeViewState.definitions],
  );
  const activeHomeViewIsSystem =
    Boolean(accessToken) &&
    !personalHomeViewState.fallback &&
    !activeHomeViewDefinition;
  const activeHomeViewValue = activeHomeViewDefinition
    ? homeViewDefinitionValue(activeHomeViewDefinition)
    : activeHomeViewIsSystem
      ? PROMPT_HOME_SYSTEM_VIEW_VALUE
      : PROMPT_HOME_LOCAL_VIEW_VALUE;
  const activeHomeViewName =
    activeHomeViewDefinition?.name ??
    (activeHomeViewIsSystem ? "System Home" : "Local Home");
  const activeHomeViewDetail =
    activeHomeViewDefinition
      ? formatPromptHomeViewScopeDetail(activeHomeViewDefinition)
      : activeHomeViewIsSystem
        ? "Immutable system default"
        : "Browser-local fallback";
  const canEditCards = activeHomeViewDefinition
    ? activeHomeViewDefinition.can_edit
    : !activeHomeViewIsSystem;
  const canManageHomeViews =
    Boolean(apiBase && accessToken) && !personalHomeViewState.fallback;
  const canRenameActiveHomeView =
    canManageHomeViews && Boolean(activeHomeViewDefinition?.can_edit);
  const canDeleteActiveHomeView = canRenameActiveHomeView;
  const canPublishActiveHomeView =
    canManageHomeViews && Boolean(activeHomeViewDefinition?.can_publish);
  const canRetireActiveHomeView =
    canManageHomeViews && Boolean(activeHomeViewDefinition?.can_retire);
  const canResetHomeView =
    activeHomeViewDefinition
      ? activeHomeViewDefinition.can_edit
      : !activeHomeViewIsSystem;

  useEffect(() => {
    setCardClipboardState(null);
    setLastUndoState(null);
  }, [activeHomeViewValue]);

  const homeViewOptions = useMemo<PromptHomeViewOption[]>(() => {
    if (!accessToken || personalHomeViewState.fallback) {
      return [
        {
          value: PROMPT_HOME_LOCAL_VIEW_VALUE,
          label: "Local Home",
          detail: "Browser-local fallback",
          kind: "local",
          canEdit: true,
        },
      ];
    }

    return [
      {
        value: PROMPT_HOME_SYSTEM_VIEW_VALUE,
        label: "System Home",
        detail: "Immutable system default",
        kind: "system",
        canEdit: false,
      },
      ...personalHomeViewState.definitions.map((definition) => ({
        value: homeViewDefinitionValue(definition),
        label: definition.name,
        detail: formatPromptHomeViewScopeDetail(definition),
        kind: definition.is_shared ? "shared" as const : "personal" as const,
        canEdit: definition.can_edit,
      })),
    ];
  }, [accessToken, personalHomeViewState.definitions, personalHomeViewState.fallback]);
  const selectHomeView = useCallback(
    (value: string) => {
      if (!accessToken || personalHomeViewState.fallback) {
        return;
      }

      if (value === PROMPT_HOME_SYSTEM_VIEW_VALUE) {
        const systemCards =
          personalHomeViewState.systemCards ??
          normalizePromptHomeTemplateCards(PROMPT_HOME_SYSTEM_TEMPLATE.cards);
        saveActiveHomeViewValue(userId, PROMPT_HOME_SYSTEM_VIEW_VALUE);
        savePromptHomeTemplateCardsToLocalStorage(systemCards);
        setPersonalHomeViewState((current) => ({
          ...current,
          activeDefinitionId: null,
          cards: systemCards,
          error: "",
        }));
        return;
      }

      const definitionId = parseHomeViewDefinitionValue(value);
      const definition = findHomeViewDefinition(
        personalHomeViewState.definitions,
        definitionId,
      );
      if (!definition) {
        return;
      }

      const nextCards = normalizePromptHomeCardsFromDefinition(definition);
      saveActiveHomeViewValue(userId, homeViewDefinitionValue(definition));
      savePromptHomeTemplateCardsToLocalStorage(nextCards);
      setPersonalHomeViewState((current) => ({
        ...current,
        activeDefinitionId: definition.definition_id,
        cards: nextCards,
        error: "",
      }));
    },
    [
      accessToken,
      personalHomeViewState.definitions,
      personalHomeViewState.fallback,
      personalHomeViewState.systemCards,
      userId,
    ],
  );
  const persistCards = useCallback(
    (
      nextCards: readonly PromptHomeTemplateCard[],
      options: { undoLabel?: string } = {},
    ) => {
      if (activeHomeViewIsSystem) {
        setPersonalHomeViewState((current) => ({
          ...current,
          error: "System Home is immutable. Save it as a personal view before managing apps.",
        }));
        return;
      }
      if (activeHomeViewDefinition && !activeHomeViewDefinition.can_edit) {
        setPersonalHomeViewState((current) => ({
          ...current,
          error: "Shared Home views are read-only. Duplicate it before managing apps.",
        }));
        return;
      }

      const normalizedCards = normalizePromptHomeTemplateCards(nextCards);
      if (options.undoLabel) {
        setLastUndoState({
          label: options.undoLabel,
          cards: clonePromptHomeCardsSnapshot(cards),
        });
      }
      savePromptHomeTemplateCardsToLocalStorage(normalizedCards);

      const definitionId = activeHomeViewDefinition?.definition_id;
      if (
        !apiBase ||
        !accessToken ||
        !definitionId ||
        personalHomeViewState.fallback
      ) {
        setPersonalHomeViewState((current) => ({
          ...current,
          cards: normalizedCards,
          error: "",
        }));
        return;
      }

      const saveRunId = saveRunRef.current + 1;
      saveRunRef.current = saveRunId;
      setPersonalHomeViewState((current) => ({
        ...current,
        cards: normalizedCards,
        saving: true,
        error: "",
      }));

      void updateHomeViewDefinition(apiBase, accessToken, definitionId, {
        cards: normalizedCards.map(toHomeViewCardPayload),
      })
        .then((definition) => {
          if (saveRunRef.current !== saveRunId) {
            return;
          }

          setPersonalHomeViewState({
            definitions: upsertHomeViewDefinition(
              personalHomeViewState.definitions,
              definition,
            ),
            activeDefinitionId: definition.definition_id,
            cards: normalizePromptHomeCardsFromDefinition(definition),
            systemCards: personalHomeViewState.systemCards,
            loading: false,
            saving: false,
            fallback: false,
            error: "",
          });
        })
        .catch((error) => {
          if (saveRunRef.current !== saveRunId) {
            return;
          }

          setPersonalHomeViewState({
            definitions: [],
            activeDefinitionId: null,
            cards: null,
            systemCards: null,
            loading: false,
            saving: false,
            fallback: true,
            error:
              error instanceof Error
                ? error.message
                : "Could not save the personal Home view.",
          });
        });
    },
    [
      accessToken,
      activeHomeViewDefinition,
      activeHomeViewIsSystem,
      apiBase,
      cards,
      personalHomeViewState.definitions,
      personalHomeViewState.fallback,
      personalHomeViewState.systemCards,
    ],
  );
  const setCardVisible = useCallback(
    (cardKey: PromptHomeCardKey, visible: boolean) => {
      if (!cards.some((card) => card.cardId === cardKey)) {
        return;
      }

      persistCards(
        cards.map((card, index) =>
          clonePromptHomeTemplateCard(card, {
            order: index,
            visible: card.cardId === cardKey ? visible : card.visible,
          }),
        ),
        {
          undoLabel: visible
            ? `Enable ${PROMPT_HOME_CARD_VISIBILITY_OPTIONS.find((option) => option.key === cardKey)?.label ?? cardKey}`
            : `Disable ${PROMPT_HOME_CARD_VISIBILITY_OPTIONS.find((option) => option.key === cardKey)?.label ?? cardKey}`,
        },
      );
    },
    [cards, persistCards],
  );
  const getCard = useCallback(
    (cardKey: PromptHomeCardKey) =>
      cards.find((card) => card.cardId === cardKey && card.visible) ??
      cards.find((card) => card.cardId === cardKey) ??
      null,
    [cards],
  );
  const getCardByInstanceId = useCallback(
    (instanceId: string) => findPromptHomeCardByInstanceId(cards, instanceId),
    [cards],
  );
  const updateCardConfiguration = useCallback(
    (cardKey: PromptHomeCardKey, patch: PromptHomeCardConfigurationPatch) => {
      if (!cards.some((card) => card.cardId === cardKey)) {
        return;
      }

      persistCards(
        cards.map((card, index) =>
          clonePromptHomeTemplateCard(card, {
            order: index,
            visible: card.visible,
            parameters:
              card.cardId === cardKey ? patch.parameters : card.parameters,
            filters: card.cardId === cardKey ? patch.filters : card.filters,
          }),
        ),
      );
    },
    [cards, persistCards],
  );
  const updateCardInstanceConfiguration = useCallback(
    (instanceId: string, patch: PromptHomeCardConfigurationPatch) => {
      const resolvedInstanceId = resolvePromptHomeCardInstanceId(
        cards,
        instanceId,
      );
      if (!resolvedInstanceId) {
        return;
      }

      persistCards(
        cards.map((card, index) => {
          const cardInstanceId = getPromptHomeCardInstanceId(card);
          return clonePromptHomeTemplateCard(card, {
            order: index,
            visible: card.visible,
            parameters:
              cardInstanceId === resolvedInstanceId
                ? patch.parameters
                : card.parameters,
            filters:
              cardInstanceId === resolvedInstanceId
                ? patch.filters
                : card.filters,
          });
        }),
      );
    },
    [cards, persistCards],
  );
  const moveCard = useCallback((activeCardKey: string, overCardKey: string) => {
    const activeInstanceId = resolvePromptHomeCardInstanceId(
      cards,
      activeCardKey,
    );
    const overInstanceId = resolvePromptHomeCardInstanceId(cards, overCardKey);
    if (!activeInstanceId || !overInstanceId) {
      return;
    }

    const nextCards = movePromptHomeCardInstance(
      cards,
      activeInstanceId,
      overInstanceId,
    );
    if (
      nextCards.some(
        (card, index) =>
          getPromptHomeCardInstanceId(card) !==
          getPromptHomeCardInstanceId(cards[index] ?? card),
      )
    ) {
      persistCards(nextCards, { undoLabel: "Reorder apps" });
    }
  }, [cards, persistCards]);
  const resizeCardInstance = useCallback(
    (
      instanceId: string,
      state: PromptHomeCardSizeState,
      axis: PromptHomeCardSizeAxis,
      direction: PromptHomeCardSizeDirection,
    ) => {
      const resolvedInstanceId = resolvePromptHomeCardInstanceId(cards, instanceId);
      if (!resolvedInstanceId) {
        return;
      }
      const sourceCard = findPromptHomeCardByInstanceId(cards, resolvedInstanceId);
      if (!sourceCard) {
        return;
      }

      const resizedPlacement = resizePromptHomeCardPlacement(
        sourceCard.placement,
        state,
        axis,
        direction,
      );
      if (JSON.stringify(resizedPlacement) === JSON.stringify(sourceCard.placement)) {
        return;
      }

      const nextCards = cards.map((card, index) => {
        const cardInstanceId = getPromptHomeCardInstanceId(card);
        if (cardInstanceId !== resolvedInstanceId) {
          return clonePromptHomeTemplateCard(card, {
            order: index,
            visible: card.visible,
          });
        }

        return clonePromptHomeTemplateCard(card, {
          order: index,
          visible: card.visible,
          placement: resizedPlacement,
        });
      });

      persistCards(nextCards, {
        undoLabel: `Resize ${getPromptHomeCardLabel(sourceCard.cardId)}`,
      });
    },
    [cards, persistCards],
  );
  const resizeCardInstanceToSpan = useCallback(
    (
      instanceId: string,
      state: PromptHomeCardSizeState,
      axis: PromptHomeCardSizeAxis,
      span: number,
    ) => {
      const resolvedInstanceId = resolvePromptHomeCardInstanceId(cards, instanceId);
      if (!resolvedInstanceId) {
        return;
      }
      const sourceCard = findPromptHomeCardByInstanceId(cards, resolvedInstanceId);
      if (!sourceCard) {
        return;
      }

      const resizedPlacement = resizePromptHomeCardPlacementToSpan(
        sourceCard.placement,
        state,
        axis,
        span,
      );
      if (JSON.stringify(resizedPlacement) === JSON.stringify(sourceCard.placement)) {
        return;
      }

      const nextCards = cards.map((card, index) => {
        const cardInstanceId = getPromptHomeCardInstanceId(card);
        if (cardInstanceId !== resolvedInstanceId) {
          return clonePromptHomeTemplateCard(card, {
            order: index,
            visible: card.visible,
          });
        }

        return clonePromptHomeTemplateCard(card, {
          order: index,
          visible: card.visible,
          placement: resizedPlacement,
        });
      });

      persistCards(nextCards, {
        undoLabel: `Resize ${getPromptHomeCardLabel(sourceCard.cardId)}`,
      });
    },
    [cards, persistCards],
  );
  const deleteCardInstance = useCallback((instanceId: string) => {
    const resolvedInstanceId = resolvePromptHomeCardInstanceId(cards, instanceId);
    if (!resolvedInstanceId) {
      return;
    }
    const card = findPromptHomeCardByInstanceId(cards, resolvedInstanceId);
    if (!card) {
      return;
    }

    const nextCards = deletePromptHomeCardInstance(cards, resolvedInstanceId);
    if (
      JSON.stringify(promptHomeTemplateCardsToStorageCards(nextCards)) ===
      JSON.stringify(promptHomeTemplateCardsToStorageCards(cards))
    ) {
      return;
    }

    persistCards(nextCards, {
      undoLabel: `Delete ${getPromptHomeCardLabel(card.cardId)}`,
    });
    setCardClipboardState((current) =>
      current?.sourceInstanceId === resolvedInstanceId ? null : current,
    );
  }, [cards, persistCards]);
  const cardClipboard = useMemo<PromptHomeCardClipboard | null>(
    () =>
      cardClipboardState
        ? {
            mode: cardClipboardState.mode,
            sourceInstanceId: cardClipboardState.sourceInstanceId,
            cardId: cardClipboardState.cardId,
            label: cardClipboardState.label,
          }
        : null,
    [cardClipboardState],
  );
  const copyCardInstance = useCallback((instanceId: string) => {
    const resolvedInstanceId = resolvePromptHomeCardInstanceId(cards, instanceId);
    if (!resolvedInstanceId) {
      return;
    }
    const card = findPromptHomeCardByInstanceId(cards, resolvedInstanceId);
    if (!card) {
      return;
    }

    setCardClipboardState({
      mode: "copy",
      sourceInstanceId: resolvedInstanceId,
      cardId: card.cardId,
      label: getPromptHomeCardLabel(card.cardId),
      card: clonePromptHomeTemplateCard(card, {
        order: card.placement.order,
        visible: true,
      }),
    });
  }, [cards]);
  const cutCardInstance = useCallback((instanceId: string) => {
    const resolvedInstanceId = resolvePromptHomeCardInstanceId(cards, instanceId);
    if (!resolvedInstanceId) {
      return;
    }
    const card = findPromptHomeCardByInstanceId(cards, resolvedInstanceId);
    if (!card) {
      return;
    }

    setCardClipboardState({
      mode: "cut",
      sourceInstanceId: resolvedInstanceId,
      cardId: card.cardId,
      label: getPromptHomeCardLabel(card.cardId),
      card: clonePromptHomeTemplateCard(card, {
        order: card.placement.order,
        visible: true,
      }),
    });
    persistCards(
      cards.map((candidate, index) =>
        clonePromptHomeTemplateCard(candidate, {
          order: index,
          visible:
            getPromptHomeCardInstanceId(candidate) === resolvedInstanceId
              ? false
              : candidate.visible,
        }),
      ),
      { undoLabel: `Cut ${getPromptHomeCardLabel(card.cardId)}` },
    );
  }, [cards, persistCards]);
  const duplicateCardInstance = useCallback((instanceId: string) => {
    const resolvedInstanceId = resolvePromptHomeCardInstanceId(cards, instanceId);
    if (!resolvedInstanceId) {
      return;
    }
    const card = findPromptHomeCardByInstanceId(cards, resolvedInstanceId);
    if (!card) {
      return;
    }

    const nextInstanceId = createPromptHomeCopyInstanceId(cards, card.cardId);
    const copiedCard = clonePromptHomeTemplateCard(card, {
      instanceId: nextInstanceId,
      order: card.placement.order + 1,
      visible: true,
    });
    persistCards(
      insertPromptHomeCardAfterInstance(cards, resolvedInstanceId, copiedCard),
      { undoLabel: `Duplicate ${getPromptHomeCardLabel(card.cardId)}` },
    );
    setCardClipboardState(null);
  }, [cards, persistCards]);
  const pasteCardFromClipboard = useCallback(() => {
    if (!cardClipboardState) {
      return;
    }

    if (cardClipboardState.mode === "copy") {
      const nextInstanceId = createPromptHomeCopyInstanceId(
        cards,
        cardClipboardState.cardId,
      );
      const copiedCard = clonePromptHomeTemplateCard(cardClipboardState.card, {
        instanceId: nextInstanceId,
        order: cards.length,
        visible: true,
      });
      persistCards(insertPromptHomeCardAtEnd(cards, copiedCard), {
        undoLabel: `Paste ${cardClipboardState.label}`,
      });
      return;
    }

    const sourceCard =
      findPromptHomeCardByInstanceId(cards, cardClipboardState.sourceInstanceId) ??
      cardClipboardState.card;
    const visibleSourceCard = clonePromptHomeTemplateCard(sourceCard, {
      order: cards.length,
      visible: true,
    });
    const cardsWithoutSource = cards.filter(
      (card) =>
        getPromptHomeCardInstanceId(card) !==
        cardClipboardState.sourceInstanceId,
    );
    persistCards(insertPromptHomeCardAtEnd(cardsWithoutSource, visibleSourceCard), {
      undoLabel: `Paste ${cardClipboardState.label}`,
    });
    setCardClipboardState(null);
  }, [cardClipboardState, cards, persistCards]);
  const clearCardClipboard = useCallback(() => {
    setCardClipboardState(null);
  }, []);
  const undoLastCardAction = useCallback(() => {
    if (!lastUndoState) {
      return;
    }

    const previousCards = lastUndoState.cards;
    setLastUndoState(null);
    setCardClipboardState(null);
    persistCards(previousCards);
  }, [lastUndoState, persistCards]);
  const showAllCards = useCallback(() => {
    persistCards(
      cards.map((card, index) =>
        clonePromptHomeTemplateCard(card, {
          order: index,
          visible: true,
        }),
      ),
      { undoLabel: "Enable all apps" },
    );
  }, [cards, persistCards]);
  const resetHomeView = useCallback(() => {
    const definitionId = activeHomeViewDefinition?.definition_id;
    setLastUndoState({
      label: "Reset Home",
      cards: clonePromptHomeCardsSnapshot(cards),
    });
    if (
      !apiBase ||
      !accessToken ||
      !definitionId ||
      personalHomeViewState.fallback
    ) {
      savePromptHomeTemplateCardsToLocalStorage(PROMPT_HOME_SYSTEM_TEMPLATE.cards);
      return;
    }

    const saveRunId = saveRunRef.current + 1;
    saveRunRef.current = saveRunId;
    setPersonalHomeViewState((current) => ({
      ...current,
      saving: true,
      error: "",
    }));

    void resetHomeViewDefinition(apiBase, accessToken, definitionId)
      .then((definition) => {
        if (saveRunRef.current !== saveRunId) {
          return;
        }

        const nextCards = normalizePromptHomeCardsFromDefinition(definition);
        savePromptHomeTemplateCardsToLocalStorage(nextCards);
        setPersonalHomeViewState({
          definitions: upsertHomeViewDefinition(
            personalHomeViewState.definitions,
            definition,
          ),
          activeDefinitionId: definition.definition_id,
          cards: nextCards,
          systemCards: personalHomeViewState.systemCards,
          loading: false,
          saving: false,
          fallback: false,
          error: "",
        });
      })
      .catch((error) => {
        if (saveRunRef.current !== saveRunId) {
          return;
        }

        savePromptHomeTemplateCardsToLocalStorage(PROMPT_HOME_SYSTEM_TEMPLATE.cards);
        setPersonalHomeViewState({
          definitions: [],
          activeDefinitionId: null,
          cards: null,
          systemCards: null,
          loading: false,
          saving: false,
          fallback: true,
          error:
            error instanceof Error
              ? error.message
              : "Could not reset the personal Home view.",
        });
      });
  }, [
    accessToken,
    activeHomeViewDefinition?.definition_id,
    apiBase,
    cards,
    personalHomeViewState.definitions,
    personalHomeViewState.fallback,
    personalHomeViewState.systemCards,
  ]);
  const saveHomeViewAs = useCallback(
    (name: string) => {
      const normalizedName = name.trim();
      if (!normalizedName) {
        setPersonalHomeViewState((current) => ({
          ...current,
          error: "Name the Home view before saving it.",
        }));
        return;
      }
      if (!apiBase || !accessToken || personalHomeViewState.fallback) {
        setPersonalHomeViewState((current) => ({
          ...current,
          error: "Sign in and reconnect the API before saving a Home view.",
        }));
        return;
      }

      const saveRunId = saveRunRef.current + 1;
      saveRunRef.current = saveRunId;
      setPersonalHomeViewState((current) => ({
        ...current,
        saving: true,
        error: "",
      }));

      const saveRequest =
        activeHomeViewDefinition?.is_shared
          ? duplicateHomeViewDefinition(
              apiBase,
              accessToken,
              activeHomeViewDefinition.definition_id,
              { name: normalizedName },
            )
          : createHomeViewDefinition(
              apiBase,
              accessToken,
              createHomeViewPayload({
                name: normalizedName,
                cards,
                personaHint,
              }),
            );

      void saveRequest
        .then((definition) => {
          if (saveRunRef.current !== saveRunId) {
            return;
          }

          const nextCards = normalizePromptHomeCardsFromDefinition(definition);
          markDefaultPersonalViewMigrated(userId);
          saveActiveHomeViewValue(userId, personalHomeViewValue(definition.definition_id));
          savePromptHomeTemplateCardsToLocalStorage(nextCards);
          setPersonalHomeViewState((current) => ({
            ...current,
            definitions: upsertHomeViewDefinition(
              current.definitions,
              definition,
            ),
            activeDefinitionId: definition.definition_id,
            cards: nextCards,
            loading: false,
            saving: false,
            fallback: false,
            error: "",
          }));
        })
        .catch((error) => {
          if (saveRunRef.current !== saveRunId) {
            return;
          }

          setPersonalHomeViewState((current) => ({
            ...current,
            saving: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not save the Home view.",
          }));
        });
    },
    [
      accessToken,
      activeHomeViewDefinition,
      apiBase,
      cards,
      personaHint,
      personalHomeViewState.fallback,
      userId,
    ],
  );
  const renameActiveHomeView = useCallback(
    (name: string) => {
      const normalizedName = name.trim();
      const definitionId = activeHomeViewDefinition?.definition_id;
      if (!normalizedName || !definitionId || !canRenameActiveHomeView) {
        return;
      }

      const saveRunId = saveRunRef.current + 1;
      saveRunRef.current = saveRunId;
      setPersonalHomeViewState((current) => ({
        ...current,
        saving: true,
        error: "",
      }));

      void updateHomeViewDefinition(apiBase, accessToken, definitionId, {
        name: normalizedName,
      })
        .then((definition) => {
          if (saveRunRef.current !== saveRunId) {
            return;
          }

          setPersonalHomeViewState((current) => ({
            ...current,
            definitions: upsertHomeViewDefinition(
              current.definitions,
              definition,
            ),
            activeDefinitionId: definition.definition_id,
            cards: normalizePromptHomeCardsFromDefinition(definition),
            loading: false,
            saving: false,
            fallback: false,
            error: "",
          }));
        })
        .catch((error) => {
          if (saveRunRef.current !== saveRunId) {
            return;
          }

          setPersonalHomeViewState((current) => ({
            ...current,
            saving: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not rename the Home view.",
          }));
        });
    },
    [
      accessToken,
      activeHomeViewDefinition?.definition_id,
      apiBase,
      canRenameActiveHomeView,
    ],
  );
  const deleteActiveHomeView = useCallback(() => {
    const definitionId = activeHomeViewDefinition?.definition_id;
    if (!definitionId || !canDeleteActiveHomeView) {
      return;
    }

    const saveRunId = saveRunRef.current + 1;
    saveRunRef.current = saveRunId;
    setPersonalHomeViewState((current) => ({
      ...current,
      saving: true,
      error: "",
    }));

    void deleteHomeViewDefinition(apiBase, accessToken, definitionId)
      .then(() => {
        if (saveRunRef.current !== saveRunId) {
          return;
        }

        const remainingDefinitions = personalHomeViewState.definitions.filter(
          (definition) => definition.definition_id !== definitionId,
        );
        const nextDefinition = remainingDefinitions[0] ?? null;
        const nextCards = nextDefinition
          ? normalizePromptHomeCardsFromDefinition(nextDefinition)
          : (personalHomeViewState.systemCards ??
            normalizePromptHomeTemplateCards(PROMPT_HOME_SYSTEM_TEMPLATE.cards));
        saveActiveHomeViewValue(
          userId,
          nextDefinition
            ? homeViewDefinitionValue(nextDefinition)
            : PROMPT_HOME_SYSTEM_VIEW_VALUE,
        );
        savePromptHomeTemplateCardsToLocalStorage(nextCards);
        setPersonalHomeViewState({
          definitions: remainingDefinitions,
          activeDefinitionId: nextDefinition?.definition_id ?? null,
          cards: nextCards,
          systemCards: personalHomeViewState.systemCards,
          loading: false,
          saving: false,
          fallback: false,
          error: "",
        });
      })
      .catch((error) => {
        if (saveRunRef.current !== saveRunId) {
          return;
        }

        setPersonalHomeViewState((current) => ({
          ...current,
          saving: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not delete the Home view.",
        }));
      });
  }, [
    accessToken,
    activeHomeViewDefinition?.definition_id,
    apiBase,
    canDeleteActiveHomeView,
    personalHomeViewState.definitions,
    personalHomeViewState.systemCards,
    userId,
  ]);
  const publishActiveHomeView = useCallback(
    (name?: string) => {
      const definitionId = activeHomeViewDefinition?.definition_id;
      if (!definitionId || !canPublishActiveHomeView) {
        return;
      }

      const normalizedName = name?.trim() || activeHomeViewDefinition.name;
      const saveRunId = saveRunRef.current + 1;
      saveRunRef.current = saveRunId;
      setPersonalHomeViewState((current) => ({
        ...current,
        saving: true,
        error: "",
      }));

      void publishHomeViewDefinition(apiBase, accessToken, definitionId, {
        name: normalizedName,
        scope: "ORGANIZATION",
      })
        .then((definition) => {
          if (saveRunRef.current !== saveRunId) {
            return;
          }

          setPersonalHomeViewState((current) => ({
            ...current,
            definitions: upsertHomeViewDefinition(
              current.definitions,
              definition,
            ),
            loading: false,
            saving: false,
            fallback: false,
            error: "",
          }));
        })
        .catch((error) => {
          if (saveRunRef.current !== saveRunId) {
            return;
          }

          setPersonalHomeViewState((current) => ({
            ...current,
            saving: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not publish the Home view.",
          }));
        });
    },
    [
      accessToken,
      activeHomeViewDefinition,
      apiBase,
      canPublishActiveHomeView,
    ],
  );
  const retireActiveHomeView = useCallback(() => {
    const definitionId = activeHomeViewDefinition?.definition_id;
    if (!definitionId || !canRetireActiveHomeView) {
      return;
    }

    const saveRunId = saveRunRef.current + 1;
    saveRunRef.current = saveRunId;
    setPersonalHomeViewState((current) => ({
      ...current,
      saving: true,
      error: "",
    }));

    void retireHomeViewDefinition(apiBase, accessToken, definitionId)
      .then(() => {
        if (saveRunRef.current !== saveRunId) {
          return;
        }

        const remainingDefinitions = personalHomeViewState.definitions.filter(
          (definition) => definition.definition_id !== definitionId,
        );
        const nextDefinition =
          remainingDefinitions.find((definition) => definition.scope === "PERSONAL") ??
          remainingDefinitions[0] ??
          null;
        const nextCards = nextDefinition
          ? normalizePromptHomeCardsFromDefinition(nextDefinition)
          : (personalHomeViewState.systemCards ??
            normalizePromptHomeTemplateCards(PROMPT_HOME_SYSTEM_TEMPLATE.cards));
        saveActiveHomeViewValue(
          userId,
          nextDefinition
            ? homeViewDefinitionValue(nextDefinition)
            : PROMPT_HOME_SYSTEM_VIEW_VALUE,
        );
        savePromptHomeTemplateCardsToLocalStorage(nextCards);
        setPersonalHomeViewState({
          definitions: remainingDefinitions,
          activeDefinitionId: nextDefinition?.definition_id ?? null,
          cards: nextCards,
          systemCards: personalHomeViewState.systemCards,
          loading: false,
          saving: false,
          fallback: false,
          error: "",
        });
      })
      .catch((error) => {
        if (saveRunRef.current !== saveRunId) {
          return;
        }

        setPersonalHomeViewState((current) => ({
          ...current,
          saving: false,
          error:
            error instanceof Error
              ? error.message
              : "Could not retire the shared Home view.",
        }));
      });
  }, [
    accessToken,
    activeHomeViewDefinition?.definition_id,
    apiBase,
    canRetireActiveHomeView,
    personalHomeViewState.definitions,
    personalHomeViewState.systemCards,
    userId,
  ]);
  const persistenceStatus: PromptHomeCardPersistenceStatus =
    personalHomeViewState.loading
      ? "loading"
      : personalHomeViewState.fallback
        ? "fallback"
        : personalHomeViewState.saving
        ? "saving"
        : activeHomeViewDefinition
          ? activeHomeViewDefinition.is_shared
            ? "shared"
            : "personal"
          : activeHomeViewIsSystem
            ? "system"
            : "local";
  const persistenceLabel = activeHomeViewName;
  const persistenceDetail =
    persistenceStatus === "loading"
      ? "Loading saved Home"
      : persistenceStatus === "saving"
        ? "Saving Home"
        : persistenceStatus === "fallback"
          ? "Saved locally"
          : activeHomeViewDetail;

  return {
    homeViewOptions,
    activeHomeViewValue,
    activeHomeViewName,
    activeHomeViewDetail,
    canEditCards,
    canManageHomeViews,
    canRenameActiveHomeView,
    canDeleteActiveHomeView,
    canPublishActiveHomeView,
    canRetireActiveHomeView,
    canResetHomeView,
    selectHomeView,
    saveHomeViewAs,
    renameActiveHomeView,
    deleteActiveHomeView,
    publishActiveHomeView,
    retireActiveHomeView,
    getCard,
    getCardByInstanceId,
    updateCardConfiguration,
    updateCardInstanceConfiguration,
    hiddenCardKeys,
    visibleCardKeys,
    visibleCards,
    visibleCardInstanceIds,
    isCardVisible,
    setCardVisible,
    moveCard,
    resizeCardInstance,
    resizeCardInstanceToSpan,
    deleteCardInstance,
    cardClipboard,
    copyCardInstance,
    cutCardInstance,
    duplicateCardInstance,
    pasteCardFromClipboard,
    clearCardClipboard,
    canUndoLastCardAction: Boolean(lastUndoState),
    lastCardActionLabel: lastUndoState?.label ?? "",
    undoLastCardAction,
    showAllCards,
    resetHomeView,
    persistenceStatus,
    persistenceLabel,
    persistenceDetail,
    persistenceError: personalHomeViewState.error,
  };
}
