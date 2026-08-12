import { normalizeKey } from '@/core/utils/text';
import { collectCandidates, discoverFields } from './fieldDiscovery';
import type { PlatformFormConfig } from './fieldProfiles';

/**
 * Detects *what kind of page* we are on and *when the listing form is ready*.
 *
 * A listing flow renders progressively, so a one-shot check right after
 * `document_idle` regularly runs too early. Detection therefore combines URL
 * hints (cheap, but the route alone is not proof), visible page text, and the
 * actual presence of the fields the platform declares as core — and is re-run by
 * a MutationObserver until it succeeds or times out.
 */

export interface DetectionResult {
  isCreateFlow: boolean;
  /** Enough core fields exist for the form to be usable. */
  formReady: boolean;
  foundFields: string[];
  reason: string;
}

export function detectListingPage(
  config: PlatformFormConfig,
  doc: Document = document,
  url = location.href,
): DetectionResult {
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  const urlHint = config.urlHints.some((hint) => path.includes(hint));
  const bodyText = normalizeKey(doc.body?.innerText ?? doc.body?.textContent ?? '').slice(0, 4000);
  const textHint = config.textHints.some((hint) => bodyText.includes(normalizeKey(hint)));

  const profiles = config.fields.filter((p) => config.coreFields.includes(p.id));
  const discovered = discoverFields(profiles, collectCandidates(doc));
  const foundFields = [...discovered.keys()];

  // The form is usable once a title field plus one more core field are present.
  const formReady = discovered.has('title') && foundFields.length >= 2;
  const isCreateFlow = urlHint || textHint || formReady;

  let reason: string;
  if (formReady) reason = 'Formularfelder erkannt.';
  else if (isCreateFlow) reason = 'Formular erkannt, Felder noch nicht vollständig geladen.';
  else reason = `Keine ${config.label}-Anzeigenerstellung auf dieser Seite erkannt.`;

  return { isCreateFlow, formReady, foundFields, reason };
}

/** True when the current URL is a published listing's detail page. */
export function isDetailPage(config: PlatformFormConfig, url = location.href): boolean {
  return config.detailUrlPatterns.some((re) => re.test(url));
}

export function listingIdFromUrl(
  config: PlatformFormConfig,
  url = location.href,
): string | undefined {
  for (const re of config.detailUrlPatterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

export interface WaitOptions {
  timeoutMs?: number;
  doc?: Document;
  onProgress?: (result: DetectionResult) => void;
}

/**
 * Waits until the form is ready.
 *
 * Uses a MutationObserver as the primary signal with a slow interval as a
 * safety net: some frameworks mutate inside a shadow root or swap attributes
 * only, which a subtree observer on `document.body` can miss.
 */
export function waitForForm(
  config: PlatformFormConfig,
  options: WaitOptions = {},
): Promise<DetectionResult> {
  const doc = options.doc ?? document;
  const timeoutMs = options.timeoutMs ?? 15000;

  return new Promise((resolve) => {
    let settled = false;

    const evaluate = (): void => {
      const result = detectListingPage(config, doc);
      options.onProgress?.(result);
      if (result.formReady && !settled) {
        settled = true;
        cleanup();
        resolve(result);
      }
    };

    const observer = new MutationObserver(() => evaluate());
    const interval = setInterval(evaluate, 750);
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(detectListingPage(config, doc));
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
