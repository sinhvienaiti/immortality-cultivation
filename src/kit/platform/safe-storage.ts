// Source: games/space-typing/src/platform/safe-storage.ts (kit copy; log fixes in shared/game-kit/DRIFT.md)
/**
 * Browser storage that never throws. A browser that blocks site data
 * (school or company policy, some private windows) throws as soon as
 * `localStorage` is touched, and a full one throws on `setItem`: either used
 * to stop the whole boot or leave a change half-applied.
 *
 * - Reads answer null instead of throwing; `readItem` tells a refused read
 *   apart from a missing key, for journals that must not treat one as the
 *   other.
 * - `setItem` answers whether the value reached the browser's storage. When
 *   it did not, this page keeps the value in memory, so the rest of the visit
 *   reads what it wrote; the next visit reads the last value that was stored.
 * - `commitItem` is for journals that must be stored or not written at all
 *   (Expedition, wallet, recovery mirror): on failure nothing changes, not
 *   even in memory.
 * - `setItems` stores several keys together or none of them.
 * - The first failure of each kind (blocked, full) per area is reported once.
 *
 * The browser storage is looked up on every call, never cached: tests swap
 * it, and a page may lose access while it runs.
 */
export type StorageArea = "local" | "session";

export type StorageTrouble = { area: StorageArea; kind: "blocked" | "full" };

export type SafeStorage = {
  getItem(key: string): string | null;
  /** Like getItem, but undefined when the browser refused the read. */
  readItem(key: string): string | null | undefined;
  /** true when stored in the browser; false when kept in this page's memory only. */
  setItem(key: string, value: string): boolean;
  removeItem(key: string): boolean;
  /** Stored in the browser, or nothing changes (false). */
  commitItem(key: string, value: string): boolean;
  /** Every entry stored in the browser, or none of them (false; this page keeps them in memory). */
  setItems(entries: Readonly<Record<string, string>>): boolean;
  /** The parsed value, or null when missing or unreadable. */
  readJson(key: string): unknown;
  writeJson(key: string, value: unknown): boolean;
};

type Backing = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** Values this page could not store; null stands for a removal. */
type Memory = Map<string, string | null>;

const memories = new WeakMap<Backing, Memory>();
const detached: Record<StorageArea, Memory> = { local: new Map(), session: new Map() };
const troubles: StorageTrouble[] = [];
const listeners = new Set<(trouble: StorageTrouble) => void>();

function quotaExceeded(error: unknown): boolean {
  const name = (error as { name?: unknown } | null)?.name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function report(area: StorageArea, error: unknown): void {
  const kind = quotaExceeded(error) ? "full" : "blocked";
  if (troubles.some((trouble) => trouble.area === area && trouble.kind === kind)) return;
  const trouble: StorageTrouble = { area, kind };
  troubles.push(trouble);
  console.warn(
    "Browser " + area + "Storage is " + (kind === "full" ? "full" : "unavailable") + "; what it refuses lasts for this visit only.",
    error,
  );
  for (const listener of listeners) listener(trouble);
}

/** Called once per failure kind, including failures reported before it subscribed. */
export function onStorageTrouble(listener: (trouble: StorageTrouble) => void): () => void {
  for (const trouble of troubles) listener(trouble);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function backing(area: StorageArea): Backing | null {
  try {
    return (area === "local" ? globalThis.localStorage : globalThis.sessionStorage) ?? null;
  } catch (error) {
    report(area, error);
    return null;
  }
}

function memoryOf(area: StorageArea, store: Backing | null): Memory {
  if (store === null) return detached[area];
  let memory = memories.get(store);
  if (memory === undefined) {
    memory = new Map();
    memories.set(store, memory);
  }
  return memory;
}

function createSafeStorage(area: StorageArea): SafeStorage {
  /** The stored value, or undefined when the browser refused the read. */
  function peek(store: Backing, key: string): string | null | undefined {
    try {
      return store.getItem(key);
    } catch (error) {
      report(area, error);
      return undefined;
    }
  }

  function stored(store: Backing, key: string, value: string): boolean {
    try {
      store.setItem(key, value);
      return true;
    } catch (error) {
      report(area, error);
      return false;
    }
  }

  function readItem(key: string): string | null | undefined {
    const store = backing(area);
    const memory = memoryOf(area, store);
    if (memory.has(key)) return memory.get(key) ?? null;
    return store === null ? undefined : peek(store, key);
  }

  function getItem(key: string): string | null {
    return readItem(key) ?? null;
  }

  function setItem(key: string, value: string): boolean {
    const store = backing(area);
    const memory = memoryOf(area, store);
    if (store !== null && stored(store, key, value)) {
      memory.delete(key);
      return true;
    }
    memory.set(key, value);
    return false;
  }

  return {
    getItem,
    readItem,
    setItem,
    removeItem(key) {
      const store = backing(area);
      const memory = memoryOf(area, store);
      if (store !== null) {
        try {
          store.removeItem(key);
          memory.delete(key);
          return true;
        } catch (error) {
          report(area, error);
        }
      }
      memory.set(key, null);
      return false;
    },
    commitItem(key, value) {
      const store = backing(area);
      if (store === null || !stored(store, key, value)) return false;
      memoryOf(area, store).delete(key);
      return true;
    },
    setItems(entries) {
      const store = backing(area);
      const memory = memoryOf(area, store);
      const written: Array<[string, string | null]> = [];
      const complete =
        store !== null &&
        Object.entries(entries).every(([key, value]) => {
          const previous = peek(store, key);
          if (previous === undefined || !stored(store, key, value)) return false;
          written.push([key, previous]);
          return true;
        });
      if (complete) {
        for (const key of Object.keys(entries)) memory.delete(key);
        return true;
      }
      // Put back what this call already stored: the browser keeps the
      // previous set whole, and this page reads the new one from memory.
      for (const [key, previous] of written.reverse()) {
        try {
          if (previous === null) store?.removeItem(key);
          else store?.setItem(key, previous);
        } catch {
          // Already reported; memory answers with the new value meanwhile.
        }
      }
      for (const [key, value] of Object.entries(entries)) memory.set(key, value);
      return false;
    },
    readJson(key) {
      const raw = getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return null;
      }
    },
    writeJson(key, value) {
      let raw: string;
      try {
        raw = JSON.stringify(value);
      } catch {
        return false;
      }
      return setItem(key, raw);
    },
  };
}

export const safeLocalStorage = createSafeStorage("local");
export const safeSessionStorage = createSafeStorage("session");
