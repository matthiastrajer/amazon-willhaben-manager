/**
 * Platform-independent vocabulary for describing a marketplace listing form.
 *
 * Every supported marketplace supplies an array of `FieldProfile`s; everything
 * else — discovery, scoring, writing, the assist panel — is shared. Adding a
 * marketplace therefore means describing its fields, not writing new machinery.
 *
 * The profiles deliberately contain NO CSS class selectors. Fields are located
 * by the semantic evidence a control carries regardless of styling: label text,
 * aria attributes, placeholder wording, name/id/data-testid tokens, the control
 * kind, and the visible caption rendered next to it.
 */

/** Union of every field any supported marketplace can offer. */
export type ListingFieldId =
  | 'title'
  | 'subtitle'
  | 'description'
  | 'price'
  | 'quantity'
  | 'category'
  | 'condition'
  | 'brand'
  | 'color'
  | 'size'
  | 'postalCode'
  | 'location'
  | 'shipping'
  | 'pickup'
  | 'images';

export type ControlKind = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'radio' | 'file';

export interface FieldProfile {
  id: ListingFieldId;
  /** German label shown in the assist panel. */
  label: string;
  /** Which control kinds are plausible for this field. */
  kinds: ControlKind[];
  /**
   * Normalised keyword groups. `must` raises the score strongly, `nice` weakly,
   * `never` disqualifies the candidate outright.
   *
   * `must`/`nice` match as substrings, because German compounds mean the caption
   * "Verkaufspreis" has to satisfy the keyword "preis". `never` matches whole
   * words only, and only against authored evidence — see fieldDiscovery.
   */
  keywords: {
    must: string[];
    nice?: string[];
    never?: string[];
  };
  /** Maximum sensible length of the value — filters out wrong matches. */
  maxLength?: number;
  /** Whether the extension is able to fill this field automatically at all. */
  autoFillable: boolean;
  /** Shown in the assist panel when automatic filling is not possible. */
  manualHint?: string;
}

/** Everything the shared machinery needs to know about one marketplace. */
export interface PlatformFormConfig {
  /** Platform id as stored on products and listings, e.g. "willhaben". */
  platform: string;
  /** Human-readable name for the assist panel. */
  label: string;
  fields: FieldProfile[];
  /** Fields that must be present for the form to count as ready. */
  coreFields: ListingFieldId[];
  /** Fields transferred when the user restricts the transfer to the essentials. */
  essentialFields: ListingFieldId[];
  /** URL path fragments hinting at the listing-creation flow. */
  urlHints: string[];
  /** Visible page text hinting at the listing-creation flow. */
  textHints: string[];
  /** Patterns matching a published listing's URL; group 1 is the listing id. */
  detailUrlPatterns: RegExp[];
}

export function profileFor(
  config: PlatformFormConfig,
  id: ListingFieldId,
): FieldProfile | undefined {
  return config.fields.find((f) => f.id === id);
}
