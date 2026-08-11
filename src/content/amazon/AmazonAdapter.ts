import type {
  AmazonPageState,
  ExtractionResult,
  FillResult,
  ListingInfo,
  PlatformAdapter,
} from '@/shared/types';
import { extractAmazonProduct, isAmazonHost, isProductPage } from './amazonExtractor';
import { extractAsinFromUrl } from '@/core/services/DuplicateService';

/**
 * Amazon side of the PlatformAdapter contract.
 *
 * Amazon is a *source* platform: it can be detected and read, but nothing is
 * ever written to it. `prepareListing` therefore reports that it is not
 * supported rather than pretending to do something.
 */
export class AmazonAdapter implements PlatformAdapter {
  readonly platform = 'amazon';

  constructor(
    private readonly doc: Document = document,
    private readonly url: string = location.href,
  ) {}

  async detect(): Promise<boolean> {
    return this.state().isProductPage;
  }

  state(): AmazonPageState {
    const hostname = (() => {
      try {
        return new URL(this.url).hostname;
      } catch {
        return '';
      }
    })();

    const isAmazon = isAmazonHost(hostname);
    return {
      isAmazon,
      isProductPage: isAmazon && isProductPage(this.doc, this.url),
      host: hostname,
      asin: extractAsinFromUrl(this.url),
    };
  }

  extract(): ExtractionResult {
    return extractAmazonProduct(this.doc, this.url);
  }

  async prepareListing(): Promise<FillResult> {
    return {
      ok: false,
      formDetected: false,
      fields: [],
      error: 'Amazon ist eine Quell-Plattform – hier werden keine Anzeigen erstellt.',
    };
  }

  async extractListingInfo(): Promise<ListingInfo> {
    const state = this.state();
    return {
      url: this.url,
      externalId: state.asin,
      detected: state.isProductPage,
    };
  }
}
