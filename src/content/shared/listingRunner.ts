import { fail, ok, type Message } from '@/shared/messages';
import { STORAGE_KEYS } from '@/shared/constants';
import { StorageService } from '@/core/services/StorageService';
import { SettingsService } from '@/core/services/SettingsService';
import { ProductService } from '@/core/services/ProductService';
import { ListingService } from '@/core/services/ListingService';
import type { PendingListing } from '@/shared/types';
import { MarketplaceAdapter } from './MarketplaceAdapter';
import { detectListingPage, isDetailPage, waitForForm } from './formDetector';
import { AssistPanel, pickElement, selectorFor } from './assistPanel';
import { collectCandidates } from './fieldDiscovery';
import type { ListingFieldId, PlatformFormConfig } from './fieldProfiles';

/**
 * The whole content-script behaviour for one marketplace.
 *
 * Willhaben and eBay differ only in their field descriptions, so the flow lives
 * here exactly once:
 *   1. read the hand-off written by the service worker
 *   2. wait for the listing form and fill what can be filled
 *   3. show the assist panel with the per-field result and manual fallbacks
 *   4. let the user confirm the listing went live and capture its URL
 *
 * Nothing here submits a form or clicks a publish control.
 */

type FieldHints = Partial<Record<ListingFieldId, string>>;

export function startListingRunner(config: PlatformFormConfig): void {
  let panel: AssistPanel | null = null;
  let currentPending: PendingListing | null = null;

  const readPending = () =>
    StorageService.get<PendingListing | null>(STORAGE_KEYS.pendingListing, null);

  const readHints = async (): Promise<FieldHints> => {
    const all = await StorageService.get<Record<string, FieldHints>>(STORAGE_KEYS.fieldHints, {});
    // Hints are per platform: the same field id means a different element on
    // each marketplace.
    return all[config.platform] ?? {};
  };

  const saveHint = async (field: string, selector: string): Promise<void> => {
    await StorageService.mutate<Record<string, FieldHints>>(STORAGE_KEYS.fieldHints, {}, (current) => ({
      ...current,
      [config.platform]: { ...(current[config.platform] ?? {}), [field]: selector },
    }));
  };

  /**
   * True when the current page is an error page rather than the form. Worth
   * detecting separately: it means the configured entry URL is wrong, which the
   * user can fix directly, instead of the form merely being slow.
   */
  const looksLikeErrorPage = (): boolean => {
    const heading = (document.querySelector('h1, h2')?.textContent ?? '').toLowerCase();
    const title = document.title.toLowerCase();
    return /seite wurde nicht gefunden|nicht gefunden|404|page not found/.test(
      `${heading} ${title}`,
    );
  };

  /**
   * One line per detected control.
   *
   * This is the only way to find out why a field was missed on a page that
   * cannot be inspected from the outside, so the structural counts come first:
   * they explain an empty list, which is otherwise impossible to interpret.
   */
  const describeControls = (): string[] => {
    const candidates = collectCandidates(document);
    const shadowHosts = Array.from(document.querySelectorAll('*')).filter(
      (el) => (el as HTMLElement).shadowRoot,
    ).length;
    const frames = document.querySelectorAll('iframe').length;
    const editables = document.querySelectorAll('[contenteditable], [role="textbox"]').length;

    const lines = [
      `Plattform: ${config.label} · Seite: ${location.pathname}`,
      `Bedienelemente: ${candidates.length} · contenteditable/textbox: ${editables} · iframes: ${frames} · Shadow-Roots: ${shadowHosts}`,
      '',
      ...candidates.map((c, i) => {
        const evidence = Object.entries(c.evidence)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}="${v.slice(0, 40)}"`)
          .join(' ');
        return `${i + 1}. <${c.element.tagName.toLowerCase()}> kind=${c.kind} sichtbar=${c.visible} ${evidence || '(keine Merkmale)'}`;
      }),
    ];

    console.info('[Amazon → Reselling] Feld-Diagnose:\n%s', lines.join('\n'));
    return lines;
  };

  const ensurePanel = (): void => {
    panel ??= new AssistPanel(
      {
        onRetry: () => {
          if (currentPending) void runFill(currentPending);
        },
        onConfirmListed: async (url) => {
          if (!currentPending) throw new Error('Kein vorbereitetes Produkt gefunden.');
          const product =
            (await ProductService.byId(currentPending.productId)) ?? currentPending.product;

          if (url) {
            await ListingService.attachUrl(product.id, config.platform, url, 'ACTIVE');
          }
          await ProductService.update(
            product.id,
            { listedQuantity: Math.max(1, product.listedQuantity || 1) },
            `Als veröffentlicht bestätigt (${config.label})`,
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
      },
      config.label,
    );
  };

  async function runFill(pending: PendingListing): Promise<void> {
    const settings = await SettingsService.get();
    const adapter = new MarketplaceAdapter(config, settings, document);
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
        error: `Diese ${config.label}-Seite existiert nicht (Fehler 404). Die in den Einstellungen hinterlegte Adresse zum Erstellen von Anzeigen ist veraltet. Öffne das Formular selbst über die Website – die Werte werden dann automatisch übernommen – oder trage die neue Adresse in den Einstellungen ein.`,
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
      error: `Das ${config.label}-Formular wird gesucht …`,
    });

    const result = await adapter.prepareListing(product, { hints });

    panel!.render({
      product,
      results: result.fields,
      formDetected: result.formDetected,
      error: result.error,
      // Shown whenever something could not be filled, because that is exactly
      // when it is needed.
      debug:
        settings.debugMode || result.fields.some((f) => f.status === 'not-found')
          ? describeControls()
          : undefined,
    });

    if (result.formDetected) {
      await ProductService.addHistory(
        product.id,
        `${config.label}-Formular vorbereitet`,
        `${result.fields.filter((f) => f.status === 'filled').length} Felder automatisch ausgefüllt`,
      );
      await StorageService.set(STORAGE_KEYS.pendingListing, {
        ...pending,
        consumedAt: new Date().toISOString(),
      } satisfies PendingListing);
    }
  }

  /**
   * When the user lands on a published listing shortly after preparing a product,
   * the URL is captured automatically — the one case where it can be detected
   * without the user typing it.
   */
  async function captureListingUrl(): Promise<void> {
    if (!isDetailPage(config)) return;
    const pending = await readPending();
    if (!pending) return;

    // Only auto-attach shortly after the hand-off, otherwise an unrelated listing
    // the user happens to browse would be linked to the product.
    const preparedAt = new Date(pending.consumedAt ?? pending.createdAt).getTime();
    if ((Date.now() - preparedAt) / 60000 > 60) return;

    const product = await ProductService.byId(pending.productId);
    if (!product) return;

    const clean = location.href.split('?')[0] ?? location.href;
    const listings = await ListingService.forProduct(product.id);
    if (listings.some((l) => l.url === clean)) return;

    await ListingService.attachUrl(product.id, config.platform, clean, 'ACTIVE');
    await ProductService.addHistory(
      product.id,
      `${config.label}-URL automatisch erkannt`,
      location.href,
    );
  }

  const isFresh = (pending: PendingListing): boolean =>
    Date.now() - new Date(pending.createdAt).getTime() < 30 * 60 * 1000;

  /**
   * Decides whether to fill right now, and does so.
   *
   * `announce` distinguishes the two situations: on a page the user was sent to
   * on purpose, a failure has to be visible; after an incidental in-app
   * navigation it must stay quiet unless the form actually shows up.
   */
  async function maybeFill(announce: boolean): Promise<void> {
    const pending = await readPending();
    if (!pending) return;
    // Another marketplace's hand-off is none of our business.
    if (pending.platform && pending.platform !== config.platform) return;
    currentPending = pending;

    if (!isFresh(pending) || pending.consumedAt) return;

    if (announce && detectListingPage(config, document).isCreateFlow) {
      await runFill(pending);
      return;
    }

    // The route may not look like the listing flow (and the form may still be
    // rendering), so wait a little and only act once the fields really exist.
    const detection = await waitForForm(config, { timeoutMs: 8000 });
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
        setTimeout(check, 0);
        return result;
      } as typeof original;
    }

    window.addEventListener('popstate', () => setTimeout(check, 0));
    window.addEventListener('hashchange', () => setTimeout(check, 0));
  }

  // ------------------------------------------------------------- message router

  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    if (message.type === 'LISTING_PING') {
      if (message.platform !== config.platform) return false;
      sendResponse(ok({ pong: true, formDetected: detectListingPage(config, document).formReady }));
      return false;
    }

    if (message.type === 'LISTING_FILL') {
      if (message.platform !== config.platform) return false;
      void (async () => {
        try {
          const pending = await readPending();
          if (!pending) {
            sendResponse(
              fail('Kein vorbereitetes Produkt gefunden. Bitte im Popup „vorbereiten“ starten.'),
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

    if (message.type === 'LISTING_EXTRACT') {
      if (message.platform !== config.platform) return false;
      void (async () => {
        try {
          const settings = await SettingsService.get();
          const info = await new MarketplaceAdapter(
            config,
            settings,
            document,
          ).extractListingInfo();
          sendResponse(ok(info));
        } catch (err) {
          sendResponse(fail(err));
        }
      })();
      return true;
    }

    return false;
  });

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
}
