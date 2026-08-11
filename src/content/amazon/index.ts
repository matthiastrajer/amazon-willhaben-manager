import { AmazonAdapter } from './AmazonAdapter';
import { mountFloatingButton, unmountFloatingButton } from './floatingButton';
import { fail, ok, type Message } from '@/shared/messages';
import { SettingsService } from '@/core/services/SettingsService';

/**
 * Amazon content script.
 *
 * Responsibilities:
 *  - answer detection/extraction requests from the popup and service worker
 *  - render the optional floating button
 *  - re-evaluate when Amazon swaps the product in place (variant switches keep
 *    the same document, so a plain load listener is not enough)
 */

function adapter(): AmazonAdapter {
  return new AmazonAdapter(document, location.href);
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  try {
    switch (message.type) {
      case 'AMAZON_PING':
        sendResponse(ok({ pong: true }));
        return false;
      case 'AMAZON_DETECT':
        sendResponse(ok(adapter().state()));
        return false;
      case 'AMAZON_EXTRACT': {
        sendResponse(ok(adapter().extract()));
        return false;
      }
      default:
        return false;
    }
  } catch (err) {
    sendResponse(fail(err));
    return false;
  }
});

async function prepareFromPage(): Promise<{ message: string; ok: boolean; openDashboard?: boolean }> {
  const result = adapter().extract();
  if (!result.ok || !result.product) {
    return { ok: false, message: result.error ?? 'Produkt konnte nicht analysiert werden.' };
  }
  // The service worker owns storage writes and tab orchestration so the flow
  // survives the content script being torn down by a navigation.
  const response = (await chrome.runtime.sendMessage({
    type: 'ANALYZE_ACTIVE_TAB',
  } satisfies Message)) as { ok: boolean; error?: string; data?: unknown };

  if (!response?.ok) {
    return { ok: false, message: response?.error ?? 'Analyse fehlgeschlagen.' };
  }
  return {
    ok: true,
    message: 'Produkt analysiert. Öffne das Extension-Popup, um es zu speichern und Willhaben vorzubereiten.',
    openDashboard: true,
  };
}

let mounted = false;

async function syncFloatingButton(): Promise<void> {
  const settings = await SettingsService.get();
  const shouldShow = settings.floatingButton && adapter().state().isProductPage;

  if (shouldShow && !mounted) {
    mounted = true;
    mountFloatingButton({
      onPrepare: prepareFromPage,
      onOpenDashboard: () => {
        void chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', route: '#/products' } satisfies Message);
      },
    });
  } else if (!shouldShow && mounted) {
    mounted = false;
    unmountFloatingButton();
  }
}

/** Amazon replaces the product in place on variant switches; watch for that. */
function watchForProductChanges(): void {
  let lastUrl = location.href;
  let lastTitle = document.querySelector('#productTitle')?.textContent ?? '';

  const check = () => {
    const url = location.href;
    const title = document.querySelector('#productTitle')?.textContent ?? '';
    if (url !== lastUrl || title !== lastTitle) {
      lastUrl = url;
      lastTitle = title;
      void syncFloatingButton();
    }
  };

  const observer = new MutationObserver(() => {
    // Debounce via microtask batching: MutationObserver already coalesces.
    check();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', check);
}

void (async () => {
  await syncFloatingButton();
  if (document.body) watchForProductChanges();

  // React to the floating-button setting being toggled in another view.
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void syncFloatingButton();
  });
})();
