import type { Sale, SaleInput } from '@/core/models/Sale';
import { PRODUCT_STATUS_META, type Product } from '@/core/models/Product';
import { STORAGE_KEYS } from '@/shared/constants';
import { createId } from '@/core/utils/id';
import { round2, todayISODate } from '@/core/utils/format';
import { StorageService } from './StorageService';
import { ProductService } from './ProductService';
import { deriveStatusAfterSale, soldQuantityOf, stockOf } from './InventoryService';
import { notifyDataChanged } from '@/shared/messages';

/**
 * Recording a sale is the one operation that touches several collections at
 * once, so it lives here and always performs the full sequence:
 *
 *   1. persist the sale
 *   2. recompute soldQuantity from the ledger (never increment blindly)
 *   3. reduce the listed quantity so stock stays consistent
 *   4. update the product status
 *   5. write a history entry
 *
 * Everything else (dashboard, analytics, capital) is derived from these two
 * collections, so no further updates are needed.
 */
export const SaleService = {
  async all(): Promise<Sale[]> {
    return StorageService.get<Sale[]>(STORAGE_KEYS.sales, []);
  },

  async forProduct(productId: string): Promise<Sale[]> {
    const sales = await SaleService.all();
    return sales
      .filter((s) => s.productId === productId)
      .sort((a, b) => b.saleDate.localeCompare(a.saleDate));
  },

  async record(input: Partial<SaleInput> & { productId: string; salePrice: number }): Promise<Sale> {
    const product = await ProductService.byId(input.productId);
    if (!product) throw new Error('Produkt nicht gefunden.');

    const existingSales = await SaleService.all();
    const alreadySold = soldQuantityOf(product.id, existingSales);
    const remaining = Math.max(0, (product.quantity || 1) - alreadySold);
    const requested = Math.max(1, Math.round(input.quantity ?? 1));
    if (remaining === 0) {
      throw new Error('Für dieses Produkt ist kein Bestand mehr verfügbar.');
    }
    if (requested > remaining) {
      throw new Error(
        `Es sind nur noch ${remaining} Stück verfügbar (angefragt: ${requested}).`,
      );
    }

    const sale: Sale = {
      id: createId('sale'),
      productId: product.id,
      quantity: requested,
      salePrice: round2(input.salePrice || 0),
      platformFees: round2(input.platformFees ?? 0),
      shippingCost: round2(input.shippingCost ?? 0),
      packagingCost: round2(input.packagingCost ?? 0),
      otherCosts: round2(input.otherCosts ?? 0),
      saleDate: input.saleDate || todayISODate(),
      platform: input.platform || product.platform || 'willhaben',
      buyerNote: input.buyerNote,
      createdAt: new Date().toISOString(),
    };

    const sales = await StorageService.mutate<Sale[]>(STORAGE_KEYS.sales, [], (list) => [
      sale,
      ...list,
    ]);

    await SaleService.reconcileProduct(product, sales, `Verkauf erfasst: ${sale.quantity} Stück`);
    notifyDataChanged(['sales', 'products']);
    return sale;
  },

  async update(id: string, patch: Partial<SaleInput>): Promise<Sale | undefined> {
    let updated: Sale | undefined;
    const sales = await StorageService.mutate<Sale[]>(STORAGE_KEYS.sales, [], (list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        updated = {
          ...s,
          ...patch,
          id: s.id,
          productId: s.productId,
          quantity: Math.max(1, Math.round(patch.quantity ?? s.quantity)),
          salePrice: round2(patch.salePrice ?? s.salePrice),
        };
        return updated;
      }),
    );
    if (updated) {
      const product = await ProductService.byId(updated.productId);
      if (product) await SaleService.reconcileProduct(product, sales, 'Verkauf bearbeitet');
      notifyDataChanged(['sales', 'products']);
    }
    return updated;
  },

  async remove(id: string): Promise<void> {
    const before = await SaleService.all();
    const target = before.find((s) => s.id === id);
    const sales = await StorageService.mutate<Sale[]>(STORAGE_KEYS.sales, [], (list) =>
      list.filter((s) => s.id !== id),
    );
    if (target) {
      const product = await ProductService.byId(target.productId);
      if (product) await SaleService.reconcileProduct(product, sales, 'Verkauf gelöscht');
    }
    notifyDataChanged(['sales', 'products']);
  },

  /**
   * Recomputes a product's sold/listed quantities and status from the ledger.
   * Safe to call at any time — it is idempotent.
   */
  async reconcileProduct(product: Product, sales: Sale[], historyEvent?: string): Promise<void> {
    const sold = soldQuantityOf(product.id, sales);
    const stock = stockOf({ ...product, soldQuantity: sold }, sales);
    const status = deriveStatusAfterSale({ ...product, soldQuantity: sold }, sales);

    await ProductService.update(
      product.id,
      {
        soldQuantity: sold,
        listedQuantity: Math.min(product.listedQuantity || 0, stock.available),
        status,
        // Clear the sold timestamp when the product is no longer sold out.
        soldAt:
          status === 'SOLD'
            ? (product.soldAt ?? new Date().toISOString())
            : sold > 0
              ? product.soldAt
              : undefined,
      },
      historyEvent,
    );

    // A status transition driven by the ledger must show up in the history too,
    // otherwise the product timeline silently skips "Verkauft".
    if (status !== product.status) {
      await ProductService.addHistory(product.id, `Status: ${PRODUCT_STATUS_META[status].label}`);
    }
  },

  async replaceAll(sales: Sale[]): Promise<void> {
    await StorageService.set(STORAGE_KEYS.sales, sales);
    notifyDataChanged(['sales']);
  },
};
