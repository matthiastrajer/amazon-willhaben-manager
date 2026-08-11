import { describe, expect, it } from 'vitest';
import {
  computeDashboard,
  computeStats,
  inRange,
  monthlySeries,
  resolvePeriod,
  salesInRange,
} from '@/core/services/AnalyticsService';
import { ExportService } from '@/core/services/ExportService';
import { ProductService } from '@/core/services/ProductService';
import { SaleService } from '@/core/services/SaleService';
import { ListingService } from '@/core/services/ListingService';
import { TemplateService } from '@/core/services/TemplateService';
import { SettingsService } from '@/core/services/SettingsService';
import type { Product } from '@/core/models/Product';
import type { Sale } from '@/core/models/Sale';

const NOW = new Date('2026-08-11T12:00:00.000Z');

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    title: 'Zughilfen',
    description: '',
    bulletPoints: [],
    images: [],
    selectedImages: [],
    condition: 'NEU',
    currency: 'EUR',
    purchasePrice: 10,
    purchaseShipping: 0,
    purchaseOtherCosts: 0,
    status: 'SOLD',
    quantity: 1,
    listedQuantity: 0,
    soldQuantity: 1,
    platform: 'willhaben',
    importedAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    source: 'amazon',
    history: [],
    ...overrides,
  };
}

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 's1',
    productId: 'p1',
    quantity: 1,
    salePrice: 20,
    platformFees: 0,
    shippingCost: 0,
    packagingCost: 0,
    otherCosts: 0,
    saleDate: '2026-08-11',
    platform: 'willhaben',
    createdAt: '2026-08-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('period resolution', () => {
  it('resolves the calendar periods', () => {
    expect(resolvePeriod('today', NOW)).toEqual({ from: '2026-08-11', to: '2026-08-11' });
    expect(resolvePeriod('month', NOW)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(resolvePeriod('last-month', NOW)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
    expect(resolvePeriod('year', NOW)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(resolvePeriod('last-year', NOW)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
    expect(resolvePeriod('all', NOW)).toEqual({});
  });

  it('resolves the ISO week from Monday to Sunday', () => {
    // 2026-08-11 is a Tuesday.
    expect(resolvePeriod('week', NOW)).toEqual({ from: '2026-08-10', to: '2026-08-16' });
  });

  it('passes a custom range through', () => {
    expect(resolvePeriod('custom', NOW, { from: '2026-01-01', to: '2026-03-31' })).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
  });

  it('filters sales by range, inclusive on both ends', () => {
    expect(inRange('2026-08-01', { from: '2026-08-01', to: '2026-08-31' })).toBe(true);
    expect(inRange('2026-08-31', { from: '2026-08-01', to: '2026-08-31' })).toBe(true);
    expect(inRange('2026-07-31', { from: '2026-08-01', to: '2026-08-31' })).toBe(false);
    expect(inRange('2026-07-31', {})).toBe(true);

    const sales = [sale({ saleDate: '2026-07-15' }), sale({ id: 's2', saleDate: '2026-08-11' })];
    expect(salesInRange(sales, resolvePeriod('month', NOW))).toHaveLength(1);
  });
});

describe('aggregate statistics', () => {
  it('sums a mixed set of sales correctly', () => {
    const products = [product({ id: 'p1', purchasePrice: 10 }), product({ id: 'p2', purchasePrice: 5 })];
    const sales = [
      sale({ id: 's1', productId: 'p1', salePrice: 20, shippingCost: 4 }), // profit 6
      sale({ id: 's2', productId: 'p2', salePrice: 15, platformFees: 1 }), // profit 9
    ];
    const stats = computeStats(sales, products);

    expect(stats.revenue).toBe(35);
    expect(stats.profit).toBe(15);
    expect(stats.saleCount).toBe(2);
    expect(stats.unitsSold).toBe(2);
    expect(stats.averageProfit).toBe(7.5);
    expect(stats.margin).toBe(42.86); // 15/35
  });

  it('skips sales whose product no longer exists rather than mis-costing them', () => {
    const stats = computeStats([sale({ productId: 'ghost' })], [product()]);
    expect(stats.saleCount).toBe(0);
    expect(stats.profit).toBe(0);
  });

  it('returns zeroes for an empty ledger', () => {
    const stats = computeStats([], []);
    expect(stats.revenue).toBe(0);
    expect(stats.margin).toBe(0);
    expect(stats.roi).toBe(0);
    expect(stats.averageProfit).toBe(0);
  });

  it('builds the dashboard figures', () => {
    const products = [
      product({ id: 'p1', status: 'SOLD' }),
      product({ id: 'p2', status: 'LISTED', quantity: 3, soldQuantity: 0, purchasePrice: 7 }),
      product({ id: 'p3', status: 'DRAFT', quantity: 1, soldQuantity: 0 }),
      product({ id: 'p4', status: 'CANCELLED' }),
    ];
    const stats = computeDashboard(products, [sale()], NOW);

    expect(stats.productCount).toBe(3); // cancelled excluded
    expect(stats.listedCount).toBe(1);
    expect(stats.soldCount).toBe(1);
    expect(stats.allTime.profit).toBe(10);
    expect(stats.thisMonth.profit).toBe(10);
    expect(stats.unitsInStock).toBe(4); // p2: 3, p3: 1
    expect(stats.capital).toBe(31); // 3*7 + 1*10
  });

  it('produces a continuous monthly series including empty months', () => {
    const series = monthlySeries([sale({ saleDate: '2026-08-11' })], [product()], 3, NOW);
    expect(series).toHaveLength(3);
    expect(series.map((m) => m.key)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(series[0]!.profit).toBe(0);
    expect(series[2]!.profit).toBe(10);
  });
});

describe('CSV export', () => {
  it('exports products with German number and separator conventions', async () => {
    const p = await ProductService.create({
      title: 'Zughilfen',
      brand: 'Fitgriff',
      asin: 'B07DFMQZ6H',
      purchasePrice: 9.99,
      plannedSalePrice: 19.99,
      quantity: 2,
    });
    const csv = ExportService.productsToCsv([(await ProductService.byId(p.id))!], [], []);
    const [header, row] = csv.split('\r\n');

    expect(header).toContain('Produkt;Marke;ASIN');
    expect(row).toContain('Zughilfen');
    expect(row).toContain('9,99'); // comma decimal separator
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM so Excel detects UTF-8
  });

  it('quotes values containing the delimiter', async () => {
    await ProductService.create({ title: 'Set; groß, "Sonderangebot"' });
    const csv = ExportService.productsToCsv(await ProductService.all(), [], []);
    expect(csv).toContain('"Set; groß, ""Sonderangebot"""');
  });

  it('exports the sales ledger with derived figures', async () => {
    const p = await ProductService.create({ title: 'X', purchasePrice: 10, quantity: 1 });
    await SaleService.record({ productId: p.id, salePrice: 18, shippingCost: 4 });
    const csv = ExportService.salesToCsv(await SaleService.all(), await ProductService.all());
    expect(csv).toContain('4,00'); // profit
    expect(csv).toContain('22,22'); // margin
    expect(csv).toContain('40,00'); // ROI
  });
});

describe('backup and restore', () => {
  it('creates a backup containing every collection', async () => {
    await TemplateService.ensureSeeded();
    const p = await ProductService.create({ title: 'X', purchasePrice: 10, quantity: 1 });
    await SaleService.record({ productId: p.id, salePrice: 20 });
    await ListingService.upsertPrepared({ productId: p.id, platform: 'willhaben' });
    await SettingsService.update({ defaultMarkupPercent: 42 });

    const backup = await ExportService.createBackup();
    expect(backup.format).toBe('amazon-willhaben-manager-backup');
    expect(backup.products).toHaveLength(1);
    expect(backup.sales).toHaveLength(1);
    expect(backup.listings).toHaveLength(1);
    expect(backup.templates.length).toBeGreaterThan(0);
    expect(backup.settings.defaultMarkupPercent).toBe(42);
  });

  it('rejects files that are not a backup of this extension', () => {
    expect(ExportService.validateBackup(null).ok).toBe(false);
    expect(ExportService.validateBackup({ format: 'something-else' }).ok).toBe(false);
    expect(ExportService.validateBackup({ format: 'amazon-willhaben-manager-backup' }).ok).toBe(false);

    const future = ExportService.validateBackup({
      format: 'amazon-willhaben-manager-backup',
      schemaVersion: 99,
      products: [],
      sales: [],
    });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.error).toMatch(/neueren Version/);
  });

  it('restores a backup by replacing everything', async () => {
    const p = await ProductService.create({ title: 'Original', purchasePrice: 10, quantity: 1 });
    await SaleService.record({ productId: p.id, salePrice: 20 });
    const backup = await ExportService.createBackup();

    await ProductService.remove(p.id);
    await ProductService.create({ title: 'Etwas anderes' });
    expect(await ProductService.all()).toHaveLength(1);

    await ExportService.restoreBackup(backup, 'replace');
    const products = await ProductService.all();
    expect(products).toHaveLength(1);
    expect(products[0]!.title).toBe('Original');
    expect(await SaleService.all()).toHaveLength(1);
  });

  it('merges a backup without duplicating known records', async () => {
    const p = await ProductService.create({ title: 'Bestehend', purchasePrice: 10, quantity: 1 });
    const backup = await ExportService.createBackup();

    await ProductService.create({ title: 'Neu dazugekommen' });
    await ExportService.restoreBackup(backup, 'merge');

    const products = await ProductService.all();
    expect(products).toHaveLength(2);
    expect(products.filter((x) => x.id === p.id)).toHaveLength(1);
  });

  it('survives a full round trip through JSON', async () => {
    const p = await ProductService.create({ title: 'Röundtrip – Ümläute', purchasePrice: 9.99, quantity: 2 });
    await SaleService.record({ productId: p.id, salePrice: 19.99, shippingCost: 4.5 });

    const serialized = JSON.stringify(await ExportService.createBackup());
    await ProductService.replaceAll([]);
    await SaleService.replaceAll([]);

    const validation = ExportService.validateBackup(JSON.parse(serialized));
    expect(validation.ok).toBe(true);
    if (validation.ok) await ExportService.restoreBackup(validation.backup, 'replace');

    const restored = await ProductService.all();
    expect(restored[0]!.title).toBe('Röundtrip – Ümläute');
    expect((await SaleService.all())[0]!.salePrice).toBe(19.99);
  });
});
