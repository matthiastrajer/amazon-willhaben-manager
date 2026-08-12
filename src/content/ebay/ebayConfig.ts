import type { PlatformFormConfig } from '../shared/fieldProfiles';

/**
 * eBay "Angebot erstellen" form description.
 *
 * IMPORTANT — how far this is verified:
 *
 * Unlike the Willhaben config, this one could NOT be checked against the live
 * form: ebay.at/ebay.de were unreachable from the development environment. So no
 * CSS selectors are guessed here either. The profiles below rest on two things
 * that do not depend on markup:
 *
 *   1. the German wording eBay uses for these fields ("Titel", "Artikelzustand",
 *      "Sofort-Kaufen-Preis", "Menge", "Artikelstandort" …), matched against
 *      label / aria-label / placeholder / caption / name / id / data-testid;
 *   2. the shared discovery engine's fallbacks, including the single-editor
 *      deduction for the description.
 *
 * Anything that cannot be matched is reported to the user for manual entry with
 * the value ready to copy — the extension never guesses and never submits.
 *
 * eBay does have an official Sell API, but it requires OAuth application
 * credentials and a server component. That would contradict the local-only,
 * no-backend design, and private endpoints are off limits, so the same
 * "prefill the visible form, the user publishes" approach is used here.
 */
export const EBAY_CONFIG: PlatformFormConfig = {
  platform: 'ebay',
  label: 'eBay',
  coreFields: ['title', 'price', 'description'],
  essentialFields: ['price', 'title', 'description'],

  urlHints: [
    '/sl/sell',
    '/sl/prelist',
    '/sl/list',
    '/lstng',
    '/sell/create',
    '/verkaufen',
  ],

  textHints: [
    'angebot erstellen',
    'artikel einstellen',
    'anzeige erstellen',
    'was verkaufst du',
    'verkaufsformular',
    'artikel beschreiben',
    'angebotsdetails',
    'create listing',
    'sell your item',
  ],

  // Published eBay item URLs: /itm/<slug>/<itemId> or /itm/<itemId>.
  detailUrlPatterns: [
    /\/itm\/[^/]+\/(\d{9,})/i,
    /\/itm\/(\d{9,})/i,
    /[?&]item=(\d{9,})/i,
  ],

  fields: [
    {
      id: 'title',
      label: 'Titel',
      kinds: ['text'],
      keywords: {
        must: ['titel', 'title', 'artikeltitel', 'angebotstitel'],
        nice: ['was verkaufst', 'artikelbezeichnung'],
        never: ['untertitel', 'subtitle', 'suchen', 'search', 'benutzername', 'email', 'passwort'],
      },
      maxLength: 80,
      autoFillable: true,
    },
    {
      id: 'subtitle',
      label: 'Untertitel',
      kinds: ['text'],
      keywords: {
        // eBay charges for the subtitle, so it is offered but never auto-filled.
        must: ['untertitel', 'subtitle'],
      },
      maxLength: 55,
      autoFillable: false,
      manualHint: 'eBay berechnet für den Untertitel eine Gebühr – daher bewusst nicht ausgefüllt.',
    },
    {
      id: 'description',
      label: 'Beschreibung',
      kinds: ['textarea', 'text'],
      keywords: {
        must: [
          'beschreibung', 'description', 'artikelbeschreibung', 'angebotsbeschreibung',
        ],
        nice: ['beschreibe', 'weitere details', 'zustandsbeschreibung'],
        never: ['suchbegriff', 'kurzbeschreibung suche'],
      },
      autoFillable: true,
    },
    {
      id: 'price',
      label: 'Preis',
      kinds: ['number', 'text'],
      keywords: {
        must: [
          'sofort kaufen preis', 'sofort kaufen', 'festpreis', 'startpreis',
          'preis', 'price', 'buy it now',
        ],
        nice: ['euro', 'eur', 'betrag'],
        never: [
          'preis von', 'preis bis', 'versandkosten', 'shipping cost', 'mindestpreis',
          'sofort kaufen option', 'gebot', 'reserve',
        ],
      },
      maxLength: 12,
      autoFillable: true,
    },
    {
      id: 'quantity',
      label: 'Menge',
      kinds: ['number', 'text', 'select'],
      keywords: {
        must: ['menge', 'anzahl', 'quantity', 'stuckzahl'],
        never: ['mengenrabatt', 'losgrosse'],
      },
      maxLength: 6,
      autoFillable: true,
    },
    {
      id: 'condition',
      label: 'Artikelzustand',
      kinds: ['select', 'radio', 'text'],
      keywords: {
        must: ['artikelzustand', 'zustand', 'condition'],
        nice: ['neu', 'gebraucht', 'neuwertig'],
      },
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
        'eBay schlägt die Kategorie anhand des Titels vor und verlangt anschließend Pflichtangaben ("Artikelmerkmale"). Bitte einmal manuell bestätigen.',
    },
    {
      id: 'brand',
      label: 'Marke',
      kinds: ['text', 'select'],
      keywords: { must: ['marke', 'brand', 'hersteller', 'manufacturer'] },
      maxLength: 65,
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
        never: ['dateigrösse', 'dateigrosse', 'filesize', 'grossenangabe tabelle'],
      },
      maxLength: 40,
      autoFillable: true,
    },
    {
      id: 'postalCode',
      label: 'PLZ',
      kinds: ['text', 'number'],
      keywords: {
        must: ['plz', 'postleitzahl', 'postal code', 'zip', 'artikelstandort'],
      },
      maxLength: 10,
      autoFillable: true,
    },
    {
      id: 'location',
      label: 'Ort',
      kinds: ['text', 'select'],
      keywords: {
        must: ['ort', 'stadt', 'standort', 'location', 'city'],
        never: ['umkreis', 'lieferort suche'],
      },
      maxLength: 60,
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
        'Bilder müssen aus Sicherheitsgründen selbst ausgewählt werden. Die Bild-URLs stehen hier zum Kopieren bereit.',
    },
  ],
};
