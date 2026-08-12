/** Storage keys. Bumping SCHEMA_VERSION triggers the migration path. */
export const STORAGE_KEYS = {
  products: 'awm.products',
  sales: 'awm.sales',
  listings: 'awm.listings',
  templates: 'awm.templates',
  settings: 'awm.settings',
  meta: 'awm.meta',
  /** Hand-off payload consumed by the Willhaben content script. */
  pendingListing: 'awm.pendingListing',
  /** User-taught field selectors for the Willhaben form. */
  fieldHints: 'awm.fieldHints',
} as const;

export const SCHEMA_VERSION = 1;

export const PLATFORMS = [
  { id: 'willhaben', label: 'Willhaben', supported: true },
  { id: 'ebay', label: 'eBay', supported: true },
  { id: 'facebook_marketplace', label: 'Facebook Marketplace', supported: false },
  { id: 'shpock', label: 'Shpock', supported: false },
  { id: 'vinted', label: 'Vinted', supported: false },
  { id: 'other', label: 'Andere', supported: false },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]['id'];

export function platformLabel(id: string | undefined): string {
  return PLATFORMS.find((p) => p.id === id)?.label ?? id ?? '–';
}

/**
 * Amazon marketplaces the extension understands. Adding a marketplace means
 * adding one entry here plus the matching host permission in the manifest.
 */
export const AMAZON_DOMAINS = [
  { host: 'www.amazon.de', tld: 'de', currency: 'EUR', locale: 'de-DE' },
  { host: 'www.amazon.at', tld: 'at', currency: 'EUR', locale: 'de-AT' },
  { host: 'www.amazon.com', tld: 'com', currency: 'USD', locale: 'en-US' },
] as const;

export const WILLHABEN_HOST = 'www.willhaben.at';

/** eBay marketplaces the extension understands. */
export const EBAY_HOSTS = ['www.ebay.at', 'www.ebay.de', 'www.ebay.com'] as const;

export const DASHBOARD_PAGE = 'src/dashboard/index.html';
