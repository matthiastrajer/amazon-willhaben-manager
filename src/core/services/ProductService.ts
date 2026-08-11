import {
  PRODUCT_STATUS_META,
  type Product,
  type ProductInput,
  type ProductStatus,
} from '@/core/models/Product';
import type { ExtractedProduct } from '@/shared/types';
import { STORAGE_KEYS } from '@/shared/constants';
import { createId } from '@/core/utils/id';
import { round2 } from '@/core/utils/format';
import { StorageService } from './StorageService';
import { notifyDataChanged } from '@/shared/messages';
import type { Settings } from '@/core/models/Settings';

/** Everything that touches the product collection goes through this service. */
export const ProductService = {
  async all(): Promise<Product[]> {
    return StorageService.get<Product[]>(STORAGE_KEYS.products, []);
  },

  async byId(id: string): Promise<Product | undefined> {
    const products = await ProductService.all();
    return products.find((p) => p.id === id);
  },

  async create(input: ProductInput & { title: string }): Promise<Product> {
    const now = new Date().toISOString();
    const product: Product = {
      id: createId('prd'),
      title: input.title,
      listingTitle: input.listingTitle,
      description: input.description ?? '',
      listingDescription: input.listingDescription,
      bulletPoints: input.bulletPoints ?? [],
      images: input.images ?? [],
      selectedImages: input.selectedImages ?? [],
      brand: input.brand,
      asin: input.asin,
      ean: input.ean,
      gtin: input.gtin,
      category: input.category,
      subcategory: input.subcategory,
      color: input.color,
      size: input.size,
      weight: input.weight,
      condition: input.condition ?? 'NEU',
      amazonPrice: input.amazonPrice,
      currency: input.currency ?? 'EUR',
      amazonUrl: input.amazonUrl,
      availability: input.availability,
      seller: input.seller,
      purchasePrice: round2(input.purchasePrice ?? 0),
      purchaseShipping: round2(input.purchaseShipping ?? 0),
      purchaseOtherCosts: round2(input.purchaseOtherCosts ?? 0),
      plannedSalePrice: input.plannedSalePrice,
      status: input.status ?? 'DRAFT',
      quantity: Math.max(1, input.quantity ?? 1),
      listedQuantity: input.listedQuantity ?? 0,
      soldQuantity: input.soldQuantity ?? 0,
      platform: input.platform ?? 'willhaben',
      importedAt: now,
      updatedAt: now,
      preparedAt: input.preparedAt,
      listedAt: input.listedAt,
      soldAt: input.soldAt,
      source: input.source ?? 'manual',
      notes: input.notes,
      history: [
        {
          at: now,
          event: input.source === 'amazon' ? 'Von Amazon importiert' : 'Manuell angelegt',
        },
      ],
    };

    await StorageService.mutate<Product[]>(STORAGE_KEYS.products, [], (list) => [product, ...list]);
    notifyDataChanged(['products']);
    return product;
  },

  /**
   * Creates a product from scraped Amazon data. The Amazon price becomes the
   * purchase price because that is what the reseller will actually pay.
   */
  async createFromExtraction(
    data: ExtractedProduct,
    settings: Settings,
    overrides: ProductInput = {},
  ): Promise<Product> {
    return ProductService.create({
      title: data.title ?? 'Unbenanntes Produkt',
      description: data.description ?? '',
      bulletPoints: data.bulletPoints,
      images: data.images,
      selectedImages: settings.autoPrepareImages
        ? data.images.slice(0, settings.maxImages)
        : [],
      brand: data.brand,
      asin: data.asin,
      ean: data.ean,
      gtin: data.gtin,
      category: data.category,
      subcategory: data.subcategory,
      color: data.color,
      size: data.size,
      weight: data.weight,
      condition: settings.defaultCondition,
      amazonPrice: data.price,
      currency: data.currency || settings.currency,
      amazonUrl: data.url,
      availability: data.availability,
      seller: data.seller,
      purchasePrice: data.price ?? 0,
      purchaseShipping: 0,
      purchaseOtherCosts: 0,
      platform: settings.defaultPlatform,
      source: 'amazon',
      ...overrides,
    });
  },

  async update(id: string, patch: ProductInput, historyEvent?: string): Promise<Product | undefined> {
    let updated: Product | undefined;
    await StorageService.mutate<Product[]>(STORAGE_KEYS.products, [], (list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        const now = new Date().toISOString();
        updated = {
          ...p,
          ...patch,
          id: p.id,
          importedAt: p.importedAt,
          updatedAt: now,
          history: historyEvent ? [...p.history, { at: now, event: historyEvent }] : p.history,
        };
        return updated;
      }),
    );
    if (updated) notifyDataChanged(['products']);
    return updated;
  },

  /** Status change with the matching timestamp and a history entry. */
  async setStatus(id: string, status: ProductStatus, detail?: string): Promise<Product | undefined> {
    const now = new Date().toISOString();
    const patch: ProductInput = { status };
    if (status === 'READY_TO_LIST') patch.preparedAt = now;
    if (status === 'LISTED') patch.listedAt = now;
    if (status === 'SOLD') patch.soldAt = now;

    let updated: Product | undefined;
    await StorageService.mutate<Product[]>(STORAGE_KEYS.products, [], (list) =>
      list.map((p) => {
        if (p.id !== id) return p;
        updated = {
          ...p,
          ...patch,
          updatedAt: now,
          history: [
            ...p.history,
            {
              at: now,
              event: `Status: ${PRODUCT_STATUS_META[status].label}`,
              detail,
            },
          ],
        };
        return updated;
      }),
    );
    if (updated) notifyDataChanged(['products']);
    return updated;
  },

  async addHistory(id: string, event: string, detail?: string): Promise<void> {
    await StorageService.mutate<Product[]>(STORAGE_KEYS.products, [], (list) =>
      list.map((p) =>
        p.id === id
          ? { ...p, history: [...p.history, { at: new Date().toISOString(), event, detail }] }
          : p,
      ),
    );
    notifyDataChanged(['products']);
  },

  async remove(id: string): Promise<void> {
    await StorageService.mutate<Product[]>(STORAGE_KEYS.products, [], (list) =>
      list.filter((p) => p.id !== id),
    );
    // Sales and listings of a deleted product would otherwise become orphans.
    await StorageService.mutate<{ productId: string }[]>(STORAGE_KEYS.sales, [], (list) =>
      list.filter((s) => s.productId !== id),
    );
    await StorageService.mutate<{ productId: string }[]>(STORAGE_KEYS.listings, [], (list) =>
      list.filter((l) => l.productId !== id),
    );
    notifyDataChanged(['products', 'sales', 'listings']);
  },

  async replaceAll(products: Product[]): Promise<void> {
    await StorageService.set(STORAGE_KEYS.products, products);
    notifyDataChanged(['products']);
  },
};
