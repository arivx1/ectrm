import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ApiError } from "../../shared/api";
import type { StoredAuthSession } from "../../shared/mutation";
import {
  createHomeViewDefinition,
  deleteHomeViewDefinition,
  homeViewCardPayloadToPromptHomeCard,
  listHomeViewDefinitions,
  loadHomeViewSystemTemplate,
  resetHomeViewDefinition,
  toHomeViewCardPayload,
  updateHomeViewDefinition,
  type HomeViewDefinition,
  type HomeViewDefinitionCreatePayload,
} from "../../entities/home-views/api";
import {
  isPromptHomeCardKey,
  normalizePromptHomeTemplateCards,
  PROMPT_HOME_CARD_KEYS,
  PROMPT_HOME_SYSTEM_TEMPLATE,
  PROMPT_HOME_SYSTEM_TEMPLATE_KEY,
  PROMPT_HOME_SYSTEM_TEMPLATE_VERSION,
  type PromptHomeCardKey,
  type PromptHomeTemplateCard,
} from "./promptHomeCards";

export { PROMPT_HOME_CARD_VISIBILITY_OPTIONS, type PromptHomeCardKey } from "./promptHomeCards";

export const PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY =
  "ectrm.prompt-home.card-visibility";
export const PROMPT_HOME_CARD_ORDER_STORAGE_KEY =
  "ectrm.prompt-home.card-order";

const PROMPT_HOME_CARD_VISIBILITY_STORAGE_EVENT =
  "ectrm:prompt-home-card-visibility-change";
const PROMPT_HOME_CARD_ORDER_STORAGE_EVENT =
  "ectrm:prompt-home-card-order-change";
const PROMPT_HOME_CARD_KEY_SEPARATOR = "\u001f";
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
  kind: "system" | "personal" | "local";
  canEdit: boolean;
};

export type PromptHomeCardPersistenceStatus =
  | "loading"
  | "system"
  | "personal"
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

function promptHomeLocalPreferencesExist(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
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

function parsePersonalHomeViewValue(value: string): number | null {
  if (!value.startsWith("personal:")) {
    return null;
  }

  const parsedValue = Number.parseInt(value.slice("personal:".length), 10);
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

function getPromptHomeHiddenCardKeySnapshotValue(): string {
  return getPromptHomeHiddenCardKeysSnapshot().join(
    PROMPT_HOME_CARD_KEY_SEPARATOR,
  );
}

function getPromptHomeCardOrderSnapshotValue(): string {
  return getPromptHomeCardOrderSnapshot().join(
    PROMPT_HOME_CARD_KEY_SEPARATOR,
  );
}

function clonePromptHomeTemplateCard(
  card: PromptHomeTemplateCard,
  args: {
    order: number;
    visible: boolean;
  },
): PromptHomeTemplateCard {
  return {
    cardId: card.cardId,
    visible: args.visible,
    placement: {
      order: args.order,
      columnSpan: card.placement.columnSpan,
      rowSpan: card.placement.rowSpan,
    },
    parameters: { ...card.parameters },
    filters: { ...card.filters },
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
  return buildPromptHomeCardsFromOrderAndHidden(
    getPromptHomeCardOrderSnapshot(),
    getPromptHomeHiddenCardKeysSnapshot(),
  );
}

export function promptHomeTemplateCardsToOrderAndHidden(
  cards: readonly PromptHomeTemplateCard[],
): {
  order: PromptHomeCardKey[];
  hidden: PromptHomeCardKey[];
} {
  const normalizedCards = normalizePromptHomeTemplateCards(cards);

  return {
    order: normalizedCards.map((card) => card.cardId),
    hidden: normalizedCards
      .filter((card) => !card.visible)
      .map((card) => card.cardId),
  };
}

function savePromptHomeTemplateCardsToLocalStorage(
  cards: readonly PromptHomeTemplateCard[],
): void {
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
    ? parsePersonalHomeViewValue(storedValue)
    : null;
  if (
    storedDefinitionId !== null &&
    definitions.some(
      (definition) => definition.definition_id === storedDefinitionId,
    )
  ) {
    return storedDefinitionId;
  }

  return definitions[0]?.definition_id ?? null;
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

function subscribeToPromptHomeCardVisibility(
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
        storageEvent.key !== PROMPT_HOME_CARD_VISIBILITY_STORAGE_KEY
      ) {
        return;
      }
    }

    onStoreChange();
  };

  window.addEventListener(
    PROMPT_HOME_CARD_VISIBILITY_STORAGE_EVENT,
    handleStoreEvent,
  );
  window.addEventListener("storage", handleStoreEvent);

  return () => {
    window.removeEventListener(
      PROMPT_HOME_CARD_VISIBILITY_STORAGE_EVENT,
      handleStoreEvent,
    );
    window.removeEventListener("storage", handleStoreEvent);
  };
}

function subscribeToPromptHomeCardOrder(
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
        storageEvent.key !== PROMPT_HOME_CARD_ORDER_STORAGE_KEY
      ) {
        return;
      }
    }

    onStoreChange();
  };

  window.addEventListener(PROMPT_HOME_CARD_ORDER_STORAGE_EVENT, handleStoreEvent);
  window.addEventListener("storage", handleStoreEvent);

  return () => {
    window.removeEventListener(
      PROMPT_HOME_CARD_ORDER_STORAGE_EVENT,
      handleStoreEvent,
    );
    window.removeEventListener("storage", handleStoreEvent);
  };
}

function movePromptHomeCardOrder(
  currentOrder: PromptHomeCardKey[],
  hiddenKeys: PromptHomeCardKey[],
  activeCardKey: string,
  overCardKey: string,
): PromptHomeCardKey[] {
  const hiddenKeySet = new Set(hiddenKeys);
  const visibleOrder = currentOrder.filter(
    (cardKey) => !hiddenKeySet.has(cardKey),
  );
  const oldIndex = visibleOrder.indexOf(activeCardKey as PromptHomeCardKey);
  const newIndex = visibleOrder.indexOf(overCardKey as PromptHomeCardKey);
  if (oldIndex === -1 || newIndex === -1) {
    return currentOrder;
  }

  const nextVisibleOrder = [...visibleOrder];
  const [movedCardKey] = nextVisibleOrder.splice(oldIndex, 1);
  if (!movedCardKey) {
    return currentOrder;
  }
  nextVisibleOrder.splice(newIndex, 0, movedCardKey);

  let visibleIndex = 0;
  return currentOrder.map((cardKey) => {
    if (hiddenKeySet.has(cardKey)) {
      return cardKey;
    }

    const nextCardKey = nextVisibleOrder[visibleIndex];
    visibleIndex += 1;
    return nextCardKey ?? cardKey;
  });
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
  canResetHomeView: boolean;
  selectHomeView: (value: string) => void;
  saveHomeViewAs: (name: string) => void;
  renameActiveHomeView: (name: string) => void;
  deleteActiveHomeView: () => void;
  hiddenCardKeys: PromptHomeCardKey[];
  visibleCardKeys: PromptHomeCardKey[];
  isCardVisible: (cardKey: PromptHomeCardKey) => boolean;
  setCardVisible: (cardKey: PromptHomeCardKey, visible: boolean) => void;
  moveCard: (activeCardKey: string, overCardKey: string) => void;
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
  const hiddenCardKeySnapshot = useSyncExternalStore(
    subscribeToPromptHomeCardVisibility,
    getPromptHomeHiddenCardKeySnapshotValue,
    () => "",
  );
  const cardOrderSnapshot = useSyncExternalStore(
    subscribeToPromptHomeCardOrder,
    getPromptHomeCardOrderSnapshotValue,
    () => PROMPT_HOME_CARD_KEYS.join(PROMPT_HOME_CARD_KEY_SEPARATOR),
  );
  const localHiddenCardKeys = useMemo(
    () =>
      hiddenCardKeySnapshot
        ? normalizePromptHomeHiddenCardKeys(
            hiddenCardKeySnapshot.split(PROMPT_HOME_CARD_KEY_SEPARATOR),
          )
        : [],
    [hiddenCardKeySnapshot],
  );
  const localOrderedCardKeys = useMemo(
    () =>
      normalizePromptHomeCardOrder(
        cardOrderSnapshot.split(PROMPT_HOME_CARD_KEY_SEPARATOR),
      ),
    [cardOrderSnapshot],
  );
  const localCards = useMemo(
    () =>
      buildPromptHomeCardsFromOrderAndHidden(
        localOrderedCardKeys,
        localHiddenCardKeys,
      ),
    [localHiddenCardKeys, localOrderedCardKeys],
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
        let definition = definitions[0] ?? null;

        if (!definition && !defaultPersonalViewWasMigrated(userId)) {
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
              definition = definitions[0] ?? null;
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
      cards.filter((card) => !card.visible).map((card) => card.cardId),
    [cards],
  );
  const orderedCardKeys = useMemo(
    () => cards.map((card) => card.cardId),
    [cards],
  );
  const hiddenCardKeySet = useMemo(
    () => new Set<PromptHomeCardKey>(hiddenCardKeys),
    [hiddenCardKeys],
  );
  const visibleCardKeys = useMemo(
    () =>
      orderedCardKeys.filter((cardKey) => !hiddenCardKeySet.has(cardKey)),
    [hiddenCardKeySet, orderedCardKeys],
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
    ? personalHomeViewValue(activeHomeViewDefinition.definition_id)
    : activeHomeViewIsSystem
      ? PROMPT_HOME_SYSTEM_VIEW_VALUE
      : PROMPT_HOME_LOCAL_VIEW_VALUE;
  const activeHomeViewName =
    activeHomeViewDefinition?.name ??
    (activeHomeViewIsSystem ? "System Home" : "Local Home");
  const activeHomeViewDetail =
    activeHomeViewDefinition
      ? `Personal · v${activeHomeViewDefinition.version}`
      : activeHomeViewIsSystem
        ? "Immutable system default"
        : "Browser-local fallback";
  const canEditCards = !activeHomeViewIsSystem;
  const canManageHomeViews =
    Boolean(apiBase && accessToken) && !personalHomeViewState.fallback;
  const canRenameActiveHomeView =
    canManageHomeViews && Boolean(activeHomeViewDefinition?.can_edit);
  const canDeleteActiveHomeView = canRenameActiveHomeView;
  const canResetHomeView = !activeHomeViewIsSystem;
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
        value: personalHomeViewValue(definition.definition_id),
        label: definition.name,
        detail: `Personal · v${definition.version}`,
        kind: "personal" as const,
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

      const definitionId = parsePersonalHomeViewValue(value);
      const definition = findHomeViewDefinition(
        personalHomeViewState.definitions,
        definitionId,
      );
      if (!definition) {
        return;
      }

      const nextCards = normalizePromptHomeCardsFromDefinition(definition);
      saveActiveHomeViewValue(userId, personalHomeViewValue(definition.definition_id));
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
    (nextCards: readonly PromptHomeTemplateCard[]) => {
      if (activeHomeViewIsSystem) {
        setPersonalHomeViewState((current) => ({
          ...current,
          error: "System Home is immutable. Save it as a personal view before editing cards.",
        }));
        return;
      }

      const normalizedCards = normalizePromptHomeTemplateCards(nextCards);
      savePromptHomeTemplateCardsToLocalStorage(normalizedCards);

      const definitionId = activeHomeViewDefinition?.definition_id;
      if (
        !apiBase ||
        !accessToken ||
        !definitionId ||
        personalHomeViewState.fallback
      ) {
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
      activeHomeViewDefinition?.definition_id,
      activeHomeViewIsSystem,
      apiBase,
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
      );
    },
    [cards, persistCards],
  );
  const moveCard = useCallback((activeCardKey: string, overCardKey: string) => {
    const { hidden, order } = promptHomeTemplateCardsToOrderAndHidden(cards);
    const nextOrder = movePromptHomeCardOrder(
      order,
      hidden,
      activeCardKey,
      overCardKey,
    );

    if (nextOrder.some((cardKey, index) => cardKey !== order[index])) {
      persistCards(buildPromptHomeCardsFromOrderAndHidden(nextOrder, hidden, cards));
    }
  }, [cards, persistCards]);
  const showAllCards = useCallback(() => {
    persistCards(
      cards.map((card, index) =>
        clonePromptHomeTemplateCard(card, {
          order: index,
          visible: true,
        }),
      ),
    );
  }, [cards, persistCards]);
  const resetHomeView = useCallback(() => {
    const definitionId = activeHomeViewDefinition?.definition_id;
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

      void createHomeViewDefinition(
        apiBase,
        accessToken,
        createHomeViewPayload({
          name: normalizedName,
          cards,
          personaHint,
        }),
      )
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
    [accessToken, apiBase, cards, personaHint, personalHomeViewState.fallback, userId],
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
            ? personalHomeViewValue(nextDefinition.definition_id)
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
  const persistenceStatus: PromptHomeCardPersistenceStatus =
    personalHomeViewState.loading
      ? "loading"
      : personalHomeViewState.fallback
        ? "fallback"
        : personalHomeViewState.saving
        ? "saving"
        : activeHomeViewDefinition
          ? "personal"
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
    canResetHomeView,
    selectHomeView,
    saveHomeViewAs,
    renameActiveHomeView,
    deleteActiveHomeView,
    hiddenCardKeys,
    visibleCardKeys,
    isCardVisible,
    setCardVisible,
    moveCard,
    showAllCards,
    resetHomeView,
    persistenceStatus,
    persistenceLabel,
    persistenceDetail,
    persistenceError: personalHomeViewState.error,
  };
}
