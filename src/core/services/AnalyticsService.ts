import type { Product } from '@/core/models/Product';
import type { Sale } from '@/core/models/Sale';
import { round2 } from '@/core/utils/format';
import { aggregate, calculateSaleProfit, type ProfitBreakdown } from './ProfitCalculator';
import { stockOf, totalCapital } from './InventoryService';

/** Named reporting periods offered in the analytics view. */
export type PeriodId =
  | 'today'
  | 'week'
  | 'month'
  | 'last-month'
  | 'year'
  | 'last-year'
  | 'all'
  | 'custom';

export interface DateRange {
  /** Inclusive yyyy-mm-dd, or undefined for "open". */
  from?: string;
  to?: string;
}

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Resolves a named period into a concrete inclusive date range. */
export function resolvePeriod(period: PeriodId, now = new Date(), custom?: DateRange): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (period) {
    case 'today':
      return { from: iso(now), to: iso(now) };
    case 'week': {
      // ISO week: Monday .. Sunday
      const day = (now.getDay() + 6) % 7;
      const monday = new Date(y, m, now.getDate() - day);
      const sunday = new Date(y, m, now.getDate() - day + 6);
      return { from: iso(monday), to: iso(sunday) };
    }
    case 'month':
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case 'last-month':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'last-year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'custom':
      return custom ?? {};
    case 'all':
    default:
      return {};
  }
}

export const PERIOD_LABELS: Record<PeriodId, string> = {
  today: 'Heute',
  week: 'Diese Woche',
  month: 'Dieser Monat',
  'last-month': 'Letzter Monat',
  year: 'Dieses Jahr',
  'last-year': 'Letztes Jahr',
  all: 'Alle Zeit',
  custom: 'Benutzerdefiniert',
};

export function inRange(dateISO: string, range: DateRange): boolean {
  if (range.from && dateISO < range.from) return false;
  if (range.to && dateISO > range.to) return false;
  return true;
}

export function salesInRange(sales: Sale[], range: DateRange): Sale[] {
  return sales.filter((s) => inRange(s.saleDate, range));
}

export interface PeriodStats extends ProfitBreakdown {
  saleCount: number;
  unitsSold: number;
  averageProfit: number;
  averageSalePrice: number;
}

/** Aggregated profit figures over a set of sales. */
export function computeStats(sales: Sale[], products: Product[]): PeriodStats {
  const byId = new Map(products.map((p) => [p.id, p]));
  const breakdowns: ProfitBreakdown[] = [];
  for (const sale of sales) {
    const product = byId.get(sale.productId);
    if (!product) continue; // orphaned sale — cannot be costed, so it is skipped
    breakdowns.push(calculateSaleProfit(product, sale));
  }
  const total = aggregate(breakdowns);
  const saleCount = breakdowns.length;
  return {
    ...total,
    saleCount,
    unitsSold: total.quantity,
    averageProfit: saleCount > 0 ? round2(total.profit / saleCount) : 0,
    averageSalePrice: saleCount > 0 ? round2(total.revenue / saleCount) : 0,
  };
}

export interface DashboardStats {
  allTime: PeriodStats;
  thisMonth: PeriodStats;
  productCount: number;
  listedCount: number;
  soldCount: number;
  draftCount: number;
  readyCount: number;
  unitsInStock: number;
  capital: number;
}

export function computeDashboard(
  products: Product[],
  sales: Sale[],
  now = new Date(),
): DashboardStats {
  const monthRange = resolvePeriod('month', now);
  const active = products.filter((p) => p.status !== 'CANCELLED');

  return {
    allTime: computeStats(sales, products),
    thisMonth: computeStats(salesInRange(sales, monthRange), products),
    productCount: active.length,
    listedCount: active.filter((p) => p.status === 'LISTED').length,
    soldCount: active.filter((p) => p.status === 'SOLD').length,
    draftCount: active.filter((p) => p.status === 'DRAFT').length,
    readyCount: active.filter((p) => p.status === 'READY_TO_LIST').length,
    unitsInStock: active.reduce((sum, p) => sum + stockOf(p, sales).available, 0),
    capital: totalCapital(products, sales),
  };
}

export interface MonthlyBucket {
  /** yyyy-mm */
  key: string;
  label: string;
  revenue: number;
  profit: number;
  saleCount: number;
  margin: number;
}

const MONTH_NAMES = [
  'Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/**
 * Profit/revenue per month for the chart. Months without sales are included so
 * the chart shows a continuous timeline instead of collapsing gaps.
 */
export function monthlySeries(
  sales: Sale[],
  products: Product[],
  monthCount = 6,
  now = new Date(),
): MonthlyBucket[] {
  const buckets: MonthlyBucket[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthSales = sales.filter((s) => s.saleDate.startsWith(key));
    const stats = computeStats(monthSales, products);
    buckets.push({
      key,
      label: `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
      revenue: stats.revenue,
      profit: stats.profit,
      saleCount: stats.saleCount,
      margin: stats.margin,
    });
  }
  return buckets;
}
