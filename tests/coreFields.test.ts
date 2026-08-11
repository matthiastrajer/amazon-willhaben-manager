import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  compactBullet,
  extractCorePhrase,
  generateListingDescription,
  generateListingTitle,
} from '@/core/services/ListingContentService';
import {
  fillWillhabenForm,
  formatPriceForForm,
  mapProductToFields,
  setControlValue,
} from '@/content/willhaben/WillhabenFieldMapper';
import { DEFAULT_SETTINGS } from '@/core/models/Settings';
import type { Product } from '@/core/models/Product';
import { CREATE_FORM_URL, marktplatzForm } from './fixtures/willhabenForm';

const YOLEO_TITLE =
  'YOLEO YOLEO klappbare Hantelbank Multifunktion Training Fitness Bank Bauchtrainer Schrägbank mit 6-Fach Verstellbarer Rückenlehne/3-Fach verstellbarer Sitzkissen,Belastung 300kg';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    title: YOLEO_TITLE,
    description: '',
    bulletPoints: [
      'MULTIFUNKTIONAL – Die Hantelbank lässt sich als Flachbank, Schrägbank und Negativbank verwenden und deckt damit ein breites Übungsspektrum ab.',
      'VERSTELLBAR – Die Rückenlehne ist 6-fach und das Sitzkissen 3-fach verstellbar.',
      'BELASTBAR – Maximale Belastung 300 kg.',
      'PLATZSPAREND – Zusammenklappbar für die Aufbewahrung.',
      'LIEFERUMFANG – 1 Hantelbank inklusive Montagematerial.',
    ],
    images: ['https://m.media-amazon.com/images/I/1.jpg'],
    selectedImages: [],
    brand: 'YOLEO',
    condition: 'NEU',
    currency: 'EUR',
    purchasePrice: 55,
    purchaseShipping: 0,
    purchaseOtherCosts: 0,
    plannedSalePrice: 79,
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

describe('core phrase extraction', () => {
  it('reduces the bloated Hantelbank title to its core', () => {
    expect(extractCorePhrase(YOLEO_TITLE, 'YOLEO')).toBe('klappbare Hantelbank');
  });

  it('stops at the head noun for a German title', () => {
    expect(extractCorePhrase('Fitgriff Zughilfen (gepolstert) für Krafttraining', 'Fitgriff')).toBe(
      'Zughilfen',
    );
  });

  it('keeps enough words for a title-cased English title', () => {
    expect(extractCorePhrase('Adjustable Weight Bench Foldable Home Gym')).toBe(
      'Adjustable Weight Bench',
    );
  });

  it('never invents a word that was not in the source', () => {
    const core = extractCorePhrase(YOLEO_TITLE, 'YOLEO');
    for (const word of core.split(' ')) {
      expect(YOLEO_TITLE).toContain(word);
    }
  });

  it('handles an empty title', () => {
    expect(extractCorePhrase('')).toBe('');
  });
});

describe('short listing title', () => {
  it('produces a scannable title instead of copying Amazon', () => {
    const title = generateListingTitle(product());
    expect(title).toBe('YOLEO klappbare Hantelbank – Neu');
    expect(title.length).toBeLessThan(40);
  });

  it('does not repeat the brand', () => {
    // The source title even repeats it twice ("YOLEO YOLEO").
    expect(generateListingTitle(product()).match(/YOLEO/g)).toHaveLength(1);
  });
});

describe('compact description', () => {
  it('drops the shouted keyword prefix and shortens the sentence', () => {
    const line = compactBullet(
      'MULTIFUNKTIONAL – Die Hantelbank lässt sich als Flachbank, Schrägbank und Negativbank verwenden und deckt damit ein breites Übungsspektrum ab.',
    );
    expect(line.startsWith('MULTIFUNKTIONAL')).toBe(false);
    expect(line).toContain('Hantelbank');
    expect(line.length).toBeLessThanOrEqual(96);
  });

  it('keeps a bullet that has no shouted prefix', () => {
    expect(compactBullet('Maximale Belastung 300 kg.')).toBe('Maximale Belastung 300 kg.');
  });

  it('builds a short bulleted description', () => {
    const text = generateListingDescription(product(), { settings: DEFAULT_SETTINGS });
    const lines = text.split('\n').filter(Boolean);

    expect(text.startsWith('YOLEO klappbare Hantelbank')).toBe(true);
    expect(text).toContain('Zustand: Neu');
    expect(lines.filter((l) => l.startsWith('•'))).toHaveLength(4);
    // Short enough to actually be read on a classifieds page.
    expect(text.length).toBeLessThan(600);
    expect(text).not.toContain('Eigenschaften:');
  });

  it('still supports the long form when compact is off', () => {
    const text = generateListingDescription(product(), {
      settings: { ...DEFAULT_SETTINGS, compactDescription: false },
    });
    expect(text).toContain('Eigenschaften:');
  });

  it('never leaks internal notes', () => {
    const text = generateListingDescription(product({ notes: 'Nur Abholung, Käufer meldet sich' }), {
      settings: DEFAULT_SETTINGS,
    });
    expect(text).not.toContain('Käufer meldet sich');
  });
});

describe('price formatting for the form', () => {
  it('writes whole amounts without decimals', () => {
    expect(formatPriceForForm(79)).toBe('79');
    expect(formatPriceForForm(79.0)).toBe('79');
  });

  it('keeps cents with a comma separator', () => {
    expect(formatPriceForForm(19.99)).toBe('19,99');
    expect(formatPriceForForm(14.5)).toBe('14,50');
  });
});

describe('only core fields', () => {
  const settings = { ...DEFAULT_SETTINGS, defaultPostalCode: '1010', defaultLocation: 'Wien' };

  it('maps price, title, description and images only', () => {
    const fields = mapProductToFields(
      product({ color: 'Schwarz', size: 'L', listingTitle: 'Kurz', listingDescription: 'Text' }),
      settings,
    );
    expect(fields.map((f) => f.field)).toEqual(['price', 'title', 'description', 'images']);
  });

  it('maps everything again when the option is switched off', () => {
    const fields = mapProductToFields(
      product({ color: 'Schwarz', listingTitle: 'Kurz', listingDescription: 'Text' }),
      { ...settings, onlyCoreFields: false },
    );
    expect(fields.map((f) => f.field)).toContain('category');
    expect(fields.map((f) => f.field)).toContain('postalCode');
  });

  it('fills the real form with exactly the three fields and no noise', async () => {
    const d = new JSDOM(marktplatzForm(), { url: CREATE_FORM_URL }).window.document;
    const results = await fillWillhabenForm(
      product({ listingTitle: 'YOLEO klappbare Hantelbank – Neu', listingDescription: 'Kurztext' }),
      settings,
      { doc: d },
    );

    expect((d.querySelector('.sc-h') as HTMLInputElement).value).toBe('79');
    expect((d.querySelector('input[placeholder^="z.B. Levi"]') as HTMLInputElement).value).toBe(
      'YOLEO klappbare Hantelbank – Neu',
    );
    expect((d.querySelector('[contenteditable="true"]') as HTMLElement).textContent).toContain(
      'Kurztext',
    );

    // No "not found" rows for fields the form does not even have.
    expect(results.filter((r) => r.status === 'not-found')).toEqual([]);
    expect(results.filter((r) => r.status === 'filled').map((r) => r.field).sort()).toEqual([
      'description',
      'price',
      'title',
    ]);
  });
});

describe('rich-text editor variants', () => {
  const settings = { ...DEFAULT_SETTINGS };

  /** Builds a form whose description field uses the given editor markup. */
  function formWithEditor(editorHtml: string): Document {
    return new JSDOM(
      `<form>
         <span>Verkaufspreis</span><div><span>€</span><input type="text"></div>
         <span>Titel</span><input type="text">
         <span>Beschreibung</span>${editorHtml}
       </form>`,
      { url: CREATE_FORM_URL },
    ).window.document;
  }

  const cases: { name: string; html: string; find: string }[] = [
    {
      name: 'plain contenteditable="true"',
      html: '<div contenteditable="true"></div>',
      find: '[contenteditable="true"]',
    },
    {
      name: 'bare contenteditable attribute',
      html: '<div contenteditable></div>',
      find: '[contenteditable]',
    },
    {
      name: 'ProseMirror editor',
      html: '<div class="ProseMirror" contenteditable="true"><p><br></p></div>',
      find: '.ProseMirror',
    },
    {
      name: 'Quill editor',
      html: '<div class="ql-editor" contenteditable="true"></div>',
      find: '.ql-editor',
    },
    {
      name: 'Lexical editor',
      html: '<div data-lexical-editor="true" contenteditable="true"></div>',
      find: '[data-lexical-editor]',
    },
    {
      name: 'role=textbox wrapper around the editable node',
      html: '<div role="textbox"><div contenteditable="true"></div></div>',
      find: '[role="textbox"] [contenteditable="true"]',
    },
  ];

  for (const c of cases) {
    it(`fills the description in a ${c.name}`, async () => {
      const d = formWithEditor(c.html);
      const results = await fillWillhabenForm(
        product({ listingDescription: 'Kurze Beschreibung des Artikels.' }),
        settings,
        { doc: d, settleMs: 0 },
      );

      expect(results.find((r) => r.field === 'description')!.status).toBe('filled');
      expect((d.querySelector(c.find) as HTMLElement).textContent).toContain(
        'Kurze Beschreibung',
      );
    });
  }

  it('writes into the inner editable node, not the wrapper', async () => {
    const d = formWithEditor('<div role="textbox"><div contenteditable="true"></div></div>');
    await fillWillhabenForm(product({ listingDescription: 'Text' }), settings, {
      doc: d,
      settleMs: 0,
    });
    const wrapper = d.querySelector('[role="textbox"]') as HTMLElement;
    // The wrapper must still contain its editable child rather than raw text.
    expect(wrapper.querySelector('[contenteditable="true"]')).not.toBeNull();
  });
});

describe('no premature validation', () => {
  it('does not blur a field right after writing to it', async () => {
    const d = new JSDOM(
      '<form><span>Titel</span><input id="t" type="text"></form>',
    ).window.document;
    const el = d.getElementById('t') as HTMLInputElement;
    const seen: string[] = [];
    for (const type of ['input', 'change', 'blur']) {
      el.addEventListener(type, () => seen.push(type));
    }

    setControlValue(el, 'Hallo');
    // A synchronous blur here made the form validate against the old value.
    expect(seen).toEqual(['input', 'change']);
  });

  it('releases focus once the whole form is filled', async () => {
    const d = new JSDOM(
      `<form>
         <span>Verkaufspreis</span><input type="text">
         <span>Titel</span><input type="text">
       </form>`,
      { url: CREATE_FORM_URL },
    ).window.document;

    await fillWillhabenForm(product(), { ...DEFAULT_SETTINGS }, { doc: d, settleMs: 0 });
    expect(d.activeElement === d.body || d.activeElement === null).toBe(true);
  });
});

describe('German-only ad copy', () => {
  const englishBullets = [
    'MULTIFUNCTIONAL - This weight bench can be used as a flat bench, incline bench and decline bench.',
    'ADJUSTABLE - The backrest is adjustable to six positions and the seat to three positions.',
  ];

  it('drops English manufacturer bullets instead of copying them', () => {
    const text = generateListingDescription(
      product({ bulletPoints: englishBullets }),
      { settings: DEFAULT_SETTINGS },
    );
    expect(text).not.toContain('weight bench');
    expect(text).not.toContain('adjustable');
    // The German parts we generate ourselves are still there.
    expect(text).toContain('Zustand: Neu');
    expect(text).toContain('Hantelbank');
  });

  it('keeps German bullets and drops only the English ones', () => {
    const text = generateListingDescription(
      product({
        bulletPoints: [
          ...englishBullets,
          'Die Rückenlehne ist sechsfach verstellbar und lässt sich leicht anpassen.',
        ],
      }),
      { settings: DEFAULT_SETTINGS },
    );
    expect(text).toContain('Rückenlehne');
    expect(text).not.toContain('weight bench');
  });

  it('skips an English fallback description', () => {
    const text = generateListingDescription(
      product({
        bulletPoints: [],
        description:
          'This adjustable weight bench is perfect for your home gym and can be folded away when you are not using it.',
      }),
      { settings: DEFAULT_SETTINGS },
    );
    expect(text).not.toContain('home gym');
    expect(text).toContain('Zustand: Neu');
  });
});
