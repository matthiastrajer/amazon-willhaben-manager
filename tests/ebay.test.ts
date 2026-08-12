import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { fillEbayForm } from './helpers';
import {
  detectListingPage,
  isDetailPage,
  listingIdFromUrl,
} from '@/content/shared/formDetector';
import { collectCandidates, discoverFields } from '@/content/shared/fieldDiscovery';
import { buildListingValues } from '@/content/shared/listingValues';
import { EBAY_CONFIG } from '@/content/ebay/ebayConfig';
import { WILLHABEN_CONFIG } from '@/content/willhaben/willhabenConfig';
import { DEFAULT_SETTINGS } from '@/core/models/Settings';
import type { Product } from '@/core/models/Product';
import {
  EBAY_CREATE_URL,
  EBAY_ITEM_URL,
  ebayBrowsePage,
  ebayLabelledForm,
  ebayModernForm,
} from './fixtures/ebayForm';

const settings = {
  ...DEFAULT_SETTINGS,
  defaultPostalCode: '1010',
  defaultLocation: 'Wien',
};

const allFields = { ...settings, onlyCoreFields: false };

function doc(html: string): Document {
  return new JSDOM(html, { url: EBAY_CREATE_URL }).window.document;
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    title: 'YOLEO klappbare Hantelbank Multifunktion Training Fitness Bank',
    listingTitle: 'YOLEO klappbare Hantelbank – Neu',
    listingDescription: 'YOLEO klappbare Hantelbank\n\n• Sechsfach verstellbare Rückenlehne',
    description: '',
    bulletPoints: [],
    images: ['https://m.media-amazon.com/images/I/1.jpg'],
    selectedImages: [],
    brand: 'YOLEO',
    color: 'Schwarz',
    condition: 'NEU',
    currency: 'EUR',
    category: 'Sport & Freizeit',
    subcategory: 'Fitness',
    purchasePrice: 55,
    purchaseShipping: 0,
    purchaseOtherCosts: 0,
    plannedSalePrice: 89.9,
    status: 'READY_TO_LIST',
    quantity: 3,
    listedQuantity: 0,
    soldQuantity: 1,
    platform: 'ebay',
    importedAt: '2026-08-11T10:00:00.000Z',
    updatedAt: '2026-08-11T10:00:00.000Z',
    source: 'amazon',
    history: [],
    ...overrides,
  };
}

describe('eBay page detection', () => {
  it('recognises the listing form', () => {
    const result = detectListingPage(EBAY_CONFIG, doc(ebayLabelledForm()), EBAY_CREATE_URL);
    expect(result.isCreateFlow).toBe(true);
    expect(result.formReady).toBe(true);
    expect(result.foundFields).toContain('title');
    expect(result.foundFields).toContain('price');
  });

  it('recognises the framework-rendered variant', () => {
    expect(detectListingPage(EBAY_CONFIG, doc(ebayModernForm()), EBAY_CREATE_URL).formReady).toBe(
      true,
    );
  });

  it('does not mistake a search page for the listing form', () => {
    const d = new JSDOM(ebayBrowsePage(), { url: 'https://www.ebay.at/sch/i.html' }).window.document;
    const result = detectListingPage(EBAY_CONFIG, d, 'https://www.ebay.at/sch/i.html');
    expect(result.formReady).toBe(false);
    expect(result.reason).toMatch(/eBay/);
  });

  it('reads the item id out of a published listing URL', () => {
    expect(isDetailPage(EBAY_CONFIG, EBAY_ITEM_URL)).toBe(true);
    expect(listingIdFromUrl(EBAY_CONFIG, EBAY_ITEM_URL)).toBe('285123456789');
    expect(isDetailPage(EBAY_CONFIG, EBAY_CREATE_URL)).toBe(false);
  });

  it('keeps the published-listing URLs of the two marketplaces apart', () => {
    expect(
      isDetailPage(EBAY_CONFIG, 'https://www.willhaben.at/iad/kaufen-und-verkaufen/d/x-1234567890/'),
    ).toBe(false);
    expect(isDetailPage(WILLHABEN_CONFIG, EBAY_ITEM_URL)).toBe(false);
  });

  it('does not rely on field detection to tell the marketplaces apart', () => {
    // Both are German marketplaces, so "Titel"/"Preis"/"Beschreibung" match on
    // either form — the Willhaben profiles happily recognise the eBay form. That
    // is fine and expected: the separation comes from the manifest host match
    // (each content script only runs on its own domain) and from the platform
    // stamped on the hand-off, which the runner checks before filling anything.
    expect(
      detectListingPage(WILLHABEN_CONFIG, doc(ebayLabelledForm()), EBAY_CREATE_URL).formReady,
    ).toBe(true);
    // What genuinely differs is the field set each platform declares.
    const ebayIds = EBAY_CONFIG.fields.map((f) => f.id);
    const whIds = WILLHABEN_CONFIG.fields.map((f) => f.id);
    expect(ebayIds).toContain('quantity');
    expect(whIds).not.toContain('quantity');
    expect(whIds).toContain('pickup');
    expect(ebayIds).not.toContain('pickup');
  });
});

describe('eBay field discovery', () => {
  it('finds the eBay-specific fields via their German labels', () => {
    const found = discoverFields(EBAY_CONFIG.fields, collectCandidates(doc(ebayLabelledForm())));

    expect((found.get('title')!.candidate.element as HTMLElement).id).toBe('title');
    expect((found.get('description')!.candidate.element as HTMLElement).id).toBe('desc');
    expect((found.get('price')!.candidate.element as HTMLElement).id).toBe('price');
    expect((found.get('quantity')!.candidate.element as HTMLElement).id).toBe('qty');
    expect((found.get('condition')!.candidate.element as HTMLElement).id).toBe('cond');
  });

  it('does not confuse the paid subtitle with the title', () => {
    const found = discoverFields(EBAY_CONFIG.fields, collectCandidates(doc(ebayLabelledForm())));
    expect((found.get('title')!.candidate.element as HTMLElement).id).not.toBe('subtitle');
  });

  it('finds fields in the framework-rendered variant', () => {
    const found = discoverFields(EBAY_CONFIG.fields, collectCandidates(doc(ebayModernForm())));
    const title = found.get('title')!.candidate.element as HTMLElement;
    expect(title.getAttribute('data-testid')).toBe('listing-title-input');
    expect(found.has('description')).toBe(true);
    expect(found.has('price')).toBe(true);
    expect(found.has('quantity')).toBe(true);
  });
});

describe('eBay value mapping', () => {
  it('transfers only the essentials by default', () => {
    const values = buildListingValues(EBAY_CONFIG, product(), settings);
    expect(values.map((v) => v.field)).toEqual(['price', 'title', 'description', 'images']);
  });

  it('includes the eBay-only fields when the restriction is lifted', () => {
    const fields = buildListingValues(EBAY_CONFIG, product(), allFields).map((v) => v.field);
    expect(fields).toContain('quantity');
    expect(fields).toContain('condition');
    expect(fields).toContain('brand');
    expect(fields).toContain('postalCode');
  });

  it('offers the available stock as the quantity, not the purchase volume', () => {
    // 3 bought, 1 already sold → 2 can be listed.
    const quantity = buildListingValues(EBAY_CONFIG, product(), allFields).find(
      (v) => v.field === 'quantity',
    );
    expect(quantity?.value).toBe('2');
  });

  it('never produces a field the platform does not have', () => {
    // Willhaben has pickup, eBay does not.
    const ebayFields = buildListingValues(EBAY_CONFIG, product(), allFields).map((v) => v.field);
    expect(ebayFields).not.toContain('pickup');

    const whFields = buildListingValues(WILLHABEN_CONFIG, product(), allFields).map((v) => v.field);
    expect(whFields).toContain('pickup');
    expect(whFields).not.toContain('quantity');
  });
});

describe('eBay form filling', () => {
  it('fills the essentials and reports the rest honestly', async () => {
    const d = doc(ebayLabelledForm());
    const results = await fillEbayForm(product(), settings, { doc: d, settleMs: 0 });

    expect((d.getElementById('title') as HTMLInputElement).value).toBe(
      'YOLEO klappbare Hantelbank – Neu',
    );
    expect((d.getElementById('price') as HTMLInputElement).value).toBe('89,90');
    expect((d.getElementById('desc') as HTMLTextAreaElement).value).toContain('Hantelbank');

    expect(results.find((r) => r.field === 'images')!.status).toBe('manual');
    expect(results.filter((r) => r.status === 'not-found')).toEqual([]);
    // The paid subtitle stays empty.
    expect((d.getElementById('subtitle') as HTMLInputElement).value).toBe('');
  });

  it('fills quantity and condition when the restriction is lifted', async () => {
    const d = doc(ebayLabelledForm());
    await fillEbayForm(product(), allFields, { doc: d, settleMs: 0 });

    expect((d.getElementById('qty') as HTMLInputElement).value).toBe('2');
    expect((d.getElementById('cond') as HTMLSelectElement).value).toBe('1000'); // Neu
    expect((d.getElementById('brand') as HTMLInputElement).value).toBe('YOLEO');
    expect((d.getElementById('zip') as HTMLInputElement).value).toBe('1010');
  });

  it('fills the contenteditable description of the modern variant', async () => {
    const d = doc(ebayModernForm());
    const results = await fillEbayForm(product(), settings, { doc: d, settleMs: 0 });

    const editor = d.querySelector('[contenteditable="true"]') as HTMLElement;
    expect(editor.textContent).toContain('Hantelbank');
    expect(results.find((r) => r.field === 'description')!.status).toBe('filled');
  });

  it('never touches a search form', async () => {
    const d = new JSDOM(ebayBrowsePage(), { url: 'https://www.ebay.at/sch/i.html' }).window.document;
    await fillEbayForm(product(), settings, { doc: d, settleMs: 0 });

    expect((d.getElementById('q') as HTMLInputElement).value).toBe('');
    expect((d.getElementById('pf') as HTMLInputElement).value).toBe('');
    expect((d.getElementById('pt') as HTMLInputElement).value).toBe('');
  });

  it('reports the category as manual because eBay demands its own attributes', async () => {
    const results = await fillEbayForm(product(), allFields, {
      doc: doc(ebayLabelledForm()),
      settleMs: 0,
    });
    const category = results.find((r) => r.field === 'category')!;
    expect(category.status).toBe('manual');
    expect(category.reason).toMatch(/Artikelmerkmale/);
  });
});
