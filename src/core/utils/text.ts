/** Collapses whitespace and strips zero-width characters. */
export function normalizeWhitespace(input: string): string {
  return input
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Lowercase, accent-free, punctuation-free key used for fuzzy comparisons. */
export function normalizeKey(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tokens of a normalised string, without very short noise words. */
export function tokenize(input: string, minLength = 2): string[] {
  return normalizeKey(input)
    .split(' ')
    .filter((t) => t.length >= minLength);
}

/**
 * Jaccard-style similarity over token sets. Used by duplicate detection as the
 * weakest signal, after ASIN / EAN / URL.
 */
export function tokenSimilarity(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** Strips trademark noise that makes Amazon titles unusable as listing titles. */
export function stripMarketingNoise(input: string): string {
  return normalizeWhitespace(
    input
      .replace(/[®™©]/g, '')
      .replace(/\s*\|\s*/g, ' – ')
      .replace(/\s*[-–—]\s*$/g, ''),
  );
}

/** Title-cases a word while leaving ALLCAPS acronyms alone. */
export function smartCapitalize(word: string): string {
  if (word.length <= 1) return word.toUpperCase();
  if (word === word.toUpperCase()) return word;
  return word[0]!.toUpperCase() + word.slice(1);
}
