import { describe, expect, it } from 'vitest';
import {
  canonicalAmazonKey,
  findDuplicates,
  isValidAsin,
  normalizeEan,
  titleSimilarity,
} from '@/core/services/DuplicateService';
import {
  applyTemplate,
  generateListingDescription,
  generateListingTitle,
} from '@/core/services/ListingContentService';
import { mapCategory, FALLBACK_CATEGORY_PATH } from '@/core/services/categoryMappings';
import { DEFAULT_SETTINGS } from '@/core/models/Settings';
import type { Product } from '@/core/models/Product';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: `p_${Math.random().toString(36).slice(2)}`,
    title: 'Fitgriff Zughilfen',
    description: '',
    bulletPoints: [],
    images: [],
    selectedImages: [],
    condition: 'NEU',
    currency: 'EUR',
    purchasePrice: 9.99,
    purchaseShipping: 0,
    purchaseOtherCosts: 0,
    status: 'LISTED',
    quantity: 1,
    listedQuantity: 1,
    soldQuantity: 0,
    platform: 'willhaben',
    importedAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    source: 'amazon',
    history: [],
    ...overrides,
  };
}

describe('identifier helpers', () => {
  it('validates ASIN shape', () => {
    expect(isValidAsin('B07DFMQZ6H')).toBe(true);
    expect(isValidAsin('0123456789')).toBe(true);
    expect(isValidAsin('B07DFMQZ')).toBe(false);
    expect(isValidAsin(undefined)).toBe(false);
  });

  it('normalises EANs and rejects wrong lengths', () => {
    expect(normalizeEan('4260576510129')).toBe('4260576510129');
    expect(normalizeEan('4 260576 510129')).toBe('4260576510129');
    expect(normalizeEan('12345')).toBeUndefined();
    expect(normalizeEan(undefined)).toBeUndefined();
  });

  it('builds a canonical key that ignores tracking parameters', () => {
    const a = canonicalAmazonKey('https://www.amazon.de/dp/B07DFMQZ6H?ref=sr_1_3&th=1');
    const b = canonicalAmazonKey('https://www.amazon.de/Fitgriff-Zughilfen/dp/B07DFMQZ6H/');
    expect(a).toBe(b);
    expect(canonicalAmazonKey(undefined)).toBeUndefined();
  });
});

describe('duplicate detection', () => {
  const existing = [
    product({ id: 'a', asin: 'B07DFMQZ6H', ean: '4260576510129', amazonUrl: 'https://www.amazon.de/dp/B07DFMQZ6H', brand: 'Fitgriff' }),
    product({ id: 'b', title: 'Sony WH-1000XM4 Kopfhörer', brand: 'Sony', asin: 'B0863TXGM3' }),
  ];

  it('matches on ASIN with exact confidence', () => {
    const matches = findDuplicates({ asin: 'b07dfmqz6h' }, existing);
    expect(matches[0]?.product.id).toBe('a');
    expect(matches[0]?.reason).toBe('asin');
    expect(matches[0]?.confidence).toBe('exact');
  });

  it('matches on EAN when the ASIN differs', () => {
    const matches = findDuplicates({ asin: 'B0DIFFERENT', ean: '4260576510129' }, existing);
    expect(matches[0]?.reason).toBe('ean');
  });

  it('matches on the Amazon URL', () => {
    const matches = findDuplicates(
      { url: 'https://www.amazon.de/Fitgriff/dp/B07DFMQZ6H?ref=x' },
      existing,
    );
    expect(matches[0]?.product.id).toBe('a');
  });

  it('reports a similar title as merely possible', () => {
    const matches = findDuplicates(
      { title: 'Fitgriff Zughilfen gepolstert', brand: 'Fitgriff' },
      existing,
    );
    expect(matches[0]?.reason).toBe('title');
    expect(matches[0]?.confidence).toBe('possible');
  });

  it('does not fuzzy-match across different brands', () => {
    const matches = findDuplicates({ title: 'Fitgriff Zughilfen', brand: 'Sony' }, existing);
    expect(matches.every((m) => m.reason !== 'title')).toBe(true);
  });

  it('finds nothing for an unrelated product', () => {
    expect(findDuplicates({ asin: 'B0NEWNEW01', title: 'Gartenschlauch 20m' }, existing)).toEqual([]);
  });

  it('excludes the product being edited', () => {
    expect(findDuplicates({ asin: 'B07DFMQZ6H' }, existing, { excludeId: 'a' })).toEqual([]);
  });

  it('orders exact matches before fuzzy ones', () => {
    const pool = [...existing, product({ id: 'c', title: 'Fitgriff Zughilfen', brand: 'Fitgriff' })];
    const matches = findDuplicates(
      { asin: 'B07DFMQZ6H', title: 'Fitgriff Zughilfen', brand: 'Fitgriff' },
      pool,
    );
    expect(matches[0]?.confidence).toBe('exact');
  });
});

describe('listing title generation', () => {
  it('shortens a long Amazon title without inventing properties', () => {
    const title = generateListingTitle({
      title:
        'Fitgriff® Zughilfen (gepolstert) für Krafttraining, Bodybuilding, Fitness – Kreuzheben Gurte – Lifting Straps für Frauen und Männer',
      brand: 'Fitgriff',
      condition: 'NEU',
    });

    expect(title.length).toBeLessThanOrEqual(70);
    expect(title).toContain('Fitgriff');
    expect(title).toContain('Zughilfen');
    expect(title).toContain('Neu');
    expect(title).not.toContain('®');
    // Nothing that was not in the source may appear.
    expect(title.toLowerCase()).not.toContain('original');
    expect(title.toLowerCase()).not.toContain('ovp');
  });

  it('does not duplicate the brand when it already leads the title', () => {
    const title = generateListingTitle({
      title: 'Fitgriff Zughilfen',
      brand: 'Fitgriff',
      condition: 'NEU',
    });
    expect(title.match(/Fitgriff/g)).toHaveLength(1);
  });

  it('prepends a missing brand', () => {
    const title = generateListingTitle({
      title: 'Zughilfen gepolstert',
      brand: 'Fitgriff',
      condition: 'GEBRAUCHT',
    });
    expect(title.startsWith('Fitgriff')).toBe(true);
    expect(title).toContain('Gebraucht');
  });

  it('works without a brand', () => {
    const title = generateListingTitle({ title: 'Gartenschlauch 20 Meter', condition: 'NEU' });
    expect(title).toContain('Gartenschlauch');
  });

  it('returns an empty string for an empty title', () => {
    expect(generateListingTitle({ title: '', condition: 'NEU' })).toBe('');
  });

  it('appends a template suffix', () => {
    const title = generateListingTitle(
      { title: 'Zughilfen', brand: 'Fitgriff', condition: 'NEU' },
      {
        template: {
          id: 't', name: 'x', condition: 'NEU', titleSuffix: 'OVP', isDefault: false,
          createdAt: '', updatedAt: '',
        },
      },
    );
    expect(title).toContain('OVP');
  });
});

describe('listing description generation', () => {
  const base = {
    title: 'Fitgriff Zughilfen',
    brand: 'Fitgriff',
    condition: 'NEU' as const,
    bulletPoints: [
      'MAXIMALER HALT – entlastet den Griff bei schweren Sätzen.',
      'GEPOLSTERT – Neoprenpolster schützt die Handgelenke.',
    ],
    description: '',
    color: 'Schwarz',
    size: 'Einheitsgröße',
    weight: '110 g',
    ean: '4260576510129',
  };

  it('builds a structured description from real data only', () => {
    const text = generateListingDescription(base);
    expect(text).toContain('Fitgriff');
    expect(text).toContain('Eigenschaften:');
    expect(text).toContain('• MAXIMALER HALT');
    expect(text).toContain('Farbe: Schwarz');
    expect(text).toContain('Zustand:');
    expect(text).toContain('Neu');
  });

  it('never leaks internal notes into the ad text', () => {
    const text = generateListingDescription({
      ...base,
      notes: 'Interessent hat nach Versand gefragt.',
    });
    expect(text).not.toContain('Interessent');
  });

  it('omits blocks for which there is no data', () => {
    const text = generateListingDescription({
      title: 'Unbekanntes Produkt',
      condition: 'GEBRAUCHT',
      bulletPoints: [],
      description: '',
    });
    expect(text).not.toContain('Eigenschaften:');
    expect(text).not.toContain('Farbe');
    expect(text).toContain('Gebraucht');
  });

  it('appends the configured boilerplate', () => {
    const text = generateListingDescription(base, {
      settings: { ...DEFAULT_SETTINGS, defaultDescription: 'Privatverkauf, keine Garantie.' },
    });
    expect(text).toContain('Privatverkauf');
  });

  it('uses a template and substitutes placeholders', () => {
    const text = generateListingDescription(base, {
      template: {
        id: 't',
        name: 'Fitness',
        condition: 'NEU',
        isDefault: false,
        createdAt: '',
        updatedAt: '',
        descriptionTemplate: '{{brand}} – {{title}}\n\n{{features}}\n\nZustand: {{condition}}\n{{missing}}',
      },
    });
    expect(text).toContain('Fitgriff – Fitgriff Zughilfen');
    expect(text).toContain('• GEPOLSTERT');
    expect(text).toContain('Zustand: Neu');
    expect(text).not.toContain('{{');
  });

  it('drops unresolved placeholders cleanly', () => {
    expect(applyTemplate('A {{unknown}} B', {})).toBe('A  B');
  });
});

describe('category mapping', () => {
  it('maps a fitness breadcrumb to the Willhaben fitness path', () => {
    const match = mapCategory({
      categoryPath: ['Sport & Freizeit', 'Fitness & Krafttraining'],
      title: 'Fitgriff Zughilfen',
    });
    expect(match.path).toEqual(['Sport & Freizeit', 'Fitness']);
    expect(match.confidence).toBe('high');
  });

  it('falls back to the title with lower confidence', () => {
    const match = mapCategory({ title: 'Bluetooth Kopfhörer Over-Ear' });
    expect(match.path[0]).toBe('Elektronik');
    expect(match.confidence).toBe('medium');
  });

  it('uses bullet points as the weakest signal', () => {
    const match = mapCategory({ bulletPoints: ['Ideal für Camping und Wandern'] });
    expect(match.path).toEqual(['Sport & Freizeit', 'Camping & Outdoor']);
    expect(match.confidence).toBe('low');
  });

  it('falls back to a generic category when nothing matches', () => {
    const match = mapCategory({ title: 'Zzzz Qqqq Xxxx' });
    expect(match.path).toEqual(FALLBACK_CATEGORY_PATH);
    expect(match.mappingId).toBeNull();
  });

  it('handles completely empty input', () => {
    expect(mapCategory({}).path).toEqual(FALLBACK_CATEGORY_PATH);
  });
});

describe('title similarity tuning', () => {
  it('treats a more verbose variant of the same title as the same product', () => {
    expect(titleSimilarity('Fitgriff Zughilfen', 'Fitgriff Zughilfen gepolstert')).toBeGreaterThan(0.72);
  });

  it('keeps near-miss model numbers apart', () => {
    expect(titleSimilarity('Sony WH-1000XM4', 'Sony WH-1000XM5')).toBeLessThan(0.72);
  });

  it('does not let a single shared token imply a duplicate', () => {
    expect(titleSimilarity('Zughilfen', 'Zughilfen Leder Profi XL Set')).toBeLessThan(0.72);
  });

  it('still matches two identical short titles', () => {
    expect(titleSimilarity('Zughilfen', 'Zughilfen')).toBe(1);
  });

  it('returns 0 for empty input', () => {
    expect(titleSimilarity('', 'Fitgriff Zughilfen')).toBe(0);
  });
});
