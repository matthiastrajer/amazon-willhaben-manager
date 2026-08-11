/**
 * Listing — one advertisement of one product on one platform.
 *
 * A product can carry several listings (Willhaben today, eBay/Shpock later),
 * which is why listings are a separate collection rather than fields on Product.
 */

export const LISTING_STATUS = {
  PREPARED: 'PREPARED',
  ACTIVE: 'ACTIVE',
  SOLD: 'SOLD',
  ENDED: 'ENDED',
} as const;

export type ListingStatus = (typeof LISTING_STATUS)[keyof typeof LISTING_STATUS];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  PREPARED: 'Vorbereitet',
  ACTIVE: 'Online',
  SOLD: 'Verkauft',
  ENDED: 'Beendet',
};

export interface Listing {
  id: string;
  productId: string;
  platform: string;

  /** URL of the published ad. Unknown until the user publishes it. */
  url?: string;
  /** Platform-side id, e.g. the numeric Willhaben ad id parsed out of the URL. */
  externalId?: string;

  status: ListingStatus;
  listedPrice?: number;

  title?: string;
  description?: string;

  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}
