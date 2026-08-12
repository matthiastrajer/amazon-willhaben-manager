import type { Product } from '@/core/models/Product';
import type { Settings } from '@/core/models/Settings';
import type { FillResult, ListingInfo, PlatformAdapter } from '@/shared/types';
import { parseNumber } from '@/core/utils/format';
import { buildListingValues } from './listingValues';
import { fillListingForm } from './formFiller';
import { detectListingPage, isDetailPage, listingIdFromUrl, waitForForm } from './formDetector';
import type { ListingFieldId, PlatformFormConfig } from './fieldProfiles';

/**
 * One adapter implementation for every marketplace.
 *
 * The behaviour is identical across platforms — detect the form, fill what can be
 * filled, hand control back to the user — so only the field descriptions differ.
 * An adapter only ever *prepares* a listing: it never clicks a publish control,
 * never submits a form and never touches login or verification flows.
 */
export class MarketplaceAdapter implements PlatformAdapter {
  readonly platform: string;

  constructor(
    private readonly config: PlatformFormConfig,
    private readonly settings: Settings,
    private readonly doc: Document = document,
  ) {
    this.platform = config.platform;
  }

  async detect(): Promise<boolean> {
    return detectListingPage(this.config, this.doc).isCreateFlow;
  }

  /**
   * Waits for the form to render, then fills what it can. Returns a per-field
   * report so the assist panel can tell the user exactly what is left to do.
   */
  async prepareListing(
    product: Product,
    options: { hints?: Partial<Record<ListingFieldId, string>>; timeoutMs?: number } = {},
  ): Promise<FillResult> {
    const detection = await waitForForm(this.config, {
      doc: this.doc,
      timeoutMs: options.timeoutMs ?? 15000,
    });

    if (!detection.formReady) {
      return {
        ok: false,
        formDetected: detection.isCreateFlow,
        fields: [],
        error: detection.isCreateFlow
          ? `Das ${this.config.label}-Formular wurde erkannt, die Felder konnten aber nicht geladen werden.`
          : `${this.config.label}-Formular konnte nicht erkannt werden.`,
      };
    }

    const values = buildListingValues(this.config, product, this.settings);
    const fields = await fillListingForm(this.config, values, {
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
   * Reads the published listing's identity from the current page. Only reports
   * `detected: true` on an actual detail page; the creation form has no URL to
   * capture yet.
   */
  async extractListingInfo(): Promise<ListingInfo> {
    const url = this.doc.defaultView?.location.href ?? location.href;
    if (!isDetailPage(this.config, url)) return { detected: false };

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
      externalId: listingIdFromUrl(this.config, url),
      title: title || undefined,
      price: parseNumber(priceMeta),
    };
  }
}
