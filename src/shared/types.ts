import type { Product } from '@/core/models/Product';

/** Confidence in a single extracted field, surfaced in the UI and debug view. */
export type FieldConfidence = 'high' | 'medium' | 'low' | 'missing';

export interface ExtractedField<T> {
  value: T | undefined;
  confidence: FieldConfidence;
  /** Which strategy produced the value, e.g. "json-ld", "meta:og:title". */
  source: string;
}

/** Raw product data as scraped from a marketplace page. */
export interface ExtractedProduct {
  title?: string;
  description?: string;
  bulletPoints: string[];
  images: string[];
  brand?: string;
  asin?: string;
  ean?: string;
  gtin?: string;
  category?: string;
  subcategory?: string;
  categoryPath: string[];
  color?: string;
  size?: string;
  weight?: string;
  price?: number;
  listPrice?: number;
  currency: string;
  url: string;
  availability?: string;
  seller?: string;
}

export interface ExtractionReport {
  /** Per-field provenance, used by the debug view and the analysis summary. */
  fields: Record<string, { confidence: FieldConfidence; source: string }>;
  warnings: string[];
  durationMs: number;
}

export interface ExtractionResult {
  ok: boolean;
  product?: ExtractedProduct;
  report: ExtractionReport;
  error?: string;
}

/** Result of trying to fill one field of a marketplace form. */
export type FillStatus = 'filled' | 'skipped' | 'not-found' | 'manual';

export interface FieldFillResult {
  field: string;
  label: string;
  status: FillStatus;
  value?: string;
  /** Human readable reason shown in the assist panel. */
  reason?: string;
  /** How the element was located, e.g. 'label-match', 'aria-label', 'hint'. */
  matchedBy?: string;
}

export interface FillResult {
  ok: boolean;
  formDetected: boolean;
  fields: FieldFillResult[];
  error?: string;
}

export interface ListingInfo {
  url?: string;
  externalId?: string;
  title?: string;
  price?: number;
  detected: boolean;
}

/** Common surface every marketplace integration implements. */
export interface PlatformAdapter {
  readonly platform: string;
  detect(): Promise<boolean>;
  prepareListing(product: Product): Promise<FillResult>;
  extractListingInfo(): Promise<ListingInfo>;
}

/** Payload handed from the popup/service worker to the Willhaben content script. */
export interface PendingListing {
  productId: string;
  product: Product;
  /** Which marketplace this hand-off is for. */
  platform: string;
  createdAt: string;
  /** Set once the content script has filled the form for this hand-off. */
  consumedAt?: string;
}

export interface AmazonPageState {
  isAmazon: boolean;
  isProductPage: boolean;
  host?: string;
  asin?: string;
}
