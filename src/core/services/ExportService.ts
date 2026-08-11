import type { Product } from '@/core/models/Product';
import { PRODUCT_STATUS_META } from '@/core/models/Product';
import type { Sale } from '@/core/models/Sale';
import type { Listing } from '@/core/models/Listing';
import type { Template } from '@/core/models/Template';
import type { Settings } from '@/core/models/Settings';
import { SCHEMA_VERSION, platformLabel, STORAGE_KEYS } from '@/shared/constants';
import { calculateExpectedProfit, calculateSaleProfit } from './ProfitCalculator';
import { stockOf } from './InventoryService';
import { StorageService } from './StorageService';
import { ProductService } from './ProductService';
import { SaleService } from './SaleService';
import { ListingService } from './ListingService';
import { TemplateService } from './TemplateService';
import { SettingsService } from './SettingsService';

export interface BackupFile {
  format: 'amazon-willhaben-manager-backup';
  schemaVersion: number;
  exportedAt: string;
  products: Product[];
  sales: Sale[];
  listings: Listing[];
  templates: Template[];
  settings: Partial<Settings>;
}

/** RFC 4180 quoting: wrap in quotes and double any embedded quotes. */
function csvCell(value: unknown): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Numbers use a comma decimal separator and the file is semicolon-delimited so
 * it opens correctly in a German/Austrian Excel without an import wizard.
 */
function csvNumber(value: number | undefined): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  return value.toFixed(2).replace('.', ',');
}

function toCsv(rows: (string | number | undefined)[][]): string {
  const body = rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
  // BOM so Excel detects UTF-8.
  return `﻿${body}`;
}

export const ExportService = {
  /** Product catalogue as CSV, including derived profit figures. */
  productsToCsv(products: Product[], sales: Sale[], listings: Listing[]): string {
    const header = [
      'Produkt', 'Marke', 'ASIN', 'EAN', 'Status', 'Plattform',
      'Menge', 'Gelistet', 'Verkauft', 'Verfügbar',
      'Einkauf/Stück', 'Einkaufsversand', 'Sonstige Einkaufskosten', 'Einkauf gesamt/Stück',
      'Geplanter Verkauf', 'Erwarteter Gewinn/Stück',
      'Umsatz', 'Verkaufskosten', 'Tatsächlicher Gewinn', 'Marge %', 'ROI %',
      'Kapital im Bestand', 'Importiert', 'Gelistet am', 'Verkauft am', 'Listing-URL', 'Amazon-URL',
    ];

    const rows: (string | number | undefined)[][] = [header];

    for (const p of products) {
      const stock = stockOf(p, sales);
      const productSales = sales.filter((s) => s.productId === p.id);
      const breakdowns = productSales.map((s) => calculateSaleProfit(p, s));
      const revenue = breakdowns.reduce((n, b) => n + b.revenue, 0);
      const saleCosts = breakdowns.reduce((n, b) => n + b.totalSaleCosts, 0);
      const profit = breakdowns.reduce((n, b) => n + b.profit, 0);
      const purchaseCost = breakdowns.reduce((n, b) => n + b.totalPurchaseCost, 0);
      const expected = calculateExpectedProfit(p);
      const listing = listings.find((l) => l.productId === p.id && l.url);

      rows.push([
        p.title,
        p.brand,
        p.asin,
        p.ean,
        PRODUCT_STATUS_META[p.status].label,
        platformLabel(p.platform),
        stock.total,
        stock.listed,
        stock.sold,
        stock.available,
        csvNumber(p.purchasePrice),
        csvNumber(p.purchaseShipping),
        csvNumber(p.purchaseOtherCosts),
        csvNumber(p.purchasePrice + p.purchaseShipping + p.purchaseOtherCosts),
        csvNumber(p.plannedSalePrice),
        csvNumber(expected?.profit),
        productSales.length ? csvNumber(revenue) : '',
        productSales.length ? csvNumber(saleCosts) : '',
        productSales.length ? csvNumber(profit) : '',
        productSales.length && revenue > 0 ? csvNumber((profit / revenue) * 100) : '',
        productSales.length && purchaseCost > 0 ? csvNumber((profit / purchaseCost) * 100) : '',
        csvNumber(stock.capital),
        p.importedAt.slice(0, 10),
        p.listedAt?.slice(0, 10),
        p.soldAt?.slice(0, 10),
        listing?.url,
        p.amazonUrl,
      ]);
    }

    return toCsv(rows);
  },

  /** Sales ledger as CSV. */
  salesToCsv(sales: Sale[], products: Product[]): string {
    const byId = new Map(products.map((p) => [p.id, p]));
    const header = [
      'Datum', 'Produkt', 'ASIN', 'Plattform', 'Menge', 'Verkaufspreis',
      'Einkaufskosten', 'Gebühren', 'Versand', 'Verpackung', 'Sonstige',
      'Verkaufskosten gesamt', 'Gewinn', 'Marge %', 'ROI %',
    ];
    const rows: (string | number | undefined)[][] = [header];

    for (const s of [...sales].sort((a, b) => a.saleDate.localeCompare(b.saleDate))) {
      const product = byId.get(s.productId);
      if (!product) continue;
      const b = calculateSaleProfit(product, s);
      rows.push([
        s.saleDate,
        product.title,
        product.asin,
        platformLabel(s.platform),
        s.quantity,
        csvNumber(b.revenue),
        csvNumber(b.totalPurchaseCost),
        csvNumber(b.platformFees),
        csvNumber(b.shippingCost),
        csvNumber(b.packagingCost),
        csvNumber(b.otherCosts),
        csvNumber(b.totalSaleCosts),
        csvNumber(b.profit),
        csvNumber(b.margin),
        csvNumber(b.roi),
      ]);
    }

    return toCsv(rows);
  },

  /** Full JSON export of everything the extension stores. */
  async createBackup(): Promise<BackupFile> {
    const [products, sales, listings, templates, settings] = await Promise.all([
      ProductService.all(),
      SaleService.all(),
      ListingService.all(),
      TemplateService.all(),
      StorageService.get<Partial<Settings>>(STORAGE_KEYS.settings, {}),
    ]);
    return {
      format: 'amazon-willhaben-manager-backup',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      products,
      sales,
      listings,
      templates,
      settings,
    };
  },

  /** Validates a parsed backup before anything is written to storage. */
  validateBackup(data: unknown): { ok: true; backup: BackupFile } | { ok: false; error: string } {
    if (typeof data !== 'object' || data === null) {
      return { ok: false, error: 'Die Datei enthält kein gültiges JSON-Objekt.' };
    }
    const b = data as Partial<BackupFile>;
    if (b.format !== 'amazon-willhaben-manager-backup') {
      return {
        ok: false,
        error: 'Das ist kein Backup dieser Erweiterung (Feld "format" stimmt nicht).',
      };
    }
    if (!Array.isArray(b.products) || !Array.isArray(b.sales)) {
      return { ok: false, error: 'Backup unvollständig: "products" oder "sales" fehlt.' };
    }
    if (typeof b.schemaVersion !== 'number' || b.schemaVersion > SCHEMA_VERSION) {
      return {
        ok: false,
        error: `Das Backup wurde mit einer neueren Version erstellt (Schema ${b.schemaVersion}).`,
      };
    }
    return {
      ok: true,
      backup: {
        format: b.format,
        schemaVersion: b.schemaVersion,
        exportedAt: b.exportedAt ?? new Date().toISOString(),
        products: b.products,
        sales: b.sales,
        listings: Array.isArray(b.listings) ? b.listings : [],
        templates: Array.isArray(b.templates) ? b.templates : [],
        settings: (b.settings as Partial<Settings>) ?? {},
      },
    };
  },

  /**
   * Restores a backup.
   *
   * `mode: 'replace'` overwrites everything; `mode: 'merge'` keeps existing
   * records and only adds entries whose id is not present yet.
   */
  async restoreBackup(backup: BackupFile, mode: 'replace' | 'merge' = 'replace'): Promise<void> {
    if (mode === 'replace') {
      await ProductService.replaceAll(backup.products);
      await SaleService.replaceAll(backup.sales);
      await ListingService.replaceAll(backup.listings);
      await TemplateService.replaceAll(backup.templates);
      await SettingsService.replaceAll(backup.settings);
      return;
    }

    const mergeById = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
      const known = new Set(current.map((x) => x.id));
      return [...current, ...incoming.filter((x) => !known.has(x.id))];
    };

    await ProductService.replaceAll(mergeById(await ProductService.all(), backup.products));
    await SaleService.replaceAll(mergeById(await SaleService.all(), backup.sales));
    await ListingService.replaceAll(mergeById(await ListingService.all(), backup.listings));
    await TemplateService.replaceAll(mergeById(await TemplateService.all(), backup.templates));
  },
};

/** Triggers a browser download for generated text content. */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has definitely started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
