import { CONDITION_LABELS, type Product } from '@/core/models/Product';
import type { Settings } from '@/core/models/Settings';
import type { Template } from '@/core/models/Template';
import { looksEnglish, normalizeWhitespace, stripMarketingNoise, tokenize } from '@/core/utils/text';

/**
 * Generates the listing title and description.
 *
 * Hard rule: nothing is invented. Every sentence is assembled from data that
 * actually came out of the product record. When a field is missing, the
 * corresponding block is omitted rather than filled with a plausible guess.
 */

/** Willhaben-style titles are short; long Amazon titles get truncated hard. */
const MAX_TITLE_LENGTH = 70;

/**
 * Marketing fragments that carry no information for a classified ad. Removing
 * them is safe because they never describe a product property on their own.
 */
const NOISE_SEGMENT_PATTERNS: RegExp[] = [
  /\b(inkl|inklusive|gratis|kostenlos)\b.*$/i,
  /\bideal (für|zum)\b.*$/i,
  /\bperfekt (für|zum)\b.*$/i,
  /\bfür (frauen und männer|damen und herren|männer und frauen)\b/i,
  /\b(bestseller|top qualität|premium qualität|hochwertige? qualität)\b/i,
  /\b\d+er[- ]?(pack|set)\b/i,
];

/** Splits an Amazon title into its comma / dash separated segments. */
function splitSegments(title: string): string[] {
  return title
    .split(/\s*[–—|]\s*|\s*,\s*/)
    .map((s) => normalizeWhitespace(s))
    .filter(Boolean);
}

function isNoiseSegment(segment: string): boolean {
  return NOISE_SEGMENT_PATTERNS.some((re) => re.test(segment));
}

/**
 * Words that join a product name to its purpose ("Zughilfen *für*
 * Krafttraining"). The core product name always ends before one of these.
 */
const CONNECTOR_WORDS = new Set([
  'für', 'fur', 'mit', 'ohne', 'zum', 'zur', 'und', 'aus', 'in', 'im', 'am',
  'auf', 'per', 'von', 'bis', 'inkl', 'inklusive', 'ideal', 'perfekt',
  'for', 'with', 'without', 'and', 'by', 'to', 'from',
]);

/** Hard cap on the words of the extracted core phrase. */
const CORE_MAX_WORDS = 4;

/**
 * True when a word looks like a German noun: capitalised, but not SHOUTED.
 *
 * German capitalises nouns, which makes the first such word the head of the
 * product name — "klappbare **Hantelbank** Multifunktion Training" ends there.
 * ALLCAPS words are excluded because they are marketing emphasis, not a signal.
 */
function looksLikeNoun(word: string): boolean {
  const clean = word.replace(/[^\p{L}]/gu, '');
  if (clean.length < 3) return false;
  if (clean === clean.toUpperCase()) return false;
  const first = clean[0]!;
  return first === first.toUpperCase() && first !== first.toLowerCase();
}

function isConnector(word: string): boolean {
  return CONNECTOR_WORDS.has(word.replace(/[^\p{L}]/gu, '').toLowerCase());
}

/**
 * Extracts the short core product name out of a bloated marketplace title.
 *
 * "YOLEO klappbare Hantelbank Multifunktion Training Fitness Bank"
 *   → "klappbare Hantelbank"
 * "Fitgriff® Zughilfen (gepolstert) für Krafttraining, Bodybuilding"
 *   → "Zughilfen"
 *
 * Nothing is invented: the result is always a contiguous prefix of the words
 * the seller's own title already contained.
 */
export function extractCorePhrase(title: string, brand?: string): string {
  const firstSegment =
    splitSegments(stripMarketingNoise(title)).filter((s) => !isNoiseSegment(s))[0] ?? title;

  // Parentheticals are asides ("(gepolstert)"), never the product name.
  let text = normalizeWhitespace(firstSegment.replace(/\([^)]*\)/g, ' '));

  if (brand) {
    const brandTokens = new Set(tokenize(brand));
    text = text
      .split(/\s+/)
      .filter((w) => {
        const key = tokenize(w).join(' ');
        return !key || !brandTokens.has(key);
      })
      .join(' ');
  }

  const words = normalizeWhitespace(text).split(/\s+/).filter(Boolean);
  if (!words.length) return '';

  const collected: string[] = [];
  for (const word of words) {
    if (isConnector(word)) break;
    collected.push(word);
    if (looksLikeNoun(word)) break;
    if (collected.length >= CORE_MAX_WORDS) break;
  }

  // A single leading word is usually too little for a title-cased (English)
  // title, where the capitalisation signal carries no information.
  if (collected.length < 2) {
    const extended: string[] = [];
    for (const word of words) {
      if (isConnector(word)) break;
      extended.push(word);
      if (extended.length >= 3) break;
    }
    if (extended.length > collected.length) return normalizeWhitespace(extended.join(' '));
  }

  return normalizeWhitespace(collected.join(' '));
}

/**
 * Builds a short, punchy listing title: brand + core product name + condition.
 *
 * Classified-ad titles are scanned, not read. The Amazon title is therefore
 * reduced to its core phrase rather than copied — but only ever by *removing*
 * words, never by adding a property the source data did not contain.
 */
export function generateListingTitle(
  product: Pick<Product, 'title' | 'brand' | 'condition'>,
  options: { template?: Template | null; maxLength?: number } = {},
): string {
  const maxLength = options.maxLength ?? MAX_TITLE_LENGTH;
  const raw = stripMarketingNoise(product.title ?? '');
  if (!raw) return '';

  const brand = product.brand ? stripMarketingNoise(product.brand) : '';
  const core = extractCorePhrase(raw, brand);

  let title = core || normalizeWhitespace(splitSegments(raw)[0] ?? raw);

  // The brand leads the title exactly once — buyers search for it.
  if (brand) {
    const brandKey = tokenize(brand).join(' ');
    const titleKey = tokenize(title).join(' ');
    if (brandKey && !titleKey.startsWith(brandKey) && !titleKey.includes(brandKey)) {
      title = normalizeWhitespace(`${brand} ${title}`);
    }
  }

  const suffixParts: string[] = [];
  const conditionLabel = CONDITION_LABELS[product.condition];
  if (conditionLabel) suffixParts.push(conditionLabel);
  if (options.template?.titleSuffix) {
    const extra = normalizeWhitespace(options.template.titleSuffix.replace(/^[–-]\s*/, ''));
    if (extra && !suffixParts.includes(extra)) suffixParts.push(extra);
  }
  const suffix = suffixParts.length ? ` – ${suffixParts.join(', ')}` : '';

  if (title.length + suffix.length > maxLength) {
    const budget = Math.max(10, maxLength - suffix.length - 1);
    title = title.length > budget ? `${title.slice(0, budget).trimEnd().replace(/[\s/–-]+$/, '')}` : title;
  }

  return normalizeWhitespace(title + suffix);
}

/**
 * Bullet points that are pure marketing rather than product information.
 *
 * English source text is dropped: the ad is written in German, and manufacturer
 * copy on a German listing is often untranslated. A shorter German description
 * beats a mixed-language one.
 */
function usefulBullets(bullets: string[], limit: number): string[] {
  return bullets
    .map((b) => normalizeWhitespace(b))
    .filter((b) => b.length >= 8 && b.length <= 300)
    .filter((b) => !/^(hinweis|achtung|lieferumfang beachten)/i.test(b))
    .filter((b) => !looksEnglish(b))
    .slice(0, limit);
}

/**
 * Condenses one Amazon bullet into a scannable line.
 *
 * Amazon bullets usually read "GEPOLSTERT – Neoprenpolster schützt die
 * Handgelenke": a shouted keyword, then the actual information. The keyword is
 * dropped when a real sentence follows it, and the rest is cut at a word
 * boundary. Wording is never changed, only shortened.
 */
export function compactBullet(text: string, maxLength = 95): string {
  let s = normalizeWhitespace(text);

  const shouted = s.match(/^([\p{Lu}0-9][\p{Lu}0-9 .&/-]{2,28})\s*[–—:-]\s*(.+)$/u);
  if (shouted?.[2] && shouted[2].length >= 25) s = shouted[2];

  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length <= maxLength) return s;

  const cut = s.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > maxLength * 0.5 ? cut.slice(0, lastSpace) : cut)
    .trimEnd()
    .replace(/[,;:.\-–—]$/, '');
  return `${trimmed}…`;
}

export interface DescriptionOptions {
  template?: Template | null;
  settings?: Pick<Settings, 'defaultDescription' | 'compactDescription'> | null;
  maxBullets?: number;
  /** Short form: headline, a few condensed bullets, condition. Nothing else. */
  compact?: boolean;
}

/**
 * Builds the ad description. Only blocks backed by real data are emitted.
 *
 * When a template defines `descriptionTemplate`, that text wins and the
 * placeholders are substituted; unresolvable placeholders are removed rather
 * than left in the output.
 */
export function generateListingDescription(
  product: Pick<
    Product,
    'title' | 'brand' | 'bulletPoints' | 'description' | 'condition' | 'color' | 'size' | 'weight' | 'ean' | 'notes'
  >,
  options: DescriptionOptions = {},
): string {
  const compact = options.compact ?? options.settings?.compactDescription ?? true;
  const bullets = usefulBullets(
    product.bulletPoints ?? [],
    options.maxBullets ?? (compact ? 4 : 6),
  );
  const conditionLabel = CONDITION_LABELS[product.condition] ?? '';

  if (options.template?.descriptionTemplate) {
    return applyTemplate(options.template.descriptionTemplate, {
      title: product.title ?? '',
      brand: product.brand ?? '',
      features: bullets.map((b) => `• ${b}`).join('\n'),
      condition: conditionLabel,
      color: product.color ?? '',
      size: product.size ?? '',
      weight: product.weight ?? '',
    });
  }

  const blocks: string[] = [];

  if (compact) {
    // Headline is the short core name, matching the listing title.
    const core = extractCorePhrase(product.title ?? '', product.brand);
    const headline = normalizeWhitespace([product.brand, core].filter(Boolean).join(' '));
    if (headline) blocks.push(headline);

    if (bullets.length) {
      blocks.push(bullets.map((b) => `• ${compactBullet(b)}`).join('\n'));
    } else if (product.description) {
      const text = normalizeWhitespace(product.description);
      if (text.length > 20 && !looksEnglish(text)) blocks.push(compactBullet(text, 220));
    }

    const facts = [
      product.color ? `Farbe: ${product.color}` : '',
      product.size ? `Größe: ${product.size}` : '',
    ].filter(Boolean);
    if (facts.length) blocks.push(facts.join('\n'));

    if (conditionLabel) blocks.push(`Zustand: ${conditionLabel}`);

    const shortBoilerplate = normalizeWhitespace(options.settings?.defaultDescription ?? '');
    if (shortBoilerplate) blocks.push(shortBoilerplate);

    // `notes` stays internal here too.
    return blocks.join('\n\n').trim();
  }

  const headline = normalizeWhitespace(
    [product.brand, stripMarketingNoise(product.title ?? '')].filter(Boolean).join(' '),
  );
  if (headline) blocks.push(headline.startsWith(product.brand ?? ' ') ? headline : headline);

  if (bullets.length) {
    blocks.push(['Eigenschaften:', ...bullets.map((b) => `• ${b}`)].join('\n'));
  } else if (product.description && !looksEnglish(product.description)) {
    const text = normalizeWhitespace(product.description);
    if (text.length > 20) blocks.push(text.slice(0, 600));
  }

  const details: string[] = [];
  if (product.brand) details.push(`Marke: ${product.brand}`);
  if (product.color) details.push(`Farbe: ${product.color}`);
  if (product.size) details.push(`Größe: ${product.size}`);
  if (product.weight) details.push(`Gewicht: ${product.weight}`);
  if (product.ean) details.push(`EAN: ${product.ean}`);
  if (details.length) blocks.push(['Details:', ...details].join('\n'));

  if (conditionLabel) blocks.push(`Zustand:\n${conditionLabel}`);

  const boilerplate = normalizeWhitespace(options.settings?.defaultDescription ?? '');
  if (boilerplate) blocks.push(boilerplate);

  // `notes` is deliberately NOT included — notes are internal only.
  return blocks.join('\n\n').trim();
}

/** Substitutes {{placeholders}}; unknown or empty ones are dropped cleanly. */
export function applyTemplate(template: string, values: Record<string, string>): string {
  const replaced = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    return values[key] ?? '';
  });
  return replaced
    .split('\n')
    .filter((line, idx, arr) => {
      // Collapse blank runs created by removed placeholders.
      if (line.trim() !== '') return true;
      return idx > 0 && arr[idx - 1]?.trim() !== '';
    })
    .join('\n')
    .trim();
}
