import type {
  ExtractedProduct,
  ExtractionReport,
  ExtractionResult,
  FieldConfidence,
} from '@/shared/types';
import { AMAZON_DOMAINS } from '@/shared/constants';
import { normalizeWhitespace, normalizeKey } from '@/core/utils/text';
import { parseNumber } from '@/core/utils/format';
import { extractAsinFromUrl, isValidAsin, normalizeEan } from '@/core/services/DuplicateService';
import {
  AMAZON_SELECTORS,
  DETAIL_LABELS,
  PRODUCT_PAGE_MARKERS,
  PRODUCT_URL_PATTERNS,
  type SelectorGroup,
} from './amazonSelectors';

/**
 * Amazon extraction layer.
 *
 * The whole module is pure with respect to the DOM: every function takes a
 * `Document`, which makes the extraction unit-testable against mock HTML and
 * keeps it usable from a content script and from tests alike.
 *
 * Design rule: a missing field is never fatal. Each field is attempted
 * independently and records its own confidence, so a partial result is still a
 * useful result.
 */

class Recorder {
  readonly fields: ExtractionReport['fields'] = {};
  readonly warnings: string[] = [];

  hit(field: string, source: string, confidence: FieldConfidence = 'high'): void {
    this.fields[field] = { confidence, source };
  }

  miss(field: string, warning?: string): void {
    this.fields[field] = { confidence: 'missing', source: '-' };
    if (warning) this.warnings.push(warning);
  }
}

// --------------------------------------------------------------- page detection

export function isAmazonHost(hostname: string): boolean {
  return AMAZON_DOMAINS.some((d) => d.host === hostname);
}

export function marketplaceFor(hostname: string) {
  return AMAZON_DOMAINS.find((d) => d.host === hostname);
}

/**
 * A page counts as a product page when the URL looks like one AND the document
 * contains at least one of the product-page containers. Requiring both avoids
 * false positives on search pages that happen to link to /dp/ URLs.
 */
export function isProductPage(doc: Document, url: string): boolean {
  const urlLooksRight = PRODUCT_URL_PATTERNS.some((re) => re.test(url));
  const hasMarker = PRODUCT_PAGE_MARKERS.some((sel) => doc.querySelector(sel));
  const hasTitle = !!doc.querySelector('#productTitle');
  // A #productTitle alone is conclusive (mobile layouts have unusual URLs).
  return hasTitle || (urlLooksRight && hasMarker);
}

// ------------------------------------------------------------------- primitives

function textOf(el: Element | null | undefined): string {
  if (!el) return '';
  return normalizeWhitespace(el.textContent ?? '');
}

/** First non-empty text among a selector group. */
function queryText(
  doc: Document | Element,
  group: SelectorGroup,
): { value: string; selector: string } | null {
  for (const selector of group.selectors) {
    const el = doc.querySelector(selector);
    const value = textOf(el);
    if (value) return { value, selector };
  }
  return null;
}

// ------------------------------------------------------------ structured data

type JsonLdNode = Record<string, unknown>;

/** All JSON-LD nodes in the document, flattened across arrays and @graph. */
export function readJsonLd(doc: Document): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of Array.from(scripts)) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const queue: unknown[] = [parsed];
      while (queue.length) {
        const item = queue.shift();
        if (Array.isArray(item)) {
          queue.push(...item);
        } else if (item && typeof item === 'object') {
          const node = item as JsonLdNode;
          nodes.push(node);
          if (Array.isArray(node['@graph'])) queue.push(...(node['@graph'] as unknown[]));
        }
      }
    } catch {
      // Malformed JSON-LD is common on large pages; just skip it.
    }
  }
  return nodes;
}

function typeOf(node: JsonLdNode): string[] {
  const t = node['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

export function findProductNode(nodes: JsonLdNode[]): JsonLdNode | undefined {
  return nodes.find((n) => typeOf(n).some((t) => t.toLowerCase() === 'product'));
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return normalizeWhitespace(value) || undefined;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const name = (value as JsonLdNode)['name'];
    if (typeof name === 'string') return normalizeWhitespace(name) || undefined;
  }
  return undefined;
}

function metaContent(doc: Document, selectors: string[]): { value: string; selector: string } | null {
  for (const selector of selectors) {
    const el = doc.querySelector(selector);
    const content = normalizeWhitespace(el?.getAttribute('content') ?? '');
    if (content) return { value: content, selector };
  }
  return null;
}

// ------------------------------------------------------------------- images

/**
 * Amazon encodes the rendered size in the filename, e.g.
 * `41abc._AC_US40_.jpg`. Removing that token yields the full-resolution image.
 */
export function upscaleImageUrl(url: string): string {
  return url.replace(/\._[A-Z0-9,_]+_\.(jpg|jpeg|png|gif|webp)/i, '.$1');
}

function isUsableImage(url: string): boolean {
  if (!url || url.startsWith('data:')) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  // Sprites, transparent pixels and UI chrome are not product photos.
  if (/\/(sprite|grey-pixel|transparent-pixel|loading)/i.test(url)) return false;
  return /\.(jpe?g|png|webp)(\?|$)/i.test(upscaleImageUrl(url));
}

/** Picks the largest URL out of a `data-a-dynamic-image` JSON map. */
function fromDynamicImage(attr: string | null): string[] {
  if (!attr) return [];
  try {
    const map = JSON.parse(attr) as Record<string, [number, number]>;
    return Object.entries(map)
      .sort((a, b) => (b[1]?.[0] ?? 0) * (b[1]?.[1] ?? 0) - (a[1]?.[0] ?? 0) * (a[1]?.[1] ?? 0))
      .map(([url]) => url);
  } catch {
    return [];
  }
}

/**
 * Reads the image list Amazon embeds in the `ImageBlockATF` inline script.
 * This is the only place where the full gallery is available before the user
 * interacts with the thumbnails.
 */
export function imagesFromInlineScript(doc: Document): string[] {
  const scripts = Array.from(doc.querySelectorAll('script'));
  const urls: string[] = [];
  for (const script of scripts) {
    const code = script.textContent ?? '';
    if (!code.includes('colorImages') && !code.includes('ImageBlockATF')) continue;
    // Prefer hiRes, fall back to large — both are plain string properties.
    for (const key of ['hiRes', 'large', 'mainUrl']) {
      const re = new RegExp(`"${key}"\\s*:\\s*"(https?:[^"]+)"`, 'g');
      let match: RegExpExecArray | null;
      while ((match = re.exec(code)) !== null) {
        if (match[1]) urls.push(match[1].replace(/\\\//g, '/'));
      }
    }
  }
  return urls;
}

function collectImages(doc: Document, recorder: Recorder): string[] {
  const found: string[] = [];
  const sources: string[] = [];

  for (const selector of AMAZON_SELECTORS.mainImage.selectors) {
    const img = doc.querySelector(selector);
    if (!img) continue;
    const dynamic = fromDynamicImage(img.getAttribute('data-a-dynamic-image'));
    if (dynamic.length) {
      found.push(...dynamic);
      sources.push(`${selector}[data-a-dynamic-image]`);
    }
    const hires = img.getAttribute('data-old-hires');
    if (hires) {
      found.push(hires);
      sources.push(`${selector}[data-old-hires]`);
    }
    const src = img.getAttribute('src');
    if (src) {
      found.push(src);
      sources.push(`${selector}[src]`);
    }
    if (found.length) break;
  }

  const inline = imagesFromInlineScript(doc);
  if (inline.length) {
    found.push(...inline);
    sources.push('inline:colorImages');
  }

  for (const selector of AMAZON_SELECTORS.thumbnails.selectors) {
    const thumbs = Array.from(doc.querySelectorAll(selector));
    if (!thumbs.length) continue;
    for (const t of thumbs) {
      const src = t.getAttribute('src') ?? t.getAttribute('data-src');
      if (src) found.push(src);
    }
    sources.push(selector);
    break;
  }

  const ogImage = metaContent(doc, ['meta[property="og:image"]', 'meta[name="og:image"]']);
  if (ogImage) {
    found.push(ogImage.value);
    sources.push('meta:og:image');
  }

  // Normalise, de-duplicate on the upscaled URL, keep insertion order.
  const seen = new Set<string>();
  const images: string[] = [];
  for (const raw of found) {
    if (!isUsableImage(raw)) continue;
    const url = upscaleImageUrl(raw);
    // Amazon image ids look like /images/I/<id>. Two sizes of the same photo
    // share the id, so dedupe on it when present.
    const idMatch = url.match(/\/images\/I\/([A-Za-z0-9%+-]+)/);
    const key = idMatch?.[1] ?? url;
    if (seen.has(key)) continue;
    seen.add(key);
    images.push(url);
  }

  if (images.length) {
    recorder.hit('images', sources[0] ?? 'dom', images.length > 1 ? 'high' : 'medium');
  } else {
    recorder.miss('images', 'Es konnten keine Produktbilder gefunden werden.');
  }
  return images;
}

// ------------------------------------------------------------- detail tables

export interface DetailRow {
  label: string;
  value: string;
}

/** Reads label/value pairs from the various product detail layouts. */
export function readDetailRows(doc: Document): DetailRow[] {
  const rows: DetailRow[] = [];

  for (const selector of AMAZON_SELECTORS.detailTables.selectors) {
    for (const tr of Array.from(doc.querySelectorAll(selector))) {
      const label = textOf(tr.querySelector('th, td:first-child, .a-span3, .label'));
      const value = textOf(tr.querySelector('td:last-child, .a-span9, .value'));
      if (label && value && label !== value) rows.push({ label, value });
    }
  }

  for (const selector of AMAZON_SELECTORS.detailBullets.selectors) {
    for (const li of Array.from(doc.querySelectorAll(selector))) {
      const spans = li.querySelectorAll('span.a-text-bold, span.a-list-item > span:first-child');
      const boldText = textOf(spans[0]);
      const full = textOf(li);
      if (boldText && full.length > boldText.length) {
        const label = boldText.replace(/[::]\s*$/, '');
        const value = normalizeWhitespace(full.slice(boldText.length).replace(/^[::]\s*/, ''));
        if (label && value) rows.push({ label, value });
      } else if (full.includes(':')) {
        const [label, ...rest] = full.split(':');
        const value = normalizeWhitespace(rest.join(':'));
        if (label && value) rows.push({ label: normalizeWhitespace(label), value });
      }
    }
  }

  return rows;
}

function findDetail(rows: DetailRow[], labels: readonly string[]): DetailRow | undefined {
  return rows.find((row) => {
    const key = normalizeKey(row.label);
    return labels.some((l) => key === l || key.startsWith(`${l} `) || key.endsWith(` ${l}`));
  });
}

// --------------------------------------------------------------------- fields

function extractTitle(doc: Document, jsonLd: JsonLdNode | undefined, recorder: Recorder) {
  const fromJsonLd = jsonLd ? asString(jsonLd['name']) : undefined;
  if (fromJsonLd) {
    recorder.hit('title', 'json-ld:name');
    return fromJsonLd;
  }
  const dom = queryText(doc, AMAZON_SELECTORS.title);
  if (dom) {
    recorder.hit('title', dom.selector);
    return dom.value;
  }
  const meta = metaContent(doc, ['meta[property="og:title"]', 'meta[name="title"]']);
  if (meta) {
    recorder.hit('title', `meta:${meta.selector}`, 'medium');
    return meta.value;
  }
  recorder.miss('title', 'Produkttitel konnte nicht gelesen werden.');
  return undefined;
}

function priceFromJsonLd(node: JsonLdNode | undefined): { price?: number; currency?: string } {
  if (!node) return {};
  const offers = node['offers'];
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const offer = raw as JsonLdNode;
    const price =
      parseNumber(offer['price'] as string) ??
      parseNumber((offer['priceSpecification'] as JsonLdNode | undefined)?.['price'] as string);
    const currency =
      asString(offer['priceCurrency']) ??
      asString((offer['priceSpecification'] as JsonLdNode | undefined)?.['priceCurrency']);
    if (price !== undefined) return { price, currency };
  }
  return {};
}

function extractPrice(
  doc: Document,
  jsonLd: JsonLdNode | undefined,
  recorder: Recorder,
): { price?: number; currency?: string } {
  const fromJsonLd = priceFromJsonLd(jsonLd);
  if (fromJsonLd.price !== undefined) {
    recorder.hit('price', 'json-ld:offers.price');
    return fromJsonLd;
  }

  for (const selector of AMAZON_SELECTORS.price.selectors) {
    // The broad fallbacks would otherwise happily return the struck-through
    // list price, which would silently inflate every profit calculation.
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      if (isStrikeThroughPrice(el)) continue;
      const raw = textOf(el) || el.getAttribute('value') || '';
      const price = parseNumber(raw);
      // Guard against picking up a "0" or a stray number from an empty container.
      if (price !== undefined && price > 0) {
        recorder.hit('price', selector);
        return { price, currency: currencyFromText(raw) };
      }
    }
  }

  recorder.miss('price', 'Kein Preis gefunden – bitte manuell eintragen.');
  return {};
}

/**
 * True when an element belongs to a list price / UVP block rather than to the
 * price the customer actually pays.
 */
function isStrikeThroughPrice(el: Element): boolean {
  return !!el.closest('[data-a-strike="true"], .basisPrice, .a-text-price, #listPrice, .priceBlockStrikePriceString');
}

function currencyFromText(text: string): string | undefined {
  if (/€|EUR/i.test(text)) return 'EUR';
  if (/\$|USD/i.test(text)) return 'USD';
  if (/£|GBP/i.test(text)) return 'GBP';
  return undefined;
}

function extractListPrice(doc: Document, recorder: Recorder): number | undefined {
  for (const selector of AMAZON_SELECTORS.listPrice.selectors) {
    const el = doc.querySelector(selector);
    if (!el) continue;
    const value = parseNumber(textOf(el));
    if (value !== undefined && value > 0) {
      recorder.hit('listPrice', selector, 'medium');
      return value;
    }
  }
  recorder.miss('listPrice');
  return undefined;
}

function extractAsin(
  doc: Document,
  url: string,
  rows: DetailRow[],
  recorder: Recorder,
): string | undefined {
  for (const selector of AMAZON_SELECTORS.asinInput.selectors) {
    const el = doc.querySelector(selector);
    const value = el?.getAttribute('value')?.trim();
    if (isValidAsin(value)) {
      recorder.hit('asin', selector);
      return value!.toUpperCase();
    }
  }

  const fromUrl = extractAsinFromUrl(url);
  if (fromUrl) {
    recorder.hit('asin', 'url');
    return fromUrl;
  }

  const dataAsin = doc.querySelector('[data-asin]:not([data-asin=""])');
  const attr = dataAsin?.getAttribute('data-asin')?.trim();
  if (isValidAsin(attr)) {
    recorder.hit('asin', '[data-asin]', 'medium');
    return attr!.toUpperCase();
  }

  const row = findDetail(rows, DETAIL_LABELS.asin);
  if (row && isValidAsin(row.value)) {
    recorder.hit('asin', 'detail-row:ASIN', 'medium');
    return row.value.toUpperCase();
  }

  recorder.miss('asin', 'ASIN nicht gefunden.');
  return undefined;
}

function extractBrand(
  doc: Document,
  jsonLd: JsonLdNode | undefined,
  rows: DetailRow[],
  recorder: Recorder,
): string | undefined {
  const fromJsonLd = jsonLd ? asString(jsonLd['brand']) : undefined;
  if (fromJsonLd) {
    recorder.hit('brand', 'json-ld:brand');
    return fromJsonLd;
  }

  const row = findDetail(rows, DETAIL_LABELS.brand);
  if (row) {
    recorder.hit('brand', 'detail-row:Marke');
    return row.value;
  }

  const dom = queryText(doc, AMAZON_SELECTORS.brand);
  if (dom) {
    // `#bylineInfo` reads "Besuche den Fitgriff-Store" or "Marke: Fitgriff".
    const cleaned = dom.value
      .replace(/^(besuche den|visit the|marke|brand)\s*:?\s*/i, '')
      .replace(/[- ]?(store|shop)$/i, '')
      .trim();
    if (cleaned) {
      recorder.hit('brand', dom.selector, 'medium');
      return cleaned;
    }
  }

  recorder.miss('brand', 'Marke nicht gefunden.');
  return undefined;
}

function extractBullets(doc: Document, recorder: Recorder): string[] {
  for (const selector of AMAZON_SELECTORS.bulletPoints.selectors) {
    const items = Array.from(doc.querySelectorAll(selector))
      .map((el) => textOf(el))
      .filter((t) => t.length > 3)
      // Amazon repeats delivery/return notices inside the bullet list.
      .filter((t) => !/^(siehe|weitere informationen|make sure this fits)/i.test(t));
    if (items.length) {
      recorder.hit('bulletPoints', selector);
      return items;
    }
  }
  recorder.miss('bulletPoints');
  return [];
}

function extractDescription(
  doc: Document,
  jsonLd: JsonLdNode | undefined,
  recorder: Recorder,
): string | undefined {
  const dom = queryText(doc, AMAZON_SELECTORS.description);
  if (dom && dom.value.length > 20) {
    recorder.hit('description', dom.selector);
    return dom.value;
  }
  const fromJsonLd = jsonLd ? asString(jsonLd['description']) : undefined;
  if (fromJsonLd) {
    recorder.hit('description', 'json-ld:description', 'medium');
    return fromJsonLd;
  }
  const meta = metaContent(doc, ['meta[name="description"]', 'meta[property="og:description"]']);
  if (meta) {
    recorder.hit('description', `meta:${meta.selector}`, 'low');
    return meta.value;
  }
  recorder.miss('description');
  return undefined;
}

function extractIdentifiers(
  jsonLd: JsonLdNode | undefined,
  rows: DetailRow[],
  recorder: Recorder,
): { ean?: string; gtin?: string } {
  const gtinKeys = ['gtin13', 'gtin', 'gtin12', 'gtin14', 'gtin8'];
  for (const key of gtinKeys) {
    const value = jsonLd ? normalizeEan(asString(jsonLd[key])) : undefined;
    if (value) {
      recorder.hit('ean', `json-ld:${key}`);
      recorder.hit('gtin', `json-ld:${key}`);
      return { ean: value, gtin: value };
    }
  }

  const row = findDetail(rows, DETAIL_LABELS.ean);
  const fromRow = row ? normalizeEan(row.value) : undefined;
  if (fromRow) {
    recorder.hit('ean', `detail-row:${row!.label}`, 'medium');
    recorder.hit('gtin', `detail-row:${row!.label}`, 'medium');
    return { ean: fromRow, gtin: fromRow };
  }

  recorder.miss('ean', 'EAN nicht gefunden.');
  recorder.miss('gtin');
  return {};
}

function extractCategory(
  doc: Document,
  recorder: Recorder,
): { category?: string; subcategory?: string; categoryPath: string[] } {
  for (const selector of AMAZON_SELECTORS.breadcrumbs.selectors) {
    const parts = Array.from(doc.querySelectorAll(selector))
      .map((el) => textOf(el))
      .filter(Boolean);
    if (parts.length) {
      recorder.hit('category', selector);
      return {
        category: parts[0],
        subcategory: parts[1] ?? parts[parts.length - 1],
        categoryPath: parts,
      };
    }
  }
  recorder.miss('category', 'Keine Kategorie (Breadcrumb) gefunden.');
  return { categoryPath: [] };
}

function extractVariant(
  doc: Document,
  rows: DetailRow[],
  recorder: Recorder,
): { color?: string; size?: string; weight?: string } {
  const pick = (
    field: 'color' | 'size' | 'weight',
    group: SelectorGroup | null,
    labels: readonly string[],
  ): string | undefined => {
    if (group) {
      const dom = queryText(doc, group);
      if (dom) {
        recorder.hit(field, dom.selector, 'medium');
        return dom.value;
      }
    }
    const row = findDetail(rows, labels);
    if (row) {
      recorder.hit(field, `detail-row:${row.label}`, 'medium');
      return row.value;
    }
    recorder.miss(field);
    return undefined;
  };

  return {
    color: pick('color', AMAZON_SELECTORS.colorSelection, DETAIL_LABELS.color),
    size: pick('size', AMAZON_SELECTORS.sizeSelection, DETAIL_LABELS.size),
    weight: pick('weight', null, DETAIL_LABELS.weight),
  };
}

// ----------------------------------------------------------------- entry point

/**
 * Extracts everything the extension knows how to read from an Amazon product
 * page. Never throws for a missing field; only a fundamentally wrong page
 * (not a product page) produces `ok: false`.
 */
export function extractAmazonProduct(doc: Document, pageUrl: string): ExtractionResult {
  const started = Date.now();
  const recorder = new Recorder();

  if (!isProductPage(doc, pageUrl)) {
    return {
      ok: false,
      report: { fields: {}, warnings: [], durationMs: Date.now() - started },
      error: 'Keine unterstützte Amazon-Produktseite erkannt.',
    };
  }

  const jsonLdNodes = readJsonLd(doc);
  const productNode = findProductNode(jsonLdNodes);
  const rows = readDetailRows(doc);

  const hostname = (() => {
    try {
      return new URL(pageUrl).hostname;
    } catch {
      return '';
    }
  })();
  const marketplace = marketplaceFor(hostname);

  const title = extractTitle(doc, productNode, recorder);
  const { price, currency } = extractPrice(doc, productNode, recorder);
  const listPrice = extractListPrice(doc, recorder);
  const asin = extractAsin(doc, pageUrl, rows, recorder);
  const brand = extractBrand(doc, productNode, rows, recorder);
  const bulletPoints = extractBullets(doc, recorder);
  const description = extractDescription(doc, productNode, recorder);
  const { ean, gtin } = extractIdentifiers(productNode, rows, recorder);
  const { category, subcategory, categoryPath } = extractCategory(doc, recorder);
  const { color, size, weight } = extractVariant(doc, rows, recorder);
  const images = collectImages(doc, recorder);

  const availabilityHit = queryText(doc, AMAZON_SELECTORS.availability);
  if (availabilityHit) recorder.hit('availability', availabilityHit.selector, 'medium');
  else recorder.miss('availability');

  const sellerHit = queryText(doc, AMAZON_SELECTORS.seller);
  if (sellerHit) recorder.hit('seller', sellerHit.selector, 'low');
  else recorder.miss('seller');

  // A canonical URL is more stable than the address bar (which carries tracking
  // parameters and search context).
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const url = canonical && /^https?:/i.test(canonical) ? canonical : pageUrl;

  const product: ExtractedProduct = {
    title,
    description,
    bulletPoints,
    images,
    brand,
    asin,
    ean,
    gtin,
    category,
    subcategory,
    categoryPath,
    color,
    size,
    weight,
    price,
    listPrice,
    currency: currency ?? marketplace?.currency ?? 'EUR',
    url,
    availability: availabilityHit?.value,
    seller: sellerHit?.value,
  };

  // The extraction is useful as long as it produced a title; everything else
  // can be filled in by the user.
  const ok = !!title;
  if (!ok) recorder.warnings.push('Ohne Titel kann kein Produkt angelegt werden.');

  return {
    ok,
    product,
    report: {
      fields: recorder.fields,
      warnings: recorder.warnings,
      durationMs: Date.now() - started,
    },
    error: ok ? undefined : 'Produkt konnte nicht ausreichend analysiert werden.',
  };
}
