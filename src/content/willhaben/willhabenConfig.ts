import type { PlatformFormConfig } from '../shared/fieldProfiles';

/**
 * Willhaben Marktplatz ("Anzeige aufgeben") form description.
 *
 * Verified against the live form: captions are rendered as separate elements
 * *before* the field rather than as `<label for>`, the price input sits next to a
 * "€" prefix and a "zu verschenken" toggle, the category is suggested by
 * Willhaben itself from the title, and the description is a contenteditable
 * editor inside a shadow root that carries only a `data-placeholder`.
 */
export const WILLHABEN_CONFIG: PlatformFormConfig = {
  platform: 'willhaben',
  label: 'Willhaben',
  coreFields: ['title', 'price', 'description'],
  essentialFields: ['price', 'title', 'description'],

  urlHints: [
    '/anzeigenaufgabe',
    '/anzeigeaufgeben',
    '/iad/anzeige-aufgeben',
    '/anzeige-aufgeben',
    '/verkaufen',
    '/inserieren',
    '/kaufen-und-verkaufen/verkaufen',
  ],

  textHints: [
    'anzeige aufgeben',
    'anzeige erstellen',
    'anzeigendetails',
    'kostenlos inserieren',
    'kostenlose anzeige aufgeben',
    'was möchtest du verkaufen',
    'was moechtest du verkaufen',
    'neue anzeige',
    'anzeige bearbeiten',
  ],

  detailUrlPatterns: [
    /\/iad\/kaufen-und-verkaufen\/d\/[^/]+-(\d{6,})/i,
    /\/iad\/[^/]+\/d\/[^/]+-(\d{6,})/i,
    /\/d\/[^/]+-(\d{6,})/i,
  ],

  fields: [
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
      label: 'Verkaufspreis',
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
      keywords: { must: ['marke', 'brand', 'hersteller', 'manufacturer'] },
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
      keywords: { must: ['plz', 'postleitzahl', 'postal code', 'zip'] },
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
      keywords: { must: ['abholung', 'selbstabholung', 'abholen', 'pickup'] },
      autoFillable: true,
    },
    {
      id: 'images',
      label: 'Bilder',
      kinds: ['file'],
      keywords: { must: ['bild', 'bilder', 'foto', 'fotos', 'image', 'upload'] },
      autoFillable: false,
      manualHint:
        'Bilder müssen aus Sicherheitsgründen selbst ausgewählt werden (Drag & Drop oder „Dateien durchsuchen“). Die Bild-URLs stehen hier zum Kopieren bereit.',
    },
  ],
};
