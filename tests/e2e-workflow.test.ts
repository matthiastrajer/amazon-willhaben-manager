import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { extractAmazonProduct } from '@/content/amazon/amazonExtractor';
import { fillWillhabenForm } from '@/content/willhaben/WillhabenFieldMapper';
import { detectWillhabenPage } from '@/content/willhaben/willhabenDetector';
import { ProductService } from '@/core/services/ProductService';
import { SaleService } from '@/core/services/SaleService';
import { ListingService } from '@/core/services/ListingService';
import { TemplateService } from '@/core/services/TemplateService';
import { SettingsService } from '@/core/services/SettingsService';
import { calculateSuggestedPrice, rulesFrom } from '@/core/services/PriceCalculator';
import { calculateExpectedProfit, calculateSaleProfit } from '@/core/services/ProfitCalculator';
import { computeDashboard } from '@/core/services/AnalyticsService';
import { stockOf } from '@/core/services/InventoryService';
import { findDuplicates, fromExtracted } from '@/core/services/DuplicateService';
import {
  generateListingDescription,
  generateListingTitle,
} from '@/core/services/ListingContentService';
import { AMAZON_PRODUCT_URL, buildAmazonPage } from './fixtures/amazonPage';
import { CREATE_FORM_URL, labelledForm } from './fixtures/willhabenForm';

/**
 * Full lifecycle: Amazon page → product → Willhaben form → listing → sale →
 * profit → dashboard. This walks the exact scenario from the specification and
 * asserts the numbers it prescribes.
 */
describe('end-to-end: Amazon → Willhaben → Verkauf → Dashboard', () => {
  it('runs the complete workflow with the specified figures', async () => {
    const settings = await SettingsService.update({
      defaultMarkupPercent: 100,
      minProfit: 0,
      roundPrices: false,
      defaultPostalCode: '1010',
      defaultLocation: 'Wien',
    });
    await TemplateService.ensureSeeded();

    // ---- step 1: analyse the Amazon page -------------------------------
    const amazonDoc = new JSDOM(buildAmazonPage({ price: '10,00 €', jsonLd: false })).window.document;
    const extraction = extractAmazonProduct(amazonDoc, AMAZON_PRODUCT_URL);

    expect(extraction.ok).toBe(true);
    expect(extraction.product?.price).toBe(10);
    expect(extraction.product?.asin).toBe('B07DFMQZ6H');

    // ---- step 2: nothing imported yet, so no duplicates ----------------
    expect(findDuplicates(fromExtracted(extraction.product!), await ProductService.all())).toEqual([]);

    // ---- step 3: import → DRAFT ----------------------------------------
    const suggestion = calculateSuggestedPrice(
      { purchasePrice: 10, purchaseShipping: 0, purchaseOtherCosts: 0 },
      rulesFrom(settings, null),
    );
    expect(suggestion.price).toBe(20);

    const template = await TemplateService.suggestFor({
      categoryPath: extraction.product!.categoryPath,
      title: extraction.product!.title,
    });
    expect(template?.name).toBe('Standard Fitness');

    let product = await ProductService.createFromExtraction(extraction.product!, settings, {
      purchasePrice: 10,
      plannedSalePrice: 20,
    });
    expect(product.status).toBe('DRAFT');
    expect(product.source).toBe('amazon');
    expect(product.quantity).toBe(1);

    product = (await ProductService.update(product.id, {
      listingTitle: generateListingTitle(product, { template }),
      listingDescription: generateListingDescription(product, { template, settings }),
    }))!;
    expect(product.listingTitle).toContain('Fitgriff');

    // ---- step 4: re-importing the same product is detected -------------
    const dupes = findDuplicates(fromExtracted(extraction.product!), await ProductService.all());
    expect(dupes[0]?.reason).toBe('asin');
    expect(dupes[0]?.confidence).toBe('exact');

    // ---- step 5: prepare Willhaben → READY_TO_LIST ---------------------
    await ListingService.upsertPrepared({
      productId: product.id,
      platform: 'willhaben',
      listedPrice: product.plannedSalePrice,
      title: product.listingTitle,
    });
    product = (await ProductService.setStatus(product.id, 'READY_TO_LIST'))!;
    expect(product.status).toBe('READY_TO_LIST');
    expect(product.preparedAt).toBeTruthy();

    const willhabenDoc = new JSDOM(labelledForm(), { url: CREATE_FORM_URL }).window.document;
    expect(detectWillhabenPage(willhabenDoc, CREATE_FORM_URL).formReady).toBe(true);

    const fillResults = fillWillhabenForm(product, settings, { doc: willhabenDoc });
    expect((willhabenDoc.getElementById('ad-title') as HTMLInputElement).value).toBe(
      product.listingTitle,
    );
    expect((willhabenDoc.getElementById('ad-price') as HTMLInputElement).value).toBe('20');
    expect(fillResults.filter((r) => r.status === 'filled').map((r) => r.field).sort()).toEqual([
      'description',
      'price',
      'title',
    ]);
    // The extension must never claim it published anything.
    expect(product.status).not.toBe('LISTED');

    // ---- step 6: user confirms the ad is online → LISTED ---------------
    const listing = await ListingService.attachUrl(
      product.id,
      'willhaben',
      'https://www.willhaben.at/iad/kaufen-und-verkaufen/d/fitgriff-zughilfen-1234567890/',
    );
    expect(listing.externalId).toBe('1234567890');

    await ProductService.update(product.id, { listedQuantity: 1 });
    product = (await ProductService.setStatus(product.id, 'LISTED'))!;
    expect(product.status).toBe('LISTED');
    expect(product.listedAt).toBeTruthy();

    const expected = calculateExpectedProfit(product)!;
    expect(expected.profit).toBe(10);

    // ---- step 7: record the actual sale --------------------------------
    // Sale 18 €, shipping 4 € → profit 4 €, margin 22,22 %, ROI 40 %.
    const sale = await SaleService.record({
      productId: product.id,
      salePrice: 18,
      shippingCost: 4,
      platformFees: 0,
      packagingCost: 0,
      otherCosts: 0,
      saleDate: '2026-08-14',
    });

    product = (await ProductService.byId(product.id))!;
    expect(product.status).toBe('SOLD');
    expect(product.soldQuantity).toBe(1);
    expect(stockOf(product, await SaleService.all()).available).toBe(0);

    const breakdown = calculateSaleProfit(product, sale);
    expect(breakdown.profit).toBe(4);
    expect(breakdown.margin).toBe(22.22);
    expect(breakdown.roi).toBe(40);

    // ---- step 8: the dashboard reflects it -----------------------------
    const dashboard = computeDashboard(
      await ProductService.all(),
      await SaleService.all(),
      new Date('2026-08-14T12:00:00.000Z'),
    );
    expect(dashboard.allTime.profit).toBe(4);
    expect(dashboard.allTime.revenue).toBe(18);
    expect(dashboard.thisMonth.profit).toBe(4);
    expect(dashboard.soldCount).toBe(1);
    expect(dashboard.listedCount).toBe(0);
    expect(dashboard.capital).toBe(0); // nothing left in stock
    expect(dashboard.unitsInStock).toBe(0);

    // ---- step 9: the history records the whole lifecycle ---------------
    const events = product.history.map((h) => h.event).join(' | ');
    expect(events).toContain('Von Amazon importiert');
    expect(events).toContain('Bereit zum Listen');
    expect(events).toContain('Gelistet');
    expect(events).toContain('Verkauft');
  });

  it('handles multiple units sold at different prices', async () => {
    const settings = await SettingsService.get();
    const amazonDoc = new JSDOM(buildAmazonPage({ price: '9,99 €' })).window.document;
    const extraction = extractAmazonProduct(amazonDoc, AMAZON_PRODUCT_URL);

    const product = await ProductService.createFromExtraction(extraction.product!, settings, {
      purchasePrice: 9.99,
      quantity: 5,
      plannedSalePrice: 19.99,
    });
    await ProductService.update(product.id, { listedQuantity: 5 });
    await ProductService.setStatus(product.id, 'LISTED');

    await SaleService.record({ productId: product.id, salePrice: 19.99, saleDate: '2026-08-01' });
    await SaleService.record({ productId: product.id, salePrice: 17.99, saleDate: '2026-08-05' });
    await SaleService.record({ productId: product.id, salePrice: 18.5, saleDate: '2026-08-09' });

    const current = (await ProductService.byId(product.id))!;
    const sales = await SaleService.all();
    const stock = stockOf(current, sales);

    expect(stock).toMatchObject({ total: 5, sold: 3, available: 2 });
    // Still listed, because two units remain.
    expect(current.status).toBe('LISTED');

    const dashboard = computeDashboard([current], sales, new Date('2026-08-11T12:00:00.000Z'));
    expect(dashboard.allTime.saleCount).toBe(3);
    expect(dashboard.allTime.revenue).toBe(56.48);
    // 3 units bought at 9,99 → 29,97 cost, no sale-side costs.
    expect(dashboard.allTime.profit).toBe(26.51);
    expect(dashboard.capital).toBe(19.98); // 2 units still on hand
  });

  it('keeps working when the Amazon page is only partially readable', async () => {
    const settings = await SettingsService.get();
    const html = buildAmazonPage({
      price: null,
      jsonLd: false,
      ean: null,
      asin: null,
      images: 0,
      inlineImages: false,
      bullets: [],
    });
    const extraction = extractAmazonProduct(new JSDOM(html).window.document, AMAZON_PRODUCT_URL);

    expect(extraction.ok).toBe(true);
    expect(extraction.report.warnings.length).toBeGreaterThan(0);

    // The user supplies what the page did not provide.
    const product = await ProductService.createFromExtraction(extraction.product!, settings, {
      purchasePrice: 12.5,
      plannedSalePrice: 24.99,
    });
    expect(product.purchasePrice).toBe(12.5);
    expect(calculateExpectedProfit(product)!.profit).toBe(12.49);

    // And the Willhaben form still receives everything that is known.
    const willhabenDoc = new JSDOM(labelledForm(), { url: CREATE_FORM_URL }).window.document;
    const results = fillWillhabenForm(product, settings, { doc: willhabenDoc });
    expect(results.find((r) => r.field === 'title')!.status).toBe('filled');
    expect(results.find((r) => r.field === 'price')!.status).toBe('filled');
  });
});
