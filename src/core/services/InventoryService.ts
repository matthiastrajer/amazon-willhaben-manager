import type { Product } from '@/core/models/Product';
import type { Sale } from '@/core/models/Sale';
import { round2 } from '@/core/utils/format';
import { unitPurchaseCost } from './ProfitCalculator';

/**
 * Derived stock figures. Nothing here is persisted: stock is always a function
 * of the purchase volume and the sales ledger, so it cannot drift.
 */
export interface StockLevels {
  /** Units acquired in total. */
  total: number;
  /** Units currently advertised. */
  listed: number;
  /** Units sold (sum over the sales ledger). */
  sold: number;
  /** Units still on hand: total − sold. */
  available: number;
  /** Capital tied up in the units still on hand. */
  capital: number;
}

export function soldQuantityOf(productId: string, sales: Sale[]): number {
  return sales
    .filter((s) => s.productId === productId)
    .reduce((sum, s) => sum + (s.quantity || 1), 0);
}

export function stockOf(product: Product, sales: Sale[]): StockLevels {
  const total = Math.max(0, product.quantity || 0);
  const sold = Math.min(total, soldQuantityOf(product.id, sales));
  const available = Math.max(0, total - sold);
  // A product cannot have more units listed than it still has on hand.
  const listed = Math.min(Math.max(0, product.listedQuantity || 0), available);
  return {
    total,
    listed,
    sold,
    available,
    capital: round2(available * unitPurchaseCost(product)),
  };
}

/** Capital bound in unsold stock across the whole catalogue. */
export function totalCapital(products: Product[], sales: Sale[]): number {
  return round2(
    products
      .filter((p) => p.status !== 'CANCELLED')
      .reduce((sum, p) => sum + stockOf(p, sales).capital, 0),
  );
}

/**
 * The status a product should have after its sales changed.
 *
 * Only the sale-driven transitions are automated. DRAFT → READY_TO_LIST →
 * LISTED stays under user control: the extension must never claim an ad is
 * online when only the form was prefilled.
 */
export function deriveStatusAfterSale(product: Product, sales: Sale[]): Product['status'] {
  if (product.status === 'CANCELLED' || product.status === 'ARCHIVED') return product.status;
  const stock = stockOf(product, sales);

  if (stock.sold > 0 && stock.available === 0) return 'SOLD';

  if (stock.sold > 0) {
    // Partially sold: keep it visible as an active listing when it was one.
    return product.status === 'SOLD' ? 'LISTED' : product.status;
  }

  // No sales left at all. A product that is still flagged SOLD here had its
  // sales corrected or deleted, so it has to go back to an active state.
  if (product.status === 'SOLD') {
    if (product.listedQuantity > 0 || product.listedAt) return 'LISTED';
    return product.preparedAt ? 'READY_TO_LIST' : 'DRAFT';
  }
  return product.status;
}
