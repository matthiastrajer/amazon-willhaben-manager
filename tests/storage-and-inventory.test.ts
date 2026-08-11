import { describe, expect, it } from 'vitest';
import { StorageService } from '@/core/services/StorageService';
import { ProductService } from '@/core/services/ProductService';
import { SaleService } from '@/core/services/SaleService';
import { ListingService, parseWillhabenId } from '@/core/services/ListingService';
import { TemplateService } from '@/core/services/TemplateService';
import { SettingsService } from '@/core/services/SettingsService';
import { soldQuantityOf, stockOf, totalCapital } from '@/core/services/InventoryService';
import { STORAGE_KEYS } from '@/shared/constants';

describe('StorageService', () => {
  it('round-trips values and returns the fallback for unknown keys', async () => {
    expect(await StorageService.get('missing', 'default')).toBe('default');
    await StorageService.set('k', { a: 1 });
    expect(await StorageService.get('k', null)).toEqual({ a: 1 });
  });

  it('stores structured data without sharing references', async () => {
    const value = { list: [1, 2, 3] };
    await StorageService.set('k', value);
    value.list.push(4);
    expect(await StorageService.get<{ list: number[] }>('k', { list: [] })).toEqual({ list: [1, 2, 3] });
  });

  it('serialises concurrent mutations of the same key', async () => {
    await StorageService.set('counter', [] as number[]);
    await Promise.all(
      Array.from({ length: 25 }, (_v, i) =>
        StorageService.mutate<number[]>('counter', [], (list) => [...list, i]),
      ),
    );
    const result = await StorageService.get<number[]>('counter', []);
    // Without the write queue, concurrent read-modify-write would lose entries.
    expect(result).toHaveLength(25);
    expect(new Set(result).size).toBe(25);
  });

  it('notifies subscribers on change', async () => {
    const seen: string[][] = [];
    const unsubscribe = StorageService.subscribe((keys) => seen.push(keys));
    await StorageService.set('watched', 1);
    unsubscribe();
    await StorageService.set('watched', 2);
    expect(seen).toEqual([['watched']]);
  });

  it('records the schema version on init', async () => {
    await StorageService.init();
    const meta = await StorageService.get<{ schemaVersion: number }>(STORAGE_KEYS.meta, {
      schemaVersion: 0,
    });
    expect(meta.schemaVersion).toBe(1);
  });
});

describe('ProductService', () => {
  it('creates a product with sane defaults', async () => {
    const p = await ProductService.create({ title: 'Testprodukt', purchasePrice: 10 });
    expect(p.status).toBe('DRAFT');
    expect(p.quantity).toBe(1);
    expect(p.currency).toBe('EUR');
    expect(p.history).toHaveLength(1);
    expect(await ProductService.byId(p.id)).toEqual(p);
  });

  it('persists across service calls', async () => {
    await ProductService.create({ title: 'A' });
    await ProductService.create({ title: 'B' });
    expect(await ProductService.all()).toHaveLength(2);
  });

  it('records status changes with the matching timestamp', async () => {
    const p = await ProductService.create({ title: 'X' });
    const ready = await ProductService.setStatus(p.id, 'READY_TO_LIST');
    expect(ready?.preparedAt).toBeTruthy();
    const listed = await ProductService.setStatus(p.id, 'LISTED');
    expect(listed?.listedAt).toBeTruthy();
    expect(listed?.history.some((h) => h.event.includes('Gelistet'))).toBe(true);
  });

  it('removes the product together with its sales and listings', async () => {
    const p = await ProductService.create({ title: 'X', purchasePrice: 5, quantity: 2 });
    await SaleService.record({ productId: p.id, salePrice: 10 });
    await ListingService.upsertPrepared({ productId: p.id, platform: 'willhaben' });

    await ProductService.remove(p.id);
    expect(await ProductService.all()).toHaveLength(0);
    expect(await SaleService.all()).toHaveLength(0);
    expect(await ListingService.all()).toHaveLength(0);
  });
});

describe('inventory', () => {
  it('derives available stock from the sales ledger', async () => {
    const p = await ProductService.create({ title: 'Zughilfen', purchasePrice: 9.99, quantity: 5 });
    await ProductService.update(p.id, { listedQuantity: 5 });

    let sales = await SaleService.all();
    let stock = stockOf((await ProductService.byId(p.id))!, sales);
    expect(stock).toMatchObject({ total: 5, sold: 0, available: 5, listed: 5 });

    await SaleService.record({ productId: p.id, salePrice: 19.99 });
    sales = await SaleService.all();
    stock = stockOf((await ProductService.byId(p.id))!, sales);
    expect(stock.sold).toBe(1);
    expect(stock.available).toBe(4);
    // A unit that is gone cannot still be listed.
    expect(stock.listed).toBeLessThanOrEqual(4);
  });

  it('never lets listed exceed available', async () => {
    const p = await ProductService.create({ title: 'X', quantity: 2, listedQuantity: 99 });
    expect(stockOf(p, []).listed).toBe(2);
  });

  it('computes capital only for units still on hand', async () => {
    const a = await ProductService.create({
      title: 'A',
      purchasePrice: 10,
      purchaseShipping: 2,
      quantity: 3,
    });
    const b = await ProductService.create({ title: 'B', purchasePrice: 5, quantity: 1 });

    expect(totalCapital([a, b], [])).toBe(41); // 3*12 + 1*5

    await SaleService.record({ productId: a.id, salePrice: 20 });
    const products = await ProductService.all();
    const sales = await SaleService.all();
    expect(totalCapital(products, sales)).toBe(29); // 2*12 + 1*5
  });

  it('sums sale quantities per product', () => {
    const sales = [
      { productId: 'a', quantity: 2 },
      { productId: 'a', quantity: 1 },
      { productId: 'b', quantity: 5 },
    ] as never[];
    expect(soldQuantityOf('a', sales)).toBe(3);
    expect(soldQuantityOf('c', sales)).toBe(0);
  });
});

describe('SaleService', () => {
  it('supports several sales of the same product at different prices', async () => {
    const p = await ProductService.create({ title: 'Zughilfen', purchasePrice: 9.99, quantity: 3 });

    await SaleService.record({ productId: p.id, salePrice: 19.99, saleDate: '2026-08-01' });
    await SaleService.record({ productId: p.id, salePrice: 17.99, saleDate: '2026-08-05' });
    await SaleService.record({ productId: p.id, salePrice: 18.5, saleDate: '2026-08-09' });

    const sales = await SaleService.forProduct(p.id);
    expect(sales).toHaveLength(3);
    expect(sales.map((s) => s.salePrice).sort()).toEqual([17.99, 18.5, 19.99]);

    const updated = (await ProductService.byId(p.id))!;
    expect(updated.soldQuantity).toBe(3);
    expect(updated.status).toBe('SOLD');
    expect(stockOf(updated, sales).available).toBe(0);
  });

  it('refuses to sell more units than are in stock', async () => {
    const p = await ProductService.create({ title: 'X', quantity: 2 });
    await SaleService.record({ productId: p.id, salePrice: 10, quantity: 2 });
    await expect(SaleService.record({ productId: p.id, salePrice: 10 })).rejects.toThrow(
      /kein Bestand/i,
    );
  });

  it('refuses an oversized single sale', async () => {
    const p = await ProductService.create({ title: 'X', quantity: 2 });
    await expect(
      SaleService.record({ productId: p.id, salePrice: 10, quantity: 5 }),
    ).rejects.toThrow(/nur noch 2/i);
  });

  it('keeps a partially sold product out of SOLD status', async () => {
    const p = await ProductService.create({ title: 'X', quantity: 3, status: 'LISTED' });
    await SaleService.record({ productId: p.id, salePrice: 10 });
    const updated = (await ProductService.byId(p.id))!;
    expect(updated.status).toBe('LISTED');
    expect(updated.soldQuantity).toBe(1);
  });

  it('recomputes stock and status when a sale is deleted', async () => {
    const p = await ProductService.create({ title: 'X', quantity: 1 });
    await ProductService.setStatus(p.id, 'LISTED');
    const sale = await SaleService.record({ productId: p.id, salePrice: 10 });
    expect((await ProductService.byId(p.id))!.status).toBe('SOLD');

    await SaleService.remove(sale.id);
    const restored = (await ProductService.byId(p.id))!;
    expect(restored.soldQuantity).toBe(0);
    // The product goes back to being an active listing, not stuck at SOLD.
    expect(restored.status).toBe('LISTED');
    expect(restored.soldAt).toBeUndefined();
  });

  it('falls back to DRAFT when a never-listed product loses its only sale', async () => {
    const p = await ProductService.create({ title: 'X', quantity: 1 });
    const sale = await SaleService.record({ productId: p.id, salePrice: 10 });
    await SaleService.remove(sale.id);
    expect((await ProductService.byId(p.id))!.status).toBe('DRAFT');
  });

  it('rejects a sale for an unknown product', async () => {
    await expect(SaleService.record({ productId: 'nope', salePrice: 10 })).rejects.toThrow(
      /nicht gefunden/i,
    );
  });
});

describe('ListingService', () => {
  it('does not create duplicate listings when a product is prepared twice', async () => {
    const p = await ProductService.create({ title: 'X' });
    await ListingService.upsertPrepared({ productId: p.id, platform: 'willhaben', listedPrice: 19.99 });
    await ListingService.upsertPrepared({ productId: p.id, platform: 'willhaben', listedPrice: 21.99 });

    const listings = await ListingService.forProduct(p.id);
    expect(listings).toHaveLength(1);
    expect(listings[0]!.listedPrice).toBe(21.99);
  });

  it('supports several platforms per product', async () => {
    const p = await ProductService.create({ title: 'X' });
    await ListingService.upsertPrepared({ productId: p.id, platform: 'willhaben' });
    await ListingService.upsertPrepared({ productId: p.id, platform: 'ebay' });
    expect(await ListingService.forProduct(p.id)).toHaveLength(2);
  });

  it('extracts the ad id when a URL is attached', async () => {
    const p = await ProductService.create({ title: 'X' });
    const listing = await ListingService.attachUrl(
      p.id,
      'willhaben',
      'https://www.willhaben.at/iad/kaufen-und-verkaufen/d/fitgriff-zughilfen-1234567890/',
    );
    expect(listing.externalId).toBe('1234567890');
    expect(listing.status).toBe('ACTIVE');
    expect(listing.publishedAt).toBeTruthy();
  });

  it('returns no id for a URL without one', () => {
    expect(parseWillhabenId('https://www.willhaben.at/iad/anzeigeaufgeben')).toBeUndefined();
  });
});

describe('TemplateService', () => {
  it('seeds starter templates exactly once', async () => {
    const first = await TemplateService.ensureSeeded();
    expect(first.length).toBeGreaterThan(0);
    const second = await TemplateService.ensureSeeded();
    expect(second).toHaveLength(first.length);
  });

  it('suggests the template whose category matches', async () => {
    await TemplateService.ensureSeeded();
    const suggestion = await TemplateService.suggestFor({
      categoryPath: ['Sport & Freizeit', 'Fitness & Krafttraining'],
      title: 'Zughilfen',
    });
    expect(suggestion?.name).toBe('Standard Fitness');
  });

  it('falls back to the default template', async () => {
    await TemplateService.ensureSeeded();
    const suggestion = await TemplateService.suggestFor({ title: 'Zzz Qqq' });
    expect(suggestion?.isDefault).toBe(true);
  });

  it('keeps exactly one default template', async () => {
    await TemplateService.ensureSeeded();
    const created = await TemplateService.create({ name: 'Neu', isDefault: true });
    const all = await TemplateService.all();
    expect(all.filter((t) => t.isDefault)).toHaveLength(1);
    expect(all.find((t) => t.isDefault)!.id).toBe(created.id);
  });
});

describe('SettingsService', () => {
  it('merges stored settings over the defaults', async () => {
    await SettingsService.update({ defaultMarkupPercent: 45 });
    const s = await SettingsService.get();
    expect(s.defaultMarkupPercent).toBe(45);
    expect(s.minProfit).toBe(5); // default preserved
  });

  it('resets to the defaults', async () => {
    await SettingsService.update({ defaultMarkupPercent: 99 });
    const s = await SettingsService.reset();
    expect(s.defaultMarkupPercent).toBe(30);
  });
});
