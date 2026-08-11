/**
 * Sale — one recorded transaction for one product.
 *
 * A product may be sold multiple times at different prices, so each sale is
 * stored separately. Only raw figures live here: profit, margin and ROI are
 * always derived by ProfitCalculator so the numbers can never drift apart from
 * the underlying costs.
 */
export interface Sale {
  id: string;
  productId: string;

  /** Number of units moved by this sale. Defaults to 1. */
  quantity: number;

  /** Total the buyer actually paid for this sale (not per unit). */
  salePrice: number;

  platformFees: number;
  shippingCost: number;
  packagingCost: number;
  otherCosts: number;

  /** ISO date (yyyy-mm-dd) of the sale. */
  saleDate: string;
  platform: string;
  buyerNote?: string;
  createdAt: string;
}

export type SaleInput = Omit<Sale, 'id' | 'createdAt'>;
