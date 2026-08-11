/**
 * Product — the single source of truth for everything the user owns or plans
 * to resell. Products may come from an Amazon import or be created manually.
 *
 * Quantity semantics (deliberately explicit, because it is easy to get wrong):
 *
 *   quantity       total number of units acquired. Does NOT shrink on a sale —
 *                  it is the historical purchase volume.
 *   soldQuantity   sum of the quantities of all recorded Sales.
 *   listedQuantity how many units the user currently has advertised.
 *   available      DERIVED: quantity - soldQuantity. This is what the UI calls
 *                  "Bestand"/"Verfügbar" and what capital-in-stock is based on.
 *
 * Never store `available` — it is computed by InventoryService so that stock can
 * never drift out of sync with the sales ledger.
 */

export const PRODUCT_STATUS = {
  DRAFT: 'DRAFT',
  READY_TO_LIST: 'READY_TO_LIST',
  LISTED: 'LISTED',
  SOLD: 'SOLD',
  CANCELLED: 'CANCELLED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type ProductStatus = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

export const PRODUCT_STATUS_ORDER: ProductStatus[] = [
  'DRAFT',
  'READY_TO_LIST',
  'LISTED',
  'SOLD',
  'ARCHIVED',
  'CANCELLED',
];

export interface ProductStatusMeta {
  label: string;
  dot: string;
  /** css custom-property suffix used by the design system */
  tone: 'draft' | 'ready' | 'listed' | 'sold' | 'archived' | 'cancelled';
  description: string;
}

export const PRODUCT_STATUS_META: Record<ProductStatus, ProductStatusMeta> = {
  DRAFT: {
    label: 'Entwurf',
    dot: '🟡',
    tone: 'draft',
    description: 'Importiert bzw. angelegt, noch nichts vorbereitet.',
  },
  READY_TO_LIST: {
    label: 'Bereit zum Listen',
    dot: '🟠',
    tone: 'ready',
    description: 'Willhaben-Formular wurde vorbereitet – noch nicht bestätigt veröffentlicht.',
  },
  LISTED: {
    label: 'Gelistet',
    dot: '🔵',
    tone: 'listed',
    description: 'Vom Benutzer bestätigt: die Anzeige ist online.',
  },
  SOLD: {
    label: 'Verkauft',
    dot: '🟢',
    tone: 'sold',
    description: 'Alle Einheiten verkauft.',
  },
  ARCHIVED: {
    label: 'Archiviert',
    dot: '⚪',
    tone: 'archived',
    description: 'Aus dem aktiven Bestand genommen.',
  },
  CANCELLED: {
    label: 'Storniert',
    dot: '🔴',
    tone: 'cancelled',
    description: 'Einkauf storniert / retourniert.',
  },
};

/** Condition of the item as it will be advertised. */
export const CONDITIONS = ['NEU', 'WIE_NEU', 'SEHR_GUT', 'GUT', 'GEBRAUCHT', 'DEFEKT'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<Condition, string> = {
  NEU: 'Neu',
  WIE_NEU: 'Neuwertig',
  SEHR_GUT: 'Sehr gut',
  GUT: 'Gut',
  GEBRAUCHT: 'Gebraucht',
  DEFEKT: 'Defekt / Bastler',
};

export interface ProductHistoryEntry {
  at: string;
  event: string;
  detail?: string;
}

export interface Product {
  id: string;

  title: string;
  /** Title prepared for the marketplace listing (editable by the user). */
  listingTitle?: string;
  description: string;
  /** Description prepared for the marketplace listing (editable by the user). */
  listingDescription?: string;
  bulletPoints: string[];

  images: string[];
  /** Subset of `images` the user selected for the listing. Empty = all. */
  selectedImages: string[];

  brand?: string;
  asin?: string;
  ean?: string;
  gtin?: string;
  category?: string;
  subcategory?: string;
  color?: string;
  size?: string;
  weight?: string;
  condition: Condition;

  /** Price shown on the Amazon page at import time (informational). */
  amazonPrice?: number;
  currency: string;
  amazonUrl?: string;
  availability?: string;
  seller?: string;

  /** Per-unit purchase costs. */
  purchasePrice: number;
  purchaseShipping: number;
  purchaseOtherCosts: number;

  plannedSalePrice?: number;

  status: ProductStatus;

  quantity: number;
  listedQuantity: number;
  soldQuantity: number;

  /** Primary platform for this product; listings carry the per-platform truth. */
  platform: string;

  importedAt: string;
  updatedAt: string;
  preparedAt?: string;
  listedAt?: string;
  soldAt?: string;

  source: 'amazon' | 'manual';
  /**
   * Whether listingTitle/listingDescription were generated or typed by the user.
   * Generated text is refreshed when the product is prepared again, so improved
   * generation rules and changed settings take effect; manual text is never
   * overwritten.
   */
  listingTextSource?: 'auto' | 'manual';
  notes?: string;
  history: ProductHistoryEntry[];
}

/** Fields a user may edit directly in the product form. */
export type ProductInput = Partial<Omit<Product, 'id' | 'importedAt' | 'history'>>;
