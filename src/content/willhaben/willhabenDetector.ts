import { normalizeKey } from '@/core/utils/text';
import { collectCandidates } from './fieldDiscovery';
import {
  AD_DETAIL_URL_PATTERNS,
  CREATE_FORM_TEXT_HINTS,
  CREATE_FORM_URL_HINTS,
  WILLHABEN_FIELDS,
  type FieldProfile,
} from './willhabenSelectors';
import { discoverFields } from './fieldDiscovery';

/**
 * Detects *what kind of page* we are on and *when the form is ready*.
 *
 * The ad-creation flow renders progressively, so a one-shot check right after
 * `document_idle` regularly runs too early. Detection therefore combines:
 *   - URL hints (cheap, but the route alone is not proof)
 *   - visible page text
 *   - the actual presence of the fields we care about
 * and is re-run by a MutationObserver until it succeeds or times out.
 */

export interface DetectionResult {
  isCreateFlow: boolean;
  /** The title and price controls both exist — the form is usable. */
  formReady: boolean;
  foundFields: string[];
  reason: string;
}

const CORE_FIELDS = ['title', 'price', 'description'];

export function detectWillhabenPage(doc: Document = document, url = location.href): DetectionResult {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  const urlHint = CREATE_FORM_URL_HINTS.some((hint) => path.includes(hint));
  const bodyText = normalizeKey(doc.body?.innerText ?? doc.body?.textContent ?? '').slice(0, 4000);
  const textHint = CREATE_FORM_TEXT_HINTS.some((hint) => bodyText.includes(normalizeKey(hint)));

  const candidates = collectCandidates(doc);
  const profiles = WILLHABEN_FIELDS.filter((p): p is FieldProfile =>
    CORE_FIELDS.includes(p.id),
  );
  const discovered = discoverFields(profiles, candidates);
  const foundFields = [...discovered.keys()];

  // The form is usable once a title field plus one more core field are present.
  const formReady = discovered.has('title') && foundFields.length >= 2;
  const isCreateFlow = urlHint || textHint || formReady;

  let reason: string;
  if (formReady) reason = 'Formularfelder erkannt.';
  else if (isCreateFlow) reason = 'Anzeigen-Formular erkannt, Felder noch nicht vollständig geladen.';
  else reason = 'Keine Willhaben-Anzeigenerstellung auf dieser Seite erkannt.';

  return { isCreateFlow, formReady, foundFields, reason };
}

/** True when the current URL is a published ad detail page. */
export function isAdDetailPage(url = location.href): boolean {
  return AD_DETAIL_URL_PATTERNS.some((re) => re.test(url));
}

export function adIdFromUrl(url = location.href): string | undefined {
  for (const re of AD_DETAIL_URL_PATTERNS) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

export interface WaitOptions {
  timeoutMs?: number;
  doc?: Document;
  /** Called on every re-evaluation so the UI can show progress. */
  onProgress?: (result: DetectionResult) => void;
}

/**
 * Waits until the form is ready.
 *
 * Uses a MutationObserver as the primary signal with a slow interval as a
 * safety net (some frameworks mutate inside a shadow root or swap attributes
 * only, which a subtree observer on `document.body` can miss).
 */
export function waitForForm(options: WaitOptions = {}): Promise<DetectionResult> {
  const doc = options.doc ?? document;
  const timeoutMs = options.timeoutMs ?? 15000;

  return new Promise((resolve) => {
    let settled = false;

    const evaluate = (): boolean => {
      const result = detectWillhabenPage(doc);
      options.onProgress?.(result);
      if (result.formReady && !settled) {
        settled = true;
        cleanup();
        resolve(result);
        return true;
      }
      return false;
    };

    const observer = new MutationObserver(() => {
      evaluate();
    });

    const interval = setInterval(evaluate, 750);
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(detectWillhabenPage(doc));
    }, timeoutMs);

    function cleanup() {
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(timeout);
    }

    if (doc.body) {
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'placeholder', 'name', 'id', 'hidden'],
      });
    }

    evaluate();
  });
}
