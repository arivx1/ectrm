import { useCallback, useMemo, useSyncExternalStore } from "react";

import {
  isPromptHomeCardKey,
  PROMPT_HOME_CARD_KEYS,
  type PromptHomeCardKey,
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

export function usePersistentPromptHomeCardVisibility(): {
  hiddenCardKeys: PromptHomeCardKey[];
  visibleCardKeys: PromptHomeCardKey[];
  isCardVisible: (cardKey: PromptHomeCardKey) => boolean;
  setCardVisible: (cardKey: PromptHomeCardKey, visible: boolean) => void;
  moveCard: (activeCardKey: string, overCardKey: string) => void;
  showAllCards: () => void;
} {
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
  const hiddenCardKeys = useMemo(
    () =>
      hiddenCardKeySnapshot
        ? normalizePromptHomeHiddenCardKeys(
            hiddenCardKeySnapshot.split(PROMPT_HOME_CARD_KEY_SEPARATOR),
          )
        : [],
    [hiddenCardKeySnapshot],
  );
  const orderedCardKeys = useMemo(
    () =>
      normalizePromptHomeCardOrder(
        cardOrderSnapshot.split(PROMPT_HOME_CARD_KEY_SEPARATOR),
      ),
    [cardOrderSnapshot],
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
  const setCardVisible = useCallback(
    (cardKey: PromptHomeCardKey, visible: boolean) => {
      const currentHiddenKeys = getPromptHomeHiddenCardKeysSnapshot();
      if (visible) {
        savePromptHomeHiddenCardKeys(
          currentHiddenKeys.filter((hiddenKey) => hiddenKey !== cardKey),
        );
        return;
      }

      savePromptHomeHiddenCardKeys([...currentHiddenKeys, cardKey]);
    },
    [],
  );
  const moveCard = useCallback((activeCardKey: string, overCardKey: string) => {
    const currentOrder = getPromptHomeCardOrderSnapshot();
    const currentHiddenKeys = getPromptHomeHiddenCardKeysSnapshot();
    const nextOrder = movePromptHomeCardOrder(
      currentOrder,
      currentHiddenKeys,
      activeCardKey,
      overCardKey,
    );

    if (nextOrder.some((cardKey, index) => cardKey !== currentOrder[index])) {
      savePromptHomeCardOrder(nextOrder);
    }
  }, []);
  const showAllCards = useCallback(() => {
    savePromptHomeHiddenCardKeys([]);
  }, []);

  return {
    hiddenCardKeys,
    visibleCardKeys,
    isCardVisible,
    setCardVisible,
    moveCard,
    showAllCards,
  };
}
