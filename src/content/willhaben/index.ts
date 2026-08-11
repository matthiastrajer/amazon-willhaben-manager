import { fail, ok, type Message } from '@/shared/messages';
import { STORAGE_KEYS } from '@/shared/constants';
import { StorageService } from '@/core/services/StorageService';
import { SettingsService } from '@/core/services/SettingsService';
import { ProductService } from '@/core/services/ProductService';
import { ListingService } from '@/core/services/ListingService';
import type { PendingListing } from '@/shared/types';
import type { WillhabenFieldId } from './willhabenSelectors';
import { WillhabenAdapter } from './WillhabenAdapter';
import { detectWillhabenPage, isAdDetailPage, waitForForm } from './willhabenDetector';
import { AssistPanel, pickElement, selectorFor } from './assistPanel';
import { collectCandidates } from './fieldDiscovery';

/**
 * Willhaben content script.
 *
 * Flow:
 *   1. read the hand-off written by the service worker
 *   2. wait for the ad form and fill what can be filled
 *   3. show the assist panel with the per-field result and manual fallbacks
 *   4. let the user confirm the ad went live and capture its URL
 *
 * Nothing here submits a form or clicks a publish control.
 */

type FieldHints = Partial<Record<WillhabenFieldId, string>>;

let panel: AssistPanel | null = null;
let currentPending: PendingListing | null = null;

async function readPending(): Promise<PendingListing | null> {
  return StorageService.get<PendingListing | null>(STORAGE_KEYS.pendingListing, null);
}

async function readHints(): Promise<FieldHints> {
  return StorageService.get<FieldHints>(STORAGE_KEYS.fieldHints, {});
}

async function saveHint(field: string, selector: string): Promise<void> {
  await StorageService.mutate<FieldHints>(STORAGE_KEYS.fieldHints, {}, (current) => ({
    ...current,
    [field]: selector,
  }));
}

/**
 * True when the current page is an error page rather than the ad form. Worth
 * detecting separately: it means the configured entry URL is wrong, which the
 * user can fix directly, instead of the form merely being slow.
 */
function looksLikeErrorPage(): boolean {
  const heading = (document.querySelector('h1, h2')?.textContent ?? '').toLowerCase();
  const title = document.title.toLowerCase();
  return /seite wurde nicht gefunden|nicht gefunden|404|page not found/.test(`${heading} ${title}`);
}

/**
 * One line per detected control, shown in debug mode.
 *
 * This is the fastest way to find out why a field was missed on a page that
 * cannot be inspected from the outside: the user can read off exactly what
 * evidence the discovery engine had to work with.
 */
function describeControls(): string[] {
  return collectCandidates(document).map((c, i) => {
    const evidence = Object.entries(c.evidence)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}="${v.slice(0, 40)}"`)
      .join(' ');
    const tag = c.element.tagName.toLowerCase();
    return `${i + 1}. <${tag}> kind=${c.kind} visible=${c.visible} ${evidence || '(keine Merkmale)'}`;
  });
}

async function runFill(pending: PendingListing): Promise<void> {
  const settings = await SettingsService.get();
  const adapter = new WillhabenAdapter(settings, document);
  const hints = await readHints();

  // Prefer the freshest copy of the product; the hand-off snapshot can be stale
  // if the user edited the product after preparing it.
  const product = (await ProductService.byId(pending.productId)) ?? pending.product;

  if (looksLikeErrorPage()) {
    ensurePanel();
    panel!.render({
      product,
      results: [],
      formDetected: false,
      error:
        'Diese Willhaben-Seite existiert nicht (Fehler 404). Die in den Einstellungen hinterlegte Adresse für neue Anzeigen ist veraltet. Klicke auf Willhaben oben rechts auf „Neue Anzeige aufgeben“ und trage die Adresse aus der Adresszeile in den Einstellungen ein – oder navigiere einfach zum Formular, die Werte werden dann automatisch übernommen.',
    });
    return;
  }

  // Show the panel before waiting for the form, so a slow-rendering page does
  // not leave the user staring at nothing.
  ensurePanel();
  panel!.render({
    product,
    results: [],
    formDetected: false,
    error: 'Das Anzeigen-Formular wird gesucht …',
  });

  const result = await adapter.prepareListing(product, { hints });

  panel!.render({
    product,
    results: result.fields,
    formDetected: result.formDetected,
    error: result.error,
    // Shown whenever something could not be filled, because that is exactly
    // when it is needed — waiting for the user to find the debug setting first
    // just hides the one piece of information that explains the failure.
    debug:
      settings.debugMode || result.fields.some((f) => f.status === 'not-found')
        ? describeControls()
        : undefined,
  });

  if (result.formDetected) {
    await ProductService.addHistory(
      product.id,
      'Willhaben-Formular vorbereitet',
      `${result.fields.filter((f) => f.status === 'filled').length} Felder automatisch ausgefüllt`,
    );
    await StorageService.set(STORAGE_KEYS.pendingListing, {
      ...pending,
      consumedAt: new Date().toISOString(),
    } satisfies PendingListing);
  }
}

function ensurePanel(): void {
  panel ??= new AssistPanel({
    onRetry: () => {
      if (currentPending) void runFill(currentPending);
    },
    onConfirmListed: async (url) => {
      if (!currentPending) throw new Error('Kein vorbereitetes Produkt gefunden.');
      const product =
        (await ProductService.byId(currentPending.productId)) ?? currentPending.product;

      if (url) {
        await ListingService.attachUrl(product.id, 'willhaben', url, 'ACTIVE');
      }
      await ProductService.update(
        product.id,
        {
          listedQuantity: Math.max(1, product.listedQuantity || 1),
          plannedSalePrice: product.plannedSalePrice,
        },
        'Als veröffentlicht bestätigt',
      );
      await ProductService.setStatus(product.id, 'LISTED', url || undefined);
    },
    onTeachField: async (field) => {
      const el = await pickElement();
      if (!el) return;
      const selector = selectorFor(el);
      if (!selector) {
        window.alert(
          'Dieses Element hat kein stabiles Merkmal (id, name, data-testid oder aria-label) und kann leider nicht gespeichert werden.',
        );
        return;
      }
      await saveHint(field, selector);
      if (currentPending) void runFill(currentPending);
    },
    onOpenDashboard: () => {
      void chrome.runtime.sendMessage({
        type: 'OPEN_DASHBOARD',
        route: '#/products',
      } satisfies Message);
    },
  });
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  if (message.type === 'WILLHABEN_PING') {
    const detection = detectWillhabenPage(document);
    sendResponse(ok({ pong: true, formDetected: detection.formReady }));
    return false;
  }

  if (message.type === 'WILLHABEN_FILL') {
    void (async () => {
      try {
        const pending = await readPending();
        if (!pending) {
          sendResponse(
            fail('Kein vorbereitetes Produkt gefunden. Bitte im Popup „Willhaben vorbereiten“ starten.'),
          );
          return;
        }
        currentPending = pending;
        await runFill(pending);
        sendResponse(ok({ ok: true, formDetected: true, fields: [] }));
      } catch (err) {
        sendResponse(fail(err));
      }
    })();
    return true; // async response
  }

  if (message.type === 'WILLHABEN_EXTRACT_LISTING') {
    void (async () => {
      try {
        const settings = await SettingsService.get();
        const info = await new WillhabenAdapter(settings, document).extractListingInfo();
        sendResponse(ok(info));
      } catch (err) {
        sendResponse(fail(err));
      }
    })();
    return true;
  }

  return false;
});

/**
 * When the user lands on a published ad detail page shortly after preparing a
 * product, the ad URL is captured automatically — this is the one case where
 * the listing URL can be detected without the user typing it.
 */
async function captureListingUrl(): Promise<void> {
  if (!isAdDetailPage(location.href)) return;
  const pending = await readPending();
  if (!pending) return;

  // Only auto-attach shortly after the hand-off, otherwise an unrelated ad the
  // user happens to browse would be linked to the product.
  const preparedAt = new Date(pending.consumedAt ?? pending.createdAt).getTime();
  const ageMinutes = (Date.now() - preparedAt) / 60000;
  if (ageMinutes > 60) return;

  const product = await ProductService.byId(pending.productId);
  if (!product) return;

  const listings = await ListingService.forProduct(product.id);
  if (listings.some((l) => l.url === location.href.split('?')[0])) return;

  await ListingService.attachUrl(product.id, 'willhaben', location.href.split('?')[0] ?? location.href, 'ACTIVE');
  await ProductService.addHistory(product.id, 'Willhaben-URL automatisch erkannt', location.href);
}

/** A hand-off is only acted upon for half an hour after it was created. */
function isFresh(pending: PendingListing): boolean {
  return Date.now() - new Date(pending.createdAt).getTime() < 30 * 60 * 1000;
}

/**
 * Decides whether to fill right now, and does so.
 *
 * Called on load and again whenever the SPA navigates, because reaching the ad
 * form by clicking "Neue Anzeige aufgeben" replaces the view without ever
 * loading a new document — a load-only check would simply never fire.
 *
 * `announce` distinguishes the two situations: on a page the user was sent to
 * on purpose, a failure has to be visible; after an incidental in-app
 * navigation it must stay quiet unless the form actually shows up.
 */
async function maybeFill(announce: boolean): Promise<void> {
  const pending = await readPending();
  if (!pending) return;
  currentPending = pending;

  if (!isFresh(pending) || pending.consumedAt) return;

  if (announce && detectWillhabenPage(document).isCreateFlow) {
    await runFill(pending);
    return;
  }

  // The route may not look like the ad flow (and the form may still be
  // rendering), so wait a little and only act once the fields really exist.
  const detection = await waitForForm({ timeoutMs: 8000 });
  if (detection.formReady) await runFill(pending);
}

/**
 * Watches for client-side navigation. History methods are patched because
 * `popstate` alone does not fire for pushState/replaceState, which is how a
 * framework router moves between views.
 */
function watchSpaNavigation(onChange: () => void): void {
  let lastUrl = location.href;

  const check = () => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    onChange();
  };

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function patched(this: History, ...args: never[]) {
      const result = (original as (...a: never[]) => unknown).apply(this, args);
      // Let the router finish rendering before re-evaluating the DOM.
      setTimeout(check, 0);
      return result;
    } as typeof original;
  }

  window.addEventListener('popstate', () => setTimeout(check, 0));
  window.addEventListener('hashchange', () => setTimeout(check, 0));
}

void (async () => {
  await captureListingUrl();
  await maybeFill(true);

  watchSpaNavigation(() => {
    void (async () => {
      await captureListingUrl();
      await maybeFill(false);
    })();
  });
})();
