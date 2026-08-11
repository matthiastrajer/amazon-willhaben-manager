import type { Product } from '@/core/models/Product';
import type { Settings } from '@/core/models/Settings';
import type { FillResult, ListingInfo, PlatformAdapter } from '@/shared/types';
import { parseNumber } from '@/core/utils/format';
import { fillWillhabenForm } from './WillhabenFieldMapper';
import { adIdFromUrl, detectWillhabenPage, isAdDetailPage, waitForForm } from './willhabenDetector';
import type { WillhabenFieldId } from './willhabenSelectors';

/**
 * Willhaben side of the PlatformAdapter contract.
 *
 * The adapter only ever *prepares* an ad: it fills visible form fields and then
 * hands control back to the user. It never clicks a publish button, never
 * submits a form and never interacts with login or verification flows.
 */
export class WillhabenAdapter implements PlatformAdapter {
  readonly platform = 'willhaben';

  constructor(
    private readonly settings: Settings,
    private readonly doc: Document = document,
  ) {}

  async detect(): Promise<boolean> {
    return detectWillhabenPage(this.doc).isCreateFlow;
  }

  /**
   * Waits for the form to render, then fills what it can. Returns a per-field
   * report so the assist panel can tell the user exactly what is left to do.
   */
  async prepareListing(
    product: Product,
    options: { hints?: Partial<Record<WillhabenFieldId, string>>; timeoutMs?: number } = {},
  ): Promise<FillResult> {
    const detection = await waitForForm({
      doc: this.doc,
      timeoutMs: options.timeoutMs ?? 15000,
    });

    if (!detection.formReady) {
      return {
        ok: false,
        formDetected: detection.isCreateFlow,
        fields: [],
        error: detection.isCreateFlow
          ? 'Das Willhaben-Formular wurde erkannt, die Felder konnten aber nicht geladen werden.'
          : 'Willhaben-Formular konnte nicht erkannt werden.',
      };
    }

    const fields = await fillWillhabenForm(product, this.settings, {
      hints: options.hints,
      doc: this.doc,
    });

    const anyFilled = fields.some((f) => f.status === 'filled');
    return {
      ok: anyFilled,
      formDetected: true,
      fields,
      error: anyFilled
        ? undefined
        : 'Es konnte kein Feld automatisch ausgefüllt werden – bitte die Werte manuell übernehmen.',
    };
  }

  /**
   * Reads the published ad's identity from the current page. Only reports
   * `detected: true` on an actual ad detail page; the creation form has no URL
   * to capture yet.
   */
  async extractListingInfo(): Promise<ListingInfo> {
    const url = this.doc.defaultView?.location.href ?? location.href;
    if (!isAdDetailPage(url)) {
      return { detected: false };
    }

    const title =
      this.doc.querySelector('h1')?.textContent?.trim() ||
      this.doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();

    const priceMeta =
      this.doc.querySelector('meta[property="product:price:amount"]')?.getAttribute('content') ??
      this.doc.querySelector('[data-testid*="price" i]')?.textContent ??
      undefined;

    return {
      detected: true,
      url: url.split('?')[0],
      externalId: adIdFromUrl(url),
      title: title || undefined,
      price: parseNumber(priceMeta),
    };
  }
}
