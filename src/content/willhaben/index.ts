import { fail, ok, type Message } from '@/shared/messages';
import { STORAGE_KEYS } from '@/shared/constants';
import { StorageService } from '@/core/services/StorageService';
import { SettingsService } from '@/core/services/SettingsService';
import { ProductService } from '@/core/services/ProductService';
import { ListingService } from '@/core/services/ListingService';
import type { PendingListing } from '@/shared/types';
import type { WillhabenFieldId } from './willhabenSelectors';
import { WillhabenAdapter } from './WillhabenAdapter';
import { detectWillhabenPage, isAdDetailPage } from './willhabenDetector';
import { AssistPanel, pickElement, selectorFor } from './assistPanel';

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

async function runFill(pending: PendingListing): Promise<void> {
  const settings = await SettingsService.get();
  const adapter = new WillhabenAdapter(settings, document);
  const hints = await readHints();

  // Prefer the freshest copy of the product; the hand-off snapshot can be stale
  // if the user edited the product after preparing it.
  const product = (await ProductService.byId(pending.productId)) ?? pending.product;

  const result = await adapter.prepareListing(product, { hints });

  ensurePanel();
  panel!.render({
    product,
    results: result.fields,
    formDetected: result.formDetected,
    error: result.error,
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

void (async () => {
  const pending = await readPending();
  await captureListingUrl();

  if (!pending) return;
  currentPending = pending;

  // Only auto-fill on the creation flow and only for a fresh hand-off.
  const detection = detectWillhabenPage(document);
  const fresh = Date.now() - new Date(pending.createdAt).getTime() < 30 * 60 * 1000;
  if (detection.isCreateFlow && fresh && !pending.consumedAt) {
    await runFill(pending);
  }
})();
