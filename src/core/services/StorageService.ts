import { SCHEMA_VERSION, STORAGE_KEYS } from '@/shared/constants';

type StorageArea = {
  get(keys: string[] | string | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
};

/**
 * In-memory stand-in used by unit tests and by any context where the extension
 * APIs are unavailable. Keeping this here means the services never need to know
 * whether they run inside Chrome.
 */
class MemoryArea implements StorageArea {
  private data = new Map<string, unknown>();

  async get(keys: string[] | string | null): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    const list = keys == null ? [...this.data.keys()] : Array.isArray(keys) ? keys : [keys];
    for (const k of list) {
      if (this.data.has(k)) out[k] = structuredClone(this.data.get(k));
    }
    return out;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    for (const [k, v] of Object.entries(items)) this.data.set(k, structuredClone(v));
    emitChange(Object.keys(items));
  }

  async remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) this.data.delete(k);
    emitChange(list);
  }

  async clear(): Promise<void> {
    const keys = [...this.data.keys()];
    this.data.clear();
    emitChange(keys);
  }
}

type ChangeListener = (keys: string[]) => void;
const listeners = new Set<ChangeListener>();
let memoryArea: MemoryArea | null = null;

function emitChange(keys: string[]): void {
  for (const listener of listeners) {
    try {
      listener(keys);
    } catch (err) {
      console.error('[AWM] storage listener failed', err);
    }
  }
}

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome?.storage?.local;
}

function area(): StorageArea {
  if (hasChromeStorage()) {
    return {
      get: (keys) =>
        chrome.storage.local.get(keys) as unknown as Promise<Record<string, unknown>>,
      set: (items) => chrome.storage.local.set(items),
      remove: (keys) => chrome.storage.local.remove(keys),
      clear: () => chrome.storage.local.clear(),
    };
  }
  memoryArea ??= new MemoryArea();
  return memoryArea;
}

let chromeListenerBound = false;
function bindChromeListener(): void {
  if (chromeListenerBound || !hasChromeStorage() || !chrome.storage.onChanged) return;
  chromeListenerBound = true;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    emitChange(Object.keys(changes));
  });
}

/**
 * Serialises writes per key. Without this, two views mutating the same
 * collection concurrently (popup + dashboard) could read-modify-write over each
 * other and lose a product or a sale.
 */
const writeQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = writeQueues.get(key) ?? Promise.resolve();
  const next = prev.then(task, task);
  writeQueues.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

export const StorageService = {
  /** Reads a value, falling back to `fallback` when unset. */
  async get<T>(key: string, fallback: T): Promise<T> {
    bindChromeListener();
    const res = await area().get(key);
    const value = res[key];
    return (value === undefined ? fallback : value) as T;
  },

  async set<T>(key: string, value: T): Promise<void> {
    await area().set({ [key]: value });
  },

  async remove(key: string | string[]): Promise<void> {
    await area().remove(key);
  },

  /**
   * Atomically read-modify-write a key. All mutations of a collection must go
   * through this so concurrent writers cannot clobber each other.
   */
  async mutate<T>(key: string, fallback: T, mutator: (current: T) => T | Promise<T>): Promise<T> {
    return enqueue(key, async () => {
      const current = await StorageService.get<T>(key, fallback);
      const next = await mutator(current);
      await StorageService.set(key, next);
      return next;
    });
  },

  async getMany(keys: string[]): Promise<Record<string, unknown>> {
    bindChromeListener();
    return area().get(keys);
  },

  async setMany(items: Record<string, unknown>): Promise<void> {
    await area().set(items);
  },

  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(listener: ChangeListener): () => void {
    bindChromeListener();
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Ensures the meta record exists and runs migrations when the schema moves. */
  async init(): Promise<void> {
    const meta = await StorageService.get<{ schemaVersion?: number }>(STORAGE_KEYS.meta, {});
    if (meta.schemaVersion === SCHEMA_VERSION) return;
    // Version 1 is the initial schema; future migrations branch from here.
    await StorageService.set(STORAGE_KEYS.meta, {
      ...meta,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    });
  },

  /** Test helper: wipe everything (also used by "Alle Daten löschen"). */
  async clearAll(): Promise<void> {
    await area().clear();
  },

  /** Approximate bytes used, for the settings screen. */
  async usage(): Promise<number> {
    if (hasChromeStorage() && chrome.storage.local.getBytesInUse) {
      return chrome.storage.local.getBytesInUse(null);
    }
    const all = await area().get(null);
    return new Blob([JSON.stringify(all)]).size;
  },
};
