import type { Product } from '@/core/models/Product';
import type { ExtractedProduct } from '@/shared/types';
import { normalizeKey, tokenize, tokenSimilarity } from '@/core/utils/text';

/**
 * Local duplicate detection, in strict order of trustworthiness:
 *
 *   1. ASIN           — exact, marketplace-wide product identity
 *   2. EAN / GTIN     — exact, manufacturer identity
 *   3. Amazon URL     — same canonical product page
 *   4. brand + title  — fuzzy, only reported as a "possible" match
 *
 * Only the first three are treated as certain; the fuzzy match is surfaced with
 * a lower confidence so the user decides.
 */

export type DuplicateReason = 'asin' | 'ean' | 'gtin' | 'url' | 'title';

export interface DuplicateMatch {
  product: Product;
  reason: DuplicateReason;
  confidence: 'exact' | 'likely' | 'possible';
  similarity?: number;
}

/** Canonical Amazon product key: host + ASIN, or the path when no ASIN exists. */
export function canonicalAmazonKey(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const asin = extractAsinFromUrl(url);
    if (asin) return `${parsed.hostname.replace(/^www\./, '')}|${asin.toUpperCase()}`;
    return `${parsed.hostname.replace(/^www\./, '')}|${parsed.pathname.replace(/\/$/, '')}`;
  } catch {
    return undefined;
  }
}

/** ASINs are 10 characters, either all digits or B + 9 alphanumerics. */
export function extractAsinFromUrl(url: string): string | undefined {
  const patterns = [
    /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
    /[?&]asin=([A-Z0-9]{10})(?:&|$)/i,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1] && isValidAsin(m[1])) return m[1].toUpperCase();
  }
  return undefined;
}

export function isValidAsin(value: string | undefined): boolean {
  if (!value) return false;
  return /^[A-Z0-9]{10}$/i.test(value.trim());
}

/** Digits only; EANs are 8/12/13/14 digits. */
export function normalizeEan(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, '');
  return [8, 12, 13, 14].includes(digits.length) ? digits : undefined;
}

export interface DuplicateCandidate {
  asin?: string;
  ean?: string;
  gtin?: string;
  url?: string;
  title?: string;
  brand?: string;
}

export function fromExtracted(data: ExtractedProduct): DuplicateCandidate {
  return {
    asin: data.asin,
    ean: data.ean,
    gtin: data.gtin,
    url: data.url,
    title: data.title,
    brand: data.brand,
  };
}

/** Threshold above which two titles of the same brand count as the same item. */
const TITLE_SIMILARITY_THRESHOLD = 0.72;

/** A shorter title has to share at least this many tokens to count at all. */
const MIN_SHARED_TOKENS = 2;

/**
 * Similarity tuned for product titles.
 *
 * Plain Jaccard punishes the very common case where one listing spells the same
 * item out more verbosely ("Fitgriff Zughilfen" vs "Fitgriff Zughilfen
 * gepolstert"). The containment score handles that, and the shared-token floor
 * stops a two-word title from matching everything that contains it.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;

  const jaccard = tokenSimilarity(a, b);
  // With fewer than two shared tokens the containment score is not trustworthy
  // ("Zughilfen" would otherwise fully contain "Zughilfen Leder Profi XL Set"),
  // so fall back to plain Jaccard, which still matches identical short titles.
  if (shared < MIN_SHARED_TOKENS) return jaccard;

  const containment = shared / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment);
}

export function findDuplicates(
  candidate: DuplicateCandidate,
  products: Product[],
  options: { excludeId?: string } = {},
): DuplicateMatch[] {
  const pool = products.filter(
    (p) => p.id !== options.excludeId && p.status !== 'CANCELLED',
  );
  const matches: DuplicateMatch[] = [];
  const seen = new Set<string>();

  const push = (match: DuplicateMatch) => {
    if (seen.has(match.product.id)) return;
    seen.add(match.product.id);
    matches.push(match);
  };

  const asin = candidate.asin?.trim().toUpperCase();
  if (isValidAsin(asin)) {
    for (const p of pool) {
      if (p.asin?.trim().toUpperCase() === asin) {
        push({ product: p, reason: 'asin', confidence: 'exact' });
      }
    }
  }

  const ean = normalizeEan(candidate.ean);
  if (ean) {
    for (const p of pool) {
      if (normalizeEan(p.ean) === ean) push({ product: p, reason: 'ean', confidence: 'exact' });
    }
  }

  const gtin = normalizeEan(candidate.gtin);
  if (gtin) {
    for (const p of pool) {
      if (normalizeEan(p.gtin) === gtin) push({ product: p, reason: 'gtin', confidence: 'exact' });
    }
  }

  const key = canonicalAmazonKey(candidate.url);
  if (key) {
    for (const p of pool) {
      if (canonicalAmazonKey(p.amazonUrl) === key) {
        push({ product: p, reason: 'url', confidence: 'likely' });
      }
    }
  }

  if (candidate.title) {
    const candidateBrand = normalizeKey(candidate.brand ?? '');
    for (const p of pool) {
      // A fuzzy title match only counts within the same brand (or when neither
      // side has a brand), otherwise unrelated products collide.
      const productBrand = normalizeKey(p.brand ?? '');
      if (candidateBrand && productBrand && candidateBrand !== productBrand) continue;
      const similarity = titleSimilarity(candidate.title, p.title);
      if (similarity >= TITLE_SIMILARITY_THRESHOLD) {
        push({ product: p, reason: 'title', confidence: 'possible', similarity });
      }
    }
  }

  const rank: Record<DuplicateMatch['confidence'], number> = { exact: 0, likely: 1, possible: 2 };
  return matches.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
}

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  asin: 'gleiche ASIN',
  ean: 'gleiche EAN',
  gtin: 'gleiche GTIN',
  url: 'gleiche Amazon-URL',
  title: 'sehr ähnlicher Titel',
};
