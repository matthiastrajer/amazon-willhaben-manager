import type { Product } from '@/core/models/Product';
import type { Sale } from '@/core/models/Sale';
import { round2 } from '@/core/utils/format';

/**
 * The single place where money is turned into profit figures.
 *
 * Rule: a profit is NEVER "sale price − Amazon price". Every calculation walks
 * through the full cost stack on both sides of the trade.
 */

export interface ProfitBreakdown {
  /** Units this calculation covers. */
  quantity: number;
  /** Purchase price + purchase shipping + other purchase costs, per unit. */
  unitPurchaseCost: number;
  totalPurchaseCost: number;

  platformFees: number;
  shippingCost: number;
  packagingCost: number;
  otherCosts: number;
  totalSaleCosts: number;

  revenue: number;
  profit: number;
  /** profit / revenue * 100 — 0 when there is no revenue. */
  margin: number;
  /** profit / totalPurchaseCost * 100 — 0 when nothing was spent. */
  roi: number;
}

const EMPTY_COSTS = {
  platformFees: 0,
  shippingCost: 0,
  packagingCost: 0,
  otherCosts: 0,
};

/** Per-unit acquisition cost of a product. */
export function unitPurchaseCost(product: Pick<
  Product,
  'purchasePrice' | 'purchaseShipping' | 'purchaseOtherCosts'
>): number {
  return round2(
    (product.purchasePrice || 0) +
      (product.purchaseShipping || 0) +
      (product.purchaseOtherCosts || 0),
  );
}

export interface SaleCosts {
  platformFees?: number;
  shippingCost?: number;
  packagingCost?: number;
  otherCosts?: number;
}

/**
 * Core calculation. `revenue` is the total the buyer paid for `quantity` units.
 */
export function calculateProfit(
  product: Pick<Product, 'purchasePrice' | 'purchaseShipping' | 'purchaseOtherCosts'>,
  revenue: number,
  costs: SaleCosts = EMPTY_COSTS,
  quantity = 1,
): ProfitBreakdown {
  const qty = quantity > 0 ? quantity : 1;
  const unitCost = unitPurchaseCost(product);
  const totalPurchaseCost = round2(unitCost * qty);

  const platformFees = costs.platformFees || 0;
  const shippingCost = costs.shippingCost || 0;
  const packagingCost = costs.packagingCost || 0;
  const otherCosts = costs.otherCosts || 0;
  const totalSaleCosts = round2(platformFees + shippingCost + packagingCost + otherCosts);

  const rev = round2(revenue || 0);
  const profit = round2(rev - totalPurchaseCost - totalSaleCosts);

  const margin = rev > 0 ? round2((profit / rev) * 100) : 0;
  const roi = totalPurchaseCost > 0 ? round2((profit / totalPurchaseCost) * 100) : 0;

  return {
    quantity: qty,
    unitPurchaseCost: unitCost,
    totalPurchaseCost,
    platformFees,
    shippingCost,
    packagingCost,
    otherCosts,
    totalSaleCosts,
    revenue: rev,
    profit,
    margin,
    roi,
  };
}

/** Profit of one recorded sale. */
export function calculateSaleProfit(product: Product, sale: Sale): ProfitBreakdown {
  return calculateProfit(product, sale.salePrice, sale, sale.quantity || 1);
}

/**
 * Expected profit for a single unit that is still in stock, based on the
 * planned sale price. Sale-side costs are unknown at this point, so they are
 * zero — the UI labels this clearly as "erwartet".
 */
export function calculateExpectedProfit(product: Product): ProfitBreakdown | undefined {
  if (product.plannedSalePrice === undefined || product.plannedSalePrice === null) return undefined;
  return calculateProfit(product, product.plannedSalePrice, EMPTY_COSTS, 1);
}

/** Aggregates several breakdowns into one. Margin/ROI are recomputed, not averaged. */
export function aggregate(breakdowns: ProfitBreakdown[]): ProfitBreakdown {
  const sum = breakdowns.reduce<ProfitBreakdown>(
    (acc, b) => ({
      quantity: acc.quantity + b.quantity,
      unitPurchaseCost: 0,
      totalPurchaseCost: acc.totalPurchaseCost + b.totalPurchaseCost,
      platformFees: acc.platformFees + b.platformFees,
      shippingCost: acc.shippingCost + b.shippingCost,
      packagingCost: acc.packagingCost + b.packagingCost,
      otherCosts: acc.otherCosts + b.otherCosts,
      totalSaleCosts: acc.totalSaleCosts + b.totalSaleCosts,
      revenue: acc.revenue + b.revenue,
      profit: acc.profit + b.profit,
      margin: 0,
      roi: 0,
    }),
    {
      quantity: 0,
      unitPurchaseCost: 0,
      totalPurchaseCost: 0,
      platformFees: 0,
      shippingCost: 0,
      packagingCost: 0,
      otherCosts: 0,
      totalSaleCosts: 0,
      revenue: 0,
      profit: 0,
      margin: 0,
      roi: 0,
    },
  );

  sum.totalPurchaseCost = round2(sum.totalPurchaseCost);
  sum.totalSaleCosts = round2(sum.totalSaleCosts);
  sum.revenue = round2(sum.revenue);
  sum.profit = round2(sum.profit);
  sum.unitPurchaseCost = sum.quantity > 0 ? round2(sum.totalPurchaseCost / sum.quantity) : 0;
  sum.margin = sum.revenue > 0 ? round2((sum.profit / sum.revenue) * 100) : 0;
  sum.roi = sum.totalPurchaseCost > 0 ? round2((sum.profit / sum.totalPurchaseCost) * 100) : 0;
  return sum;
}
