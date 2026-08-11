import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  extractAmazonProduct,
  imagesFromInlineScript,
  isAmazonHost,
  isProductPage,
  readDetailRows,
  readJsonLd,
  upscaleImageUrl,
} from '@/content/amazon/amazonExtractor';
import { extractAsinFromUrl } from '@/core/services/DuplicateService';
import {
  AMAZON_PRODUCT_URL,
  AMAZON_SEARCH_URL,
  buildAmazonPage,
  buildAmazonSearchPage,
} from './fixtures/amazonPage';

function doc(html: string): Document {
  return new JSDOM(html).window.document;
}

describe('page detection', () => {
  it('recognises the supported marketplaces', () => {
    expect(isAmazonHost('www.amazon.de')).toBe(true);
    expect(isAmazonHost('www.amazon.at')).toBe(true);
    expect(isAmazonHost('www.amazon.com')).toBe(true);
    expect(isAmazonHost('www.amazon.co.uk')).toBe(false);
    expect(isAmazonHost('www.willhaben.at')).toBe(false);
  });

  it('accepts a product page', () => {
    expect(isProductPage(doc(buildAmazonPage()), AMAZON_PRODUCT_URL)).toBe(true);
  });

  it('rejects a search results page even though it links to /dp/ URLs', () => {
    expect(isProductPage(doc(buildAmazonSearchPage()), AMAZON_SEARCH_URL)).toBe(false);
  });
});

describe('ASIN extraction', () => {
  it('reads the ASIN from the various URL shapes', () => {
    expect(extractAsinFromUrl('https://www.amazon.de/dp/B07DFMQZ6H')).toBe('B07DFMQZ6H');
    expect(extractAsinFromUrl('https://www.amazon.de/dp/B07DFMQZ6H?ref=x')).toBe('B07DFMQZ6H');
    expect(extractAsinFromUrl('https://www.amazon.de/gp/product/B07DFMQZ6H/')).toBe('B07DFMQZ6H');
    expect(extractAsinFromUrl('https://www.amazon.com/Some-Title/dp/B01ABCDEFG/ref=sr')).toBe(
      'B01ABCDEFG',
    );
    expect(extractAsinFromUrl('https://www.amazon.de/s?k=zughilfen')).toBeUndefined();
  });

  it('prefers the hidden ASIN input over the URL', () => {
    const result = extractAmazonProduct(
      doc(buildAmazonPage({ asin: 'B0INPUT123' })),
      'https://www.amazon.de/dp/B0URLXXXXX',
    );
    expect(result.product?.asin).toBe('B0INPUT123');
    expect(result.report.fields.asin?.source).toBe('#ASIN');
  });

  it('falls back to the URL when the input is gone', () => {
    const result = extractAmazonProduct(
      doc(buildAmazonPage({ asin: null })),
      'https://www.amazon.de/dp/B0URLXXXXX',
    );
    expect(result.product?.asin).toBe('B0URLXXXXX');
    expect(result.report.fields.asin?.source).toBe('url');
  });
});

describe('price extraction', () => {
  it('reads the price from JSON-LD first', () => {
    const result = extractAmazonProduct(doc(buildAmazonPage()), AMAZON_PRODUCT_URL);
    expect(result.product?.price).toBe(9.99);
    expect(result.product?.currency).toBe('EUR');
    expect(result.report.fields.price?.source).toBe('json-ld:offers.price');
  });

  it('falls back to the DOM when structured data is unavailable', () => {
    const result = extractAmazonProduct(
      doc(buildAmazonPage({ jsonLd: false })),
      AMAZON_PRODUCT_URL,
    );
    expect(result.product?.price).toBe(9.99);
    expect(result.report.fields.price?.source).toContain('priceToPay');
  });

  it('reads the strike-through list price', () => {
    const result = extractAmazonProduct(doc(buildAmazonPage({ jsonLd: false })), AMAZON_PRODUCT_URL);
    expect(result.product?.listPrice).toBe(14.99);
  });

  it('reports a missing price without failing the extraction', () => {
    const result = extractAmazonProduct(
      doc(buildAmazonPage({ price: null, jsonLd: false })),
      AMAZON_PRODUCT_URL,
    );
    expect(result.ok).toBe(true);
    expect(result.product?.price).toBeUndefined();
    expect(result.report.fields.price?.confidence).toBe('missing');
    expect(result.report.warnings.join(' ')).toMatch(/Kein Preis/);
  });
});

describe('image extraction', () => {
  it('upscales Amazon size tokens to the full resolution URL', () => {
    expect(upscaleImageUrl('https://m.media-amazon.com/images/I/71abc._AC_US40_.jpg')).toBe(
      'https://m.media-amazon.com/images/I/71abc.jpg',
    );
    expect(upscaleImageUrl('https://m.media-amazon.com/images/I/71abc.jpg')).toBe(
      'https://m.media-amazon.com/images/I/71abc.jpg',
    );
  });

  it('reads the gallery from the inline image block', () => {
    const urls = imagesFromInlineScript(doc(buildAmazonPage({ images: 6 })));
    expect(urls.length).toBeGreaterThanOrEqual(6);
  });

  it('collects all distinct product images', () => {
    const result = extractAmazonProduct(doc(buildAmazonPage({ images: 6 })), AMAZON_PRODUCT_URL);
    expect(result.product?.images).toHaveLength(6);
    // Different renditions of the same photo must collapse into one entry.
    expect(new Set(result.product?.images).size).toBe(6);
  });

  it('still finds the main image when the inline script is missing', () => {
    const result = extractAmazonProduct(
      doc(buildAmazonPage({ inlineImages: false, images: 3 })),
      AMAZON_PRODUCT_URL,
    );
    expect(result.product?.images.length).toBeGreaterThan(0);
  });
});

describe('metadata extraction', () => {
  it('extracts the full product record from a complete page', () => {
    const result = extractAmazonProduct(doc(buildAmazonPage()), AMAZON_PRODUCT_URL);
    const p = result.product!;

    expect(result.ok).toBe(true);
    expect(p.title).toContain('Fitgriff');
    expect(p.brand).toBe('Fitgriff');
    expect(p.ean).toBe('4260576510129');
    expect(p.gtin).toBe('4260576510129');
    expect(p.asin).toBe('B07DFMQZ6H');
    expect(p.bulletPoints).toHaveLength(4);
    expect(p.category).toBe('Sport & Freizeit');
    expect(p.categoryPath).toEqual([
      'Sport & Freizeit',
      'Fitness & Krafttraining',
      'Krafttraining',
      'Zughilfen',
    ]);
    expect(p.color).toBe('Schwarz');
    expect(p.size).toBe('Einheitsgröße');
    expect(p.weight).toBe('110 g');
    expect(p.availability).toBe('Auf Lager');
    expect(p.seller).toContain('Fitgriff');
    // The canonical link wins over the tracking-laden address bar URL.
    expect(p.url).toBe('https://www.amazon.de/dp/B07DFMQZ6H');
  });

  it('cleans the brand out of the byline text', () => {
    const html = buildAmazonPage({ jsonLd: false, ean: null }).replace(
      /<table id="productDetails_techSpec_section_1">[\s\S]*?<\/table>/,
      '',
    ).replace(/<li><span class="a-list-item"><span class="a-text-bold">Hersteller[\s\S]*?<\/li>/, '');
    const result = extractAmazonProduct(doc(html), AMAZON_PRODUCT_URL);
    expect(result.product?.brand).toBe('Fitgriff');
  });

  it('reads label/value pairs from both table and bullet layouts', () => {
    const rows = readDetailRows(doc(buildAmazonPage()));
    const labels = rows.map((r) => r.label.toLowerCase());
    expect(labels.some((l) => l.includes('artikelgewicht'))).toBe(true);
    expect(labels.some((l) => l.includes('marke'))).toBe(true);
  });

  it('parses JSON-LD including nested graphs', () => {
    const nodes = readJsonLd(doc(buildAmazonPage()));
    expect(nodes.some((n) => n['@type'] === 'Product')).toBe(true);
  });

  it('tolerates malformed JSON-LD', () => {
    const html = buildAmazonPage({ jsonLd: false }).replace(
      '</head>',
      '<script type="application/ld+json">{ this is not json }</script></head>',
    );
    expect(() => readJsonLd(doc(html))).not.toThrow();
    expect(extractAmazonProduct(doc(html), AMAZON_PRODUCT_URL).ok).toBe(true);
  });
});

describe('degraded pages', () => {
  it('reports missing EAN as a warning but keeps everything else', () => {
    const result = extractAmazonProduct(
      doc(buildAmazonPage({ ean: null, jsonLd: false })),
      AMAZON_PRODUCT_URL,
    );
    expect(result.ok).toBe(true);
    expect(result.product?.ean).toBeUndefined();
    expect(result.report.fields.ean?.confidence).toBe('missing');
    expect(result.product?.title).toBeTruthy();
  });

  it('falls back to the og:title meta tag when #productTitle is gone', () => {
    const result = extractAmazonProduct(
      doc(buildAmazonPage({ title: null, jsonLd: false, ogTitle: 'Fitgriff Zughilfen' })),
      AMAZON_PRODUCT_URL,
    );
    expect(result.ok).toBe(true);
    expect(result.product?.title).toContain('Fitgriff');
    expect(result.report.fields.title?.source).toContain('meta');
  });

  it('fails cleanly on a page that is not a product page', () => {
    const result = extractAmazonProduct(doc(buildAmazonSearchPage()), AMAZON_SEARCH_URL);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Keine unterstützte Amazon-Produktseite/);
  });

  it('survives a page with no bullets, no images and no breadcrumb', () => {
    const result = extractAmazonProduct(
      doc(buildAmazonPage({ bullets: [], images: 0, breadcrumb: [], inlineImages: false })),
      AMAZON_PRODUCT_URL,
    );
    expect(result.ok).toBe(true);
    expect(result.product?.bulletPoints).toEqual([]);
    expect(result.report.fields.category?.confidence).toBe('missing');
  });
});
