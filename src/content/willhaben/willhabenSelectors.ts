/**
 * Willhaben form field profiles.
 *
 * Important design decision — please read before changing anything here.
 *
 * Willhaben's "Anzeige aufgeben" flow is a login-gated, dynamically rendered
 * application whose CSS class names are generated and therefore unstable. This
 * file deliberately contains NO invented CSS class selectors. Instead each
 * logical field is described by *semantic* evidence that a form control carries
 * regardless of styling:
 *
 *   - the text of its associated <label>
 *   - aria-label / aria-labelledby
 *   - placeholder text
 *   - name / id / data-testid token fragments
 *   - the input type and element kind
 *   - nearby heading or descriptive text
 *
 * `WillhabenFieldMapper` scores every visible control against these profiles and
 * picks the best match above a confidence floor. Fields that cannot be matched
 * are reported to the user for manual entry rather than guessed at.
 */

export type WillhabenFieldId =
  | 'title'
  | 'description'
  | 'price'
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
  id: WillhabenFieldId;
  label: string;
  /** Which control kinds are plausible for this field. */
  kinds: ControlKind[];
  /**
   * Normalised keyword groups. `must` raises the score strongly, `nice` weakly,
   * `never` disqualifies the candidate outright.
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

export const WILLHABEN_FIELDS: FieldProfile[] = [
  {
    id: 'title',
    label: 'Titel',
    kinds: ['text'],
    keywords: {
      must: ['titel', 'title', 'anzeigentitel', 'überschrift', 'uberschrift', 'headline'],
      nice: ['anzeige', 'was verkaufst'],
      never: ['untertitel', 'suchen', 'search', 'benutzername', 'email', 'passwort'],
    },
    maxLength: 100,
    autoFillable: true,
  },
  {
    id: 'description',
    label: 'Beschreibung',
    kinds: ['textarea', 'text'],
    keywords: {
      // No bare "text": it matches far too much once caption text is scored.
      // The last four come from the field's own placeholder on the live form
      // ("z.B. Abmessungen, Größe, Gründe für den Verkauf, Mängel/Defekte falls
      // vorhanden."), which is wording rather than markup and gives the editor
      // real positive evidence even though it carries no label.
      must: [
        'beschreibung', 'description', 'anzeigentext',
        'abmessungen', 'grunde fur den verkauf', 'mangel defekte', 'defekte falls vorhanden',
      ],
      nice: ['beschreibe', 'weitere informationen', 'details'],
      never: ['kurzbeschreibung suche', 'suchbegriff'],
    },
    autoFillable: true,
  },
  {
    id: 'price',
    label: 'Preis',
    kinds: ['number', 'text'],
    keywords: {
      must: ['preis', 'price', 'betrag', 'kaufpreis', 'verkaufspreis'],
      nice: ['euro', 'eur', 'amount'],
      never: ['preisvorstellung von', 'preis von', 'preis bis', 'versandkosten', 'shipping'],
    },
    maxLength: 12,
    autoFillable: true,
  },
  {
    id: 'category',
    label: 'Kategorie',
    kinds: ['select', 'text'],
    keywords: {
      must: ['kategorie', 'category', 'rubrik'],
      nice: ['unterkategorie', 'subcategory'],
    },
    autoFillable: false,
    manualHint:
      'Willhaben schlägt die Kategorie automatisch anhand des Anzeigentitels vor. Bitte kurz prüfen und bei Bedarf über „Andere Kategorie wählen“ korrigieren.',
  },
  {
    id: 'condition',
    label: 'Zustand',
    kinds: ['select', 'radio', 'text'],
    keywords: {
      must: ['zustand', 'condition'],
      nice: ['neu', 'gebraucht', 'neuwertig'],
    },
    autoFillable: true,
  },
  {
    id: 'brand',
    label: 'Marke',
    kinds: ['text', 'select'],
    keywords: {
      must: ['marke', 'brand', 'hersteller', 'manufacturer'],
    },
    maxLength: 60,
    autoFillable: true,
  },
  {
    id: 'color',
    label: 'Farbe',
    kinds: ['text', 'select'],
    keywords: { must: ['farbe', 'colour', 'color'] },
    maxLength: 40,
    autoFillable: true,
  },
  {
    id: 'size',
    label: 'Größe',
    kinds: ['text', 'select'],
    keywords: {
      must: ['grösse', 'grosse', 'groesse', 'größe', 'size'],
      never: ['dateigrösse', 'dateigrosse', 'filesize'],
    },
    maxLength: 40,
    autoFillable: true,
  },
  {
    id: 'postalCode',
    label: 'PLZ',
    kinds: ['text', 'number'],
    keywords: {
      must: ['plz', 'postleitzahl', 'postal code', 'zip'],
    },
    maxLength: 10,
    autoFillable: true,
  },
  {
    id: 'location',
    label: 'Ort',
    kinds: ['text', 'select'],
    keywords: {
      must: ['ort', 'stadt', 'standort', 'location', 'city', 'bezirk'],
      never: ['ortsteil suche', 'umkreis'],
    },
    maxLength: 60,
    autoFillable: true,
  },
  {
    id: 'shipping',
    label: 'Versand',
    kinds: ['checkbox', 'select', 'radio', 'text'],
    keywords: {
      must: ['versand', 'shipping', 'lieferung', 'versenden'],
      nice: ['versandkosten', 'paket'],
    },
    autoFillable: true,
  },
  {
    id: 'pickup',
    label: 'Abholung',
    kinds: ['checkbox', 'radio', 'select'],
    keywords: {
      must: ['abholung', 'selbstabholung', 'abholen', 'pickup'],
    },
    autoFillable: true,
  },
  {
    id: 'images',
    label: 'Bilder',
    kinds: ['file'],
    keywords: {
      must: ['bild', 'bilder', 'foto', 'fotos', 'image', 'upload'],
    },
    autoFillable: false,
    manualHint:
      'Bilder müssen aus Sicherheitsgründen selbst ausgewählt werden (Drag & Drop oder „Dateien durchsuchen“). Die Bild-URLs stehen hier zum Kopieren bereit.',
  },
];

export function profileFor(id: WillhabenFieldId): FieldProfile | undefined {
  return WILLHABEN_FIELDS.find((f) => f.id === id);
}

/**
 * Page markers that indicate the ad-creation flow is on screen. Matching is
 * done on visible text and on URL path fragments, both of which are far more
 * stable than markup.
 */
export const CREATE_FORM_URL_HINTS = [
  '/anzeigenaufgabe',
  '/anzeigeaufgeben',
  '/iad/anzeige-aufgeben',
  '/anzeige-aufgeben',
  '/verkaufen',
  '/inserieren',
  '/kaufen-und-verkaufen/verkaufen',
];

export const CREATE_FORM_TEXT_HINTS = [
  'anzeige aufgeben',
  'anzeige erstellen',
  'anzeigendetails',
  'kostenlos inserieren',
  'kostenlose anzeige aufgeben',
  'was möchtest du verkaufen',
  'was moechtest du verkaufen',
  'neue anzeige',
  'anzeige bearbeiten',
];

/** Willhaben ad detail URLs, used to capture the listing URL after publishing. */
export const AD_DETAIL_URL_PATTERNS = [
  /\/iad\/kaufen-und-verkaufen\/d\/[^/]+-(\d{6,})/i,
  /\/iad\/[^/]+\/d\/[^/]+-(\d{6,})/i,
  /\/d\/[^/]+-(\d{6,})/i,
];
