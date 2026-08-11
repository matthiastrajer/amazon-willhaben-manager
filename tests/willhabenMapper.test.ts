import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { collectCandidates, discoverFields, scoreCandidate } from '@/content/willhaben/fieldDiscovery';
import {
  fillWillhabenForm,
  mapProductToFields,
  setControlValue,
} from '@/content/willhaben/WillhabenFieldMapper';
import {
  adIdFromUrl,
  detectWillhabenPage,
  isAdDetailPage,
} from '@/content/willhaben/willhabenDetector';
import { WILLHABEN_FIELDS, profileFor } from '@/content/willhaben/willhabenSelectors';
import { parseWillhabenId } from '@/core/services/ListingService';
import { DEFAULT_SETTINGS } from '@/core/models/Settings';
import type { Product } from '@/core/models/Product';
import {
  AD_DETAIL_URL,
  CREATE_FORM_URL,
  CREATE_CHOOSER_URL,
  ariaForm,
  frameworkForm,
  labelledForm,
  marktplatzForm,
  notFoundPage,
  partialForm,
  unrelatedPage,
} from './fixtures/willhabenForm';

function doc(html: string): Document {
  return new JSDOM(html, { url: CREATE_FORM_URL }).window.document;
}

const settings = {
  ...DEFAULT_SETTINGS,
  defaultPostalCode: '1010',
  defaultLocation: 'Wien',
  defaultShipping: 'Versand möglich',
};

/**
 * By default only price/title/description are transferred. These suites verify
 * the discovery engine across the whole profile set, so they opt out.
 */
const allFieldSettings = { ...settings, onlyCoreFields: false };

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    title: 'Fitgriff Zughilfen',
    listingTitle: 'Fitgriff Zughilfen / Lifting Straps – Neu',
    listingDescription: 'Fitgriff Zughilfen.\n\nZustand:\nNeu',
    description: 'Zughilfen',
    bulletPoints: ['Gepolstert'],
    images: ['https://m.media-amazon.com/images/I/1.jpg', 'https://m.media-amazon.com/images/I/2.jpg'],
    selectedImages: [],
    brand: 'Fitgriff',
    color: 'Schwarz',
    size: 'Einheitsgröße',
    condition: 'NEU',
    currency: 'EUR',
    category: 'Sport & Freizeit',
    subcategory: 'Fitness & Krafttraining',
    purchasePrice: 9.99,
    purchaseShipping: 0,
    purchaseOtherCosts: 0,
    plannedSalePrice: 19.99,
    status: 'READY_TO_LIST',
    quantity: 1,
    listedQuantity: 0,
    soldQuantity: 0,
    platform: 'willhaben',
    importedAt: '2026-08-11T10:00:00.000Z',
    updatedAt: '2026-08-11T10:00:00.000Z',
    source: 'amazon',
    history: [],
    ...overrides,
  };
}

describe('page detection', () => {
  it('detects the ad-creation flow through its fields', () => {
    const result = detectWillhabenPage(doc(labelledForm()), CREATE_FORM_URL);
    expect(result.isCreateFlow).toBe(true);
    expect(result.formReady).toBe(true);
    expect(result.foundFields).toContain('title');
    expect(result.foundFields).toContain('price');
  });

  it('detects it in a framework-rendered form without labels', () => {
    const result = detectWillhabenPage(doc(frameworkForm()), CREATE_FORM_URL);
    expect(result.formReady).toBe(true);
  });

  it('does not mistake the search page for the ad form', () => {
    const result = detectWillhabenPage(
      new JSDOM(unrelatedPage(), { url: 'https://www.willhaben.at/iad/' }).window.document,
      'https://www.willhaben.at/iad/',
    );
    expect(result.formReady).toBe(false);
    expect(result.reason).toMatch(/Keine Willhaben-Anzeigenerstellung/);
  });

  it('recognises an ad detail URL and its id', () => {
    expect(isAdDetailPage(AD_DETAIL_URL)).toBe(true);
    expect(adIdFromUrl(AD_DETAIL_URL)).toBe('1234567890');
    expect(isAdDetailPage(CREATE_FORM_URL)).toBe(false);
    expect(parseWillhabenId(AD_DETAIL_URL)).toBe('1234567890');
  });
});

describe('semantic field discovery', () => {
  it('finds fields via <label for>', () => {
    const candidates = collectCandidates(doc(labelledForm()));
    const found = discoverFields(WILLHABEN_FIELDS, candidates);
    expect((found.get('title')!.candidate.element as HTMLInputElement).id).toBe('ad-title');
    expect((found.get('description')!.candidate.element as HTMLElement).id).toBe('ad-desc');
    expect((found.get('price')!.candidate.element as HTMLElement).id).toBe('ad-price');
    expect((found.get('postalCode')!.candidate.element as HTMLElement).id).toBe('ad-plz');
    expect(found.get('title')!.matchedBy).toBe('label');
  });

  it('finds fields via aria-label alone', () => {
    const found = discoverFields(WILLHABEN_FIELDS, collectCandidates(doc(ariaForm())));
    expect(found.has('title')).toBe(true);
    expect(found.has('description')).toBe(true);
    expect(found.has('price')).toBe(true);
    expect(found.get('title')!.matchedBy).toBe('ariaLabel');
  });

  it('finds fields via data-testid and sibling caption text', () => {
    const found = discoverFields(WILLHABEN_FIELDS, collectCandidates(doc(frameworkForm())));
    const title = found.get('title')!.candidate.element as HTMLElement;
    expect(title.getAttribute('data-testid')).toBe('ad-insertion-title-field');
    expect(found.has('description')).toBe(true);
    expect(found.has('price')).toBe(true);
  });

  it('never assigns one control to two different fields', () => {
    const found = discoverFields(WILLHABEN_FIELDS, collectCandidates(doc(labelledForm())));
    const elements = [...found.values()].map((m) => m.candidate.element);
    expect(new Set(elements).size).toBe(elements.length);
  });

  it('rejects a search field that merely contains the word "Preis"', () => {
    const candidates = collectCandidates(
      new JSDOM(unrelatedPage()).window.document,
    );
    const priceProfile = profileFor('price')!;
    for (const candidate of candidates) {
      expect(scoreCandidate(candidate, priceProfile)).toBeNull();
    }
  });

  it('ignores hidden and disabled controls', () => {
    const html = `<form>
      <label for="a">Titel</label><input id="a" type="hidden" name="title">
      <label for="b">Preis</label><input id="b" type="text" name="price" disabled>
    </form>`;
    const found = discoverFields(WILLHABEN_FIELDS, collectCandidates(new JSDOM(html).window.document));
    expect(found.has('title')).toBe(false);
    expect(found.has('price')).toBe(false);
  });
});

describe('product → field mapping', () => {
  it('produces the expected values without touching the DOM', () => {
    const values = mapProductToFields(product(), allFieldSettings);
    const byField = Object.fromEntries(values.map((v) => [v.field, v.value]));

    expect(byField.title).toBe('Fitgriff Zughilfen / Lifting Straps – Neu');
    expect(byField.price).toBe('19,99'); // comma decimal separator
    expect(byField.brand).toBe('Fitgriff');
    expect(byField.condition).toBe('Neu');
    expect(byField.postalCode).toBe('1010');
    expect(byField.location).toBe('Wien');
    expect(byField.category).toContain('Fitness');
  });

  it('omits fields for which the product has no data', () => {
    const values = mapProductToFields(
      product({ brand: undefined, color: undefined, size: undefined, plannedSalePrice: undefined }),
      { ...allFieldSettings, defaultPostalCode: '', defaultLocation: '' },
    );
    const fields = values.map((v) => v.field);
    expect(fields).not.toContain('brand');
    expect(fields).not.toContain('price');
    expect(fields).not.toContain('postalCode');
  });
});

describe('form filling', () => {
  it('fills a labelled form and reports every field', async () => {
    const d = doc(labelledForm());
    const results = await fillWillhabenForm(product(), allFieldSettings, { doc: d });

    expect((d.getElementById('ad-title') as HTMLInputElement).value).toBe(
      'Fitgriff Zughilfen / Lifting Straps – Neu',
    );
    expect((d.getElementById('ad-price') as HTMLInputElement).value).toBe('19,99');
    expect((d.getElementById('ad-desc') as HTMLTextAreaElement).value).toContain('Fitgriff');
    expect((d.getElementById('ad-brand') as HTMLInputElement).value).toBe('Fitgriff');
    expect((d.getElementById('ad-plz') as HTMLInputElement).value).toBe('1010');

    const titleResult = results.find((r) => r.field === 'title')!;
    expect(titleResult.status).toBe('filled');
  });

  it('selects the matching option in a <select>', async () => {
    const d = doc(labelledForm());
    await fillWillhabenForm(product(), allFieldSettings, { doc: d });
    expect((d.getElementById('ad-condition') as HTMLSelectElement).value).toBe('new');
  });

  it('ticks checkboxes for shipping and pickup', async () => {
    const d = doc(labelledForm());
    await fillWillhabenForm(product(), allFieldSettings, { doc: d });
    expect((d.getElementById('ad-shipping') as HTMLInputElement).checked).toBe(true);
    expect((d.getElementById('ad-pickup') as HTMLInputElement).checked).toBe(true);
  });

  it('never reports category or images as automatically filled', async () => {
    const results = await fillWillhabenForm(product(), allFieldSettings, { doc: doc(labelledForm()) });
    expect(results.find((r) => r.field === 'category')!.status).toBe('manual');
    expect(results.find((r) => r.field === 'images')!.status).toBe('manual');
    // The value is still carried so the user can copy it.
    expect(results.find((r) => r.field === 'images')!.value).toContain('https://');
  });

  it('reports unmatched fields as not-found with their value preserved', async () => {
    const results = await fillWillhabenForm(product(), settings, { doc: doc(partialForm()) });
    const price = results.find((r) => r.field === 'price')!;
    expect(price.status).toBe('not-found');
    expect(price.value).toBe('19,99');
    expect(price.reason).toMatch(/manuell/i);
    // …while the field that does exist is still filled.
    expect(results.find((r) => r.field === 'title')!.status).toBe('filled');
  });

  it('honours a user-taught selector over automatic matching', async () => {
    const html = `<form>
      <input id="mystery" type="text">
      <label for="other">Irgendwas</label><input id="other" type="text">
    </form>`;
    const d = new JSDOM(html).window.document;
    const results = await fillWillhabenForm(product(), settings, {
      doc: d,
      hints: { title: '#mystery' },
    });
    expect((d.getElementById('mystery') as HTMLInputElement).value).toBe(
      'Fitgriff Zughilfen / Lifting Straps – Neu',
    );
    expect(results.find((r) => r.field === 'title')!.matchedBy).toBe('hint');
  });

  it('fills the aria-only form', async () => {
    const d = doc(ariaForm());
    await fillWillhabenForm(product(), settings, { doc: d });
    const title = d.querySelector('[aria-label="Anzeigentitel"]') as HTMLInputElement;
    expect(title.value).toBe('Fitgriff Zughilfen / Lifting Straps – Neu');
  });

  it('fills the framework-rendered form', async () => {
    const d = doc(frameworkForm());
    await fillWillhabenForm(product(), settings, { doc: d });
    const title = d.querySelector('[data-testid="ad-insertion-title-field"]') as HTMLInputElement;
    const price = d.querySelector('[data-testid="ad-insertion-price-field"]') as HTMLInputElement;
    expect(title.value).toContain('Fitgriff');
    expect(price.value).toBe('19,99');
  });
});

describe('setControlValue', () => {
  it('dispatches the events a framework needs to observe the change', () => {
    const d = new JSDOM('<input id="x" type="text">').window.document;
    const el = d.getElementById('x') as HTMLInputElement;
    const seen: string[] = [];
    el.addEventListener('input', () => seen.push('input'));
    el.addEventListener('change', () => seen.push('change'));

    expect(setControlValue(el, 'hallo')).toBe(true);
    expect(el.value).toBe('hallo');
    expect(seen).toEqual(['input', 'change']);
  });

  it('reports failure when a select has no matching option', () => {
    const d = new JSDOM('<select id="s"><option value="a">A</option></select>').window.document;
    expect(setControlValue(d.getElementById('s')!, 'Zzz')).toBe(false);
  });
});

describe('real Willhaben Marktplatz form layout', () => {
  it('detects the form even though it has no <label for> elements', () => {
    const result = detectWillhabenPage(doc(marktplatzForm()), CREATE_FORM_URL);
    expect(result.isCreateFlow).toBe(true);
    expect(result.formReady).toBe(true);
  });

  it('finds title, price and description via their visible captions', () => {
    const found = discoverFields(WILLHABEN_FIELDS, collectCandidates(doc(marktplatzForm())));
    expect(found.has('title')).toBe(true);
    expect(found.has('price')).toBe(true);
    expect(found.has('description')).toBe(true);
    expect(found.get('price')!.matchedBy).toBe('caption');
  });

  it('does not mistake the "zu verschenken" toggle for the price field', () => {
    const d = doc(marktplatzForm());
    const found = discoverFields(WILLHABEN_FIELDS, collectCandidates(d));
    const priceEl = found.get('price')!.candidate.element as HTMLInputElement;
    expect(priceEl.type).toBe('text');
    expect(priceEl.id).not.toBe('giveaway');
  });

  it('fills the real form layout end to end', async () => {
    const d = doc(marktplatzForm());
    const results = await fillWillhabenForm(product(), settings, { doc: d });

    const title = d.querySelector('input[placeholder^="z.B. Levi"]') as HTMLInputElement;
    const price = d.querySelector('.sc-h') as HTMLInputElement;
    const description = d.querySelector('[contenteditable="true"]') as HTMLElement;

    expect(title.value).toBe('Fitgriff Zughilfen / Lifting Straps – Neu');
    expect(price.value).toBe('19,99');
    expect(description.textContent).toContain('Fitgriff');
    expect(results.find((r) => r.field === 'description')!.status).toBe('filled');
  });

  it('reports the category as manual, since Willhaben derives it from the title', async () => {
    const results = await fillWillhabenForm(product(), allFieldSettings, { doc: doc(marktplatzForm()) });
    const category = results.find((r) => r.field === 'category')!;
    expect(category.status).toBe('manual');
    expect(category.reason).toMatch(/Anzeigentitel/);
  });

  it('treats the hidden file input as a manual step', async () => {
    const results = await fillWillhabenForm(product(), settings, { doc: doc(marktplatzForm()) });
    expect(results.find((r) => r.field === 'images')!.status).toBe('manual');
  });

  it('does not consider the 404 page an ad form', () => {
    const d = new JSDOM(notFoundPage(), { url: 'https://www.willhaben.at/iad/anzeigeaufgeben' })
      .window.document;
    expect(detectWillhabenPage(d, 'https://www.willhaben.at/iad/anzeigeaufgeben').formReady).toBe(false);
  });

  it('does not consider the chooser step an ad form', () => {
    const html = `<h1>Neue Anzeige aufgeben</h1>
      <div><h2>Marktplatz</h2><button type="button">Kostenlose Anzeige aufgeben</button></div>`;
    const d = new JSDOM(html, { url: CREATE_CHOOSER_URL }).window.document;
    expect(detectWillhabenPage(d, CREATE_CHOOSER_URL).formReady).toBe(false);
  });
});
