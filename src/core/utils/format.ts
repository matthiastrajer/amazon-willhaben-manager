const DEFAULT_LOCALE = 'de-AT';
const DEFAULT_CURRENCY = 'EUR';

export function formatCurrency(
  value: number | undefined | null,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '–';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Currency with an explicit +/- sign, used for profit figures. */
export function formatSignedCurrency(
  value: number | undefined | null,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '–';
  const formatted = formatCurrency(Math.abs(value), currency, locale);
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

export function formatPercent(
  value: number | undefined | null,
  digits = 1,
  locale = DEFAULT_LOCALE,
): string {
  if (value === undefined || value === null || Number.isNaN(value) || !Number.isFinite(value)) {
    return '–';
  }
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)} %`;
}

export function formatNumber(value: number | undefined | null, locale = DEFAULT_LOCALE): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '–';
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(iso: string | undefined, locale = DEFAULT_LOCALE): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso: string | undefined, locale = DEFAULT_LOCALE): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '–';
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Today as `yyyy-mm-dd` in local time (not UTC — dates are user-facing). */
export function todayISODate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a user-entered or scraped number. Handles German ("1.234,56"),
 * English ("1,234.56") and bare ("1234.56") notations plus currency symbols.
 */
export function parseNumber(input: string | number | undefined | null): number | undefined {
  if (typeof input === 'number') return Number.isFinite(input) ? input : undefined;
  if (!input) return undefined;

  let s = String(input).trim();
  // Keep digits, separators and a leading sign only.
  s = s.replace(/[^\d.,\-]/g, '');
  if (!s || !/\d/.test(s)) return undefined;

  const negative = s.startsWith('-');
  s = s.replace(/-/g, '');

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    // Whichever separator comes last is the decimal separator.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const decimals = s.length - lastComma - 1;
    // "1,234" with exactly 3 decimals is a thousands separator, not a decimal.
    s = decimals === 3 && s.indexOf(',') === lastComma && /^\d{1,3},\d{3}$/.test(s)
      ? s.replace(',', '')
      : s.replace(',', '.');
  } else if (lastDot !== -1) {
    const decimals = s.length - lastDot - 1;
    if (decimals === 3 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return negative ? -n : n;
}

/** Rounds to 2 decimals without float drift (0.1 + 0.2 style artefacts). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
