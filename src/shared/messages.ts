import type {
  AmazonPageState,
  ExtractionResult,
  FillResult,
  ListingInfo,
} from './types';
import type { Product } from '@/core/models/Product';

/**
 * Typed message bus for popup ⇄ service worker ⇄ content scripts.
 *
 * Every message carries a literal `type`, which gives exhaustive switch
 * checking in the handlers and prevents silently-ignored messages.
 */
export type Message =
  // popup / service worker -> amazon content script
  | { type: 'AMAZON_PING' }
  | { type: 'AMAZON_DETECT' }
  | { type: 'AMAZON_EXTRACT' }
  // popup -> service worker
  | { type: 'GET_PAGE_STATE'; tabId?: number }
  | { type: 'ANALYZE_ACTIVE_TAB'; tabId?: number }
  | { type: 'PREPARE_WILLHABEN'; productId: string }
  | { type: 'OPEN_DASHBOARD'; route?: string }
  // service worker -> willhaben content script
  | { type: 'WILLHABEN_PING' }
  | { type: 'WILLHABEN_FILL'; productId?: string }
  | { type: 'WILLHABEN_EXTRACT_LISTING' }
  // willhaben content script -> service worker
  | { type: 'LISTING_DETECTED'; productId: string; info: ListingInfo }
  // any -> service worker
  | { type: 'DATA_CHANGED'; collections: string[] };

export type MessageResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export interface TypedResponses {
  AMAZON_PING: { pong: true };
  AMAZON_DETECT: AmazonPageState;
  AMAZON_EXTRACT: ExtractionResult;
  GET_PAGE_STATE: AmazonPageState;
  ANALYZE_ACTIVE_TAB: ExtractionResult;
  PREPARE_WILLHABEN: { tabId: number };
  OPEN_DASHBOARD: { tabId: number };
  WILLHABEN_PING: { pong: true; formDetected: boolean };
  WILLHABEN_FILL: FillResult;
  WILLHABEN_EXTRACT_LISTING: ListingInfo;
  LISTING_DETECTED: { saved: boolean };
  DATA_CHANGED: { ok: true };
}

/** Runtime message send with a rejected promise instead of a silent failure. */
export async function sendMessage<T extends Message['type']>(
  message: Extract<Message, { type: T }>,
): Promise<TypedResponses[T]> {
  const res = (await chrome.runtime.sendMessage(message)) as MessageResponse | undefined;
  if (!res) {
    throw new Error(
      chrome.runtime.lastError?.message ?? 'Keine Antwort vom Hintergrunddienst erhalten.',
    );
  }
  if (!res.ok) throw new Error(res.error);
  return res.data as TypedResponses[T];
}

/** Message send targeting a specific tab's content script. */
export async function sendTabMessage<T extends Message['type']>(
  tabId: number,
  message: Extract<Message, { type: T }>,
): Promise<TypedResponses[T]> {
  const res = (await chrome.tabs.sendMessage(tabId, message)) as MessageResponse | undefined;
  if (!res) {
    throw new Error('Content Script hat nicht geantwortet.');
  }
  if (!res.ok) throw new Error(res.error);
  return res.data as TypedResponses[T];
}

export function ok(data?: unknown): MessageResponse {
  return { ok: true, data };
}

export function fail(error: unknown): MessageResponse {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/** Extension-internal event fired whenever a collection changes. */
export function notifyDataChanged(collections: string[]): void {
  try {
    void chrome.runtime.sendMessage({ type: 'DATA_CHANGED', collections } satisfies Message);
  } catch {
    // No receiver (e.g. popup closed) — storage.onChanged still keeps views in sync.
  }
}

export type { Product };
