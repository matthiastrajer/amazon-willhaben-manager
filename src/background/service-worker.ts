import { fail, ok, sendTabMessage, type Message } from '@/shared/messages';
import { AMAZON_DOMAINS, DASHBOARD_PAGE, STORAGE_KEYS, WILLHABEN_HOST } from '@/shared/constants';
import { StorageService } from '@/core/services/StorageService';
import { SettingsService } from '@/core/services/SettingsService';
import { TemplateService } from '@/core/services/TemplateService';
import { ProductService } from '@/core/services/ProductService';
import { ListingService } from '@/core/services/ListingService';
import type { AmazonPageState, ExtractionResult, PendingListing } from '@/shared/types';
import {
  generateListingDescription,
  generateListingTitle,
} from '@/core/services/ListingContentService';
import type { Product } from '@/core/models/Product';
import type { Settings } from '@/core/models/Settings';

/**
 * MV3 service worker.
 *
 * It owns the things that must survive a content script being torn down by a
 * navigation: storage writes, tab orchestration and the hand-off from Amazon to
 * a marketplace.
 */

const CONTEXT_MENU_ID = 'awm-prepare-listing';

/**
 * Where each marketplace's listing flow lives. Entry URLs are settings-backed
 * because marketplaces change their routes; the content script recognises the
 * form by its fields, not by the URL.
 */
const MARKETPLACES: Record<
  string,
  {
    label: string;
    tabPattern: string;
    urlHints: string[];
    createUrl: (settings: Settings) => string;
  }
> = {
  willhaben: {
    label: 'Willhaben',
    tabPattern: `https://${WILLHABEN_HOST}/*`,
    urlHints: ['anzeigenaufgabe', 'anzeige'],
    createUrl: (s) => s.willhabenCreateUrl,
  },
  ebay: {
    label: 'eBay',
    tabPattern: 'https://*.ebay.*/*',
    urlHints: ['/sl/', '/lstng', 'sell'],
    createUrl: (s) => s.ebayCreateUrl,
  },
};

// ------------------------------------------------------------------ lifecycle

chrome.runtime.onInstalled.addListener(() => {
  void (async () => {
    await StorageService.init();
    await TemplateService.ensureSeeded();
    await syncContextMenu();
  })();
});

chrome.runtime.onStartup.addListener(() => {
  void syncContextMenu();
});

async function syncContextMenu(): Promise<void> {
  const settings = await SettingsService.get();
  await chrome.contextMenus.removeAll();
  if (!settings.contextMenu) return;

  const label = MARKETPLACES[settings.defaultPlatform]?.label ?? 'Willhaben';
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: `Produkt für ${label} vorbereiten`,
    contexts: ['page', 'link', 'selection'],
    documentUrlPatterns: AMAZON_DOMAINS.map((d) => `https://${d.host}/*`),
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.settings]) void syncContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (info.menuItemId !== CONTEXT_MENU_ID || tabId === undefined) return;
  void (async () => {
    try {
      const product = await importFromTab(tabId);
      const settings = await SettingsService.get();
      await prepareListing(product.id, settings.defaultPlatform);
    } catch (err) {
      console.error('[AWM] context menu action failed', err);
      await notifyTab(tabId, err instanceof Error ? err.message : String(err));
    }
  })();
});

/** Surfaces an error inside the page when there is no popup open to show it. */
async function notifyTab(tabId: number, message: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (text: string) => window.alert(`Amazon → Reselling Manager\n\n${text}`),
      args: [message],
    });
  } catch {
    // Scripting can be blocked on some pages — the console log above remains.
  }
}

// ------------------------------------------------------------- tab utilities

async function activeTab(tabId?: number): Promise<chrome.tabs.Tab> {
  if (tabId !== undefined) {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) throw new Error('Tab nicht gefunden.');
    return tab;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Kein aktiver Tab gefunden.');
  return tab;
}

function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Talks to a content script, injecting it first if the tab was already open
 * when the extension was installed or reloaded.
 */
async function ensureContentScript(tabId: number, file: string): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
  } catch (err) {
    // Already injected, or the page forbids injection — the caller's message
    // send will produce the actionable error.
    console.debug('[AWM] injection skipped', err);
  }
}

async function amazonState(tabId: number, url: string | undefined): Promise<AmazonPageState> {
  const host = hostOf(url);
  if (!AMAZON_DOMAINS.some((d) => d.host === host)) {
    return { isAmazon: false, isProductPage: false, host };
  }
  try {
    return await sendTabMessage(tabId, { type: 'AMAZON_DETECT' });
  } catch {
    await ensureContentScript(tabId, 'content-amazon.js');
    try {
      return await sendTabMessage(tabId, { type: 'AMAZON_DETECT' });
    } catch {
      return { isAmazon: true, isProductPage: false, host };
    }
  }
}

async function extractFromTab(tabId: number): Promise<ExtractionResult> {
  try {
    return await sendTabMessage(tabId, { type: 'AMAZON_EXTRACT' });
  } catch {
    await ensureContentScript(tabId, 'content-amazon.js');
    return sendTabMessage(tabId, { type: 'AMAZON_EXTRACT' });
  }
}

// -------------------------------------------------------------- core actions

/** Analyses the tab and stores the product. Used by the context menu. */
async function importFromTab(tabId: number) {
  const result = await extractFromTab(tabId);
  if (!result.ok || !result.product) {
    throw new Error(result.error ?? 'Produkt konnte nicht analysiert werden.');
  }
  const settings = await SettingsService.get();
  return ProductService.createFromExtraction(result.product, settings);
}

/**
 * Refreshes the generated listing texts.
 *
 * Title and description are stored on the product, so a product imported with an
 * older version keeps whatever was generated back then. Regenerating on every
 * prepare means improved generation rules and changed settings actually take
 * effect. Text the user typed themselves is never touched.
 */
async function refreshListingText(product: Product): Promise<Product> {
  if (product.listingTextSource === 'manual') return product;

  const settings = await SettingsService.get();
  const template = await TemplateService.suggestFor({
    category: product.category,
    categoryPath: [product.category ?? '', product.subcategory ?? ''].filter(Boolean),
    title: product.title,
    bulletPoints: product.bulletPoints,
  });

  const listingTitle = settings.autoOptimizeTitle
    ? generateListingTitle(product, { template })
    : product.listingTitle;
  const listingDescription = settings.autoGenerateDescription
    ? generateListingDescription(product, { template, settings })
    : product.listingDescription;

  if (listingTitle === product.listingTitle && listingDescription === product.listingDescription) {
    return product;
  }

  return (
    (await ProductService.update(
      product.id,
      { listingTitle, listingDescription, listingTextSource: 'auto' },
      'Anzeigentexte neu erzeugt',
    )) ?? product
  );
}

/**
 * Prepares a product for Willhaben: writes the hand-off payload, records the
 * listing, moves the product to READY_TO_LIST and opens the ad-creation flow.
 *
 * The product is explicitly NOT marked as LISTED here — only the user can
 * confirm that an ad actually went live.
 */
async function prepareListing(productId: string, platform: string): Promise<{ tabId: number }> {
  const stored = await ProductService.byId(productId);
  if (!stored) throw new Error('Produkt nicht gefunden.');

  const product = await refreshListingText(stored);
  const settings = await SettingsService.get();

  const target = MARKETPLACES[platform];
  if (!target) throw new Error(`Plattform "${platform}" wird nicht unterstützt.`);

  const pending: PendingListing = {
    productId: product.id,
    product,
    platform,
    createdAt: new Date().toISOString(),
  };
  await StorageService.set(STORAGE_KEYS.pendingListing, pending);

  await ListingService.upsertPrepared({
    productId: product.id,
    platform,
    listedPrice: product.plannedSalePrice,
    title: product.listingTitle ?? product.title,
    description: product.listingDescription ?? product.description,
  });

  if (product.status === 'DRAFT') {
    await ProductService.setStatus(
      product.id,
      'READY_TO_LIST',
      `${target.label}-Formular vorbereitet`,
    );
  }

  // Reuse an existing tab for this marketplace instead of stacking new ones.
  const createUrl = target.createUrl(settings);
  const existing = await chrome.tabs.query({ url: target.tabPattern });
  const reusable = existing.find((t) => target.urlHints.some((h) => t.url?.includes(h)));

  let tabId: number;
  if (reusable?.id) {
    await chrome.tabs.update(reusable.id, { active: true, url: createUrl });
    tabId = reusable.id;
  } else {
    const tab = await chrome.tabs.create({ url: createUrl, active: true });
    if (!tab.id) throw new Error(`${target.label}-Tab konnte nicht geöffnet werden.`);
    tabId = tab.id;
  }

  // The content script fills the form itself once the page is ready; this ping
  // covers the case where the tab was already on the form.
  void waitForTabReady(tabId).then(async () => {
    try {
      await sendTabMessage(tabId, { type: 'LISTING_FILL', platform, productId: product.id });
    } catch {
      // The content script auto-fills on load, so a failed ping is not fatal.
    }
  });

  return { tabId };
}

function waitForTabReady(tabId: number, timeoutMs = 20000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve();
    };
    const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    void chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') done();
    });
  });
}

async function openDashboard(route = '#/'): Promise<{ tabId: number }> {
  const base = chrome.runtime.getURL(DASHBOARD_PAGE);
  const url = `${base}${route.startsWith('#') ? route : `#${route}`}`;

  const tabs = await chrome.tabs.query({ url: `${base}*` });
  const existing = tabs[0];
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url });
    await chrome.windows.update(existing.windowId, { focused: true });
    return { tabId: existing.id };
  }
  const tab = await chrome.tabs.create({ url, active: true });
  return { tabId: tab.id! };
}

// ------------------------------------------------------------ message router

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  void (async () => {
    try {
      switch (message.type) {
        case 'GET_PAGE_STATE': {
          const tab = await activeTab(message.tabId);
          sendResponse(ok(await amazonState(tab.id!, tab.url)));
          return;
        }

        case 'ANALYZE_ACTIVE_TAB': {
          const tab = await activeTab(message.tabId);
          sendResponse(ok(await extractFromTab(tab.id!)));
          return;
        }

        case 'PREPARE_LISTING': {
          sendResponse(ok(await prepareListing(message.productId, message.platform)));
          return;
        }

        case 'OPEN_DASHBOARD': {
          sendResponse(ok(await openDashboard(message.route ?? '#/')));
          return;
        }

        case 'LISTING_DETECTED': {
          if (message.info.url) {
            await ListingService.attachUrl(
              message.productId,
              message.platform,
              message.info.url,
              'ACTIVE',
            );
          }
          sendResponse(ok({ saved: !!message.info.url }));
          return;
        }

        case 'DATA_CHANGED':
          sendResponse(ok({ ok: true }));
          return;

        default:
          // Messages addressed to content scripts reach here too; ignore them.
          return;
      }
    } catch (err) {
      sendResponse(fail(err));
    }
  })();

  return true; // responses are always async
});
