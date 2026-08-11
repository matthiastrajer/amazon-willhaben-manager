import { describe, expect, it } from 'vitest';
import {
  aggregate,
  calculateExpectedProfit,
  calculateProfit,
  calculateSaleProfit,
  unitPurchaseCost,
} from '@/core/services/ProfitCalculator';
import {
  calculateSuggestedPrice,
  roundToPsychological,
  rulesFrom,
} from '@/core/services/PriceCalculator';
import { DEFAULT_SETTINGS } from '@/core/models/Settings';
import { parseNumber, round2 } from '@/core/utils/format';
import type { Product } from '@/core/models/Product';
import type { Sale } from '@/core/models/Sale';

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    title: 'Testprodukt',
    description: '',
    bulletPoints: [],
    images: [],
    selectedImages: [],
    condition: 'NEU',
    currency: 'EUR',
    purchasePrice: 10,
    purchaseShipping: 0,
    purchaseOtherCosts: 0,
    status: 'DRAFT',
    quantity: 1,
    listedQuantity: 0,
    soldQuantity: 0,
    platform: 'willhaben',
    importedAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    source: 'manual',
    history: [],
    ...overrides,
  };
}

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 's1',
    productId: 'p1',
    quantity: 1,
    salePrice: 18,
    platformFees: 0,
    shippingCost: 4,
    packagingCost: 0,
    otherCosts: 0,
    saleDate: '2026-08-11',
    platform: 'willhaben',
    createdAt: '2026-08-11T10:00:00.000Z',
    ...overrides,
  };
}

describe('number parsing', () => {
  it('handles German, English and bare notations', () => {
    expect(parseNumber('9,99 €')).toBe(9.99);
    expect(parseNumber('1.234,56 €')).toBe(1234.56);
    expect(parseNumber('$1,234.56')).toBe(1234.56);
    expect(parseNumber('1234.56')).toBe(1234.56);
    expect(parseNumber('19')).toBe(19);
    expect(parseNumber('-5,50')).toBe(-5.5);
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('kein Preis')).toBeUndefined();
    expect(parseNumber(undefined)).toBeUndefined();
    expect(parseNumber(12.5)).toBe(12.5);
  });

  it('rounds without floating point drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe('profit calculation', () => {
  it('never reduces to sale price minus Amazon price', () => {
    // Purchase 10 (+2 shipping +1 other), sold for 20 with 3 of sale-side costs.
    const b = calculateProfit(
      { purchasePrice: 10, purchaseShipping: 2, purchaseOtherCosts: 1 },
      20,
      { platformFees: 1, shippingCost: 2 },
    );
    expect(b.totalPurchaseCost).toBe(13);
    expect(b.totalSaleCosts).toBe(3);
    expect(b.profit).toBe(4);
  });

  it('matches the specified end-to-end example', () => {
    // 18 € sale, 10 € purchase, 4 € shipping → 4 € profit, 22,22 %, ROI 40 %.
    const b = calculateSaleProfit(product(), sale());
    expect(b.profit).toBe(4);
    expect(b.margin).toBe(22.22);
    expect(b.roi).toBe(40);
  });

  it('computes margin and ROI for the documented 19,99 example', () => {
    const b = calculateSaleProfit(
      product({ purchasePrice: 9.99 }),
      sale({ salePrice: 19.99, shippingCost: 4.5 }),
    );
    expect(b.profit).toBe(5.5);
    expect(b.margin).toBe(27.51);
    expect(b.roi).toBe(55.06);
  });

  it('handles a loss-making sale', () => {
    const b = calculateSaleProfit(
      product({ purchasePrice: 20 }),
      sale({ salePrice: 12, shippingCost: 5 }),
    );
    expect(b.profit).toBe(-13);
    expect(b.margin).toBeLessThan(0);
    expect(b.roi).toBe(-65);
  });

  it('returns zeroes instead of NaN/Infinity for zero values', () => {
    const b = calculateProfit({ purchasePrice: 0, purchaseShipping: 0, purchaseOtherCosts: 0 }, 0);
    expect(b.profit).toBe(0);
    expect(b.margin).toBe(0);
    expect(b.roi).toBe(0);
    expect(Number.isFinite(b.margin)).toBe(true);
    expect(Number.isFinite(b.roi)).toBe(true);
  });

  it('scales purchase costs with the sold quantity', () => {
    const b = calculateSaleProfit(
      product({ purchasePrice: 10 }),
      sale({ quantity: 3, salePrice: 45, shippingCost: 0 }),
    );
    expect(b.totalPurchaseCost).toBe(30);
    expect(b.profit).toBe(15);
    expect(b.roi).toBe(50);
  });

  it('computes the per-unit acquisition cost', () => {
    expect(
      unitPurchaseCost({ purchasePrice: 9.99, purchaseShipping: 1.5, purchaseOtherCosts: 0.51 }),
    ).toBe(12);
  });

  it('reports an expected profit without sale-side costs', () => {
    const expected = calculateExpectedProfit(product({ plannedSalePrice: 19.99 }))!;
    expect(expected.profit).toBe(9.99);
    expect(expected.totalSaleCosts).toBe(0);
  });

  it('has no expected profit when no sale price is planned', () => {
    expect(calculateExpectedProfit(product())).toBeUndefined();
  });

  it('recomputes margin and ROI when aggregating rather than averaging them', () => {
    const a = calculateProfit({ purchasePrice: 10, purchaseShipping: 0, purchaseOtherCosts: 0 }, 20);
    const b = calculateProfit({ purchasePrice: 5, purchaseShipping: 0, purchaseOtherCosts: 0 }, 30);
    const total = aggregate([a, b]);
    expect(total.revenue).toBe(50);
    expect(total.profit).toBe(35);
    expect(total.totalPurchaseCost).toBe(15);
    expect(total.margin).toBe(70); // 35/50, not the mean of 50 % and 83,33 %
    expect(total.roi).toBe(233.33);
  });
});

describe('price suggestion', () => {
  const rules = rulesFrom(DEFAULT_SETTINGS, null);

  it('applies the percentage markup', () => {
    const s = calculateSuggestedPrice(
      { purchasePrice: 9.99, purchaseShipping: 0, purchaseOtherCosts: 0 },
      { ...rules, markupPercent: 50, minProfit: 0, roundPrices: false },
    );
    expect(s.price).toBe(14.99); // 9.99 * 1.5 = 14.985 → 14.99
    expect(s.strategy).toBe('markup');
  });

  it('includes shipping and other purchase costs in the basis', () => {
    const s = calculateSuggestedPrice(
      { purchasePrice: 10, purchaseShipping: 2, purchaseOtherCosts: 1 },
      { ...rules, markupPercent: 100, minProfit: 0, roundPrices: false },
    );
    expect(s.basis).toBe(13);
    expect(s.price).toBe(26);
  });

  it('honours a target margin over the markup rules', () => {
    const s = calculateSuggestedPrice(
      { purchasePrice: 10, purchaseShipping: 0, purchaseOtherCosts: 0 },
      { ...rules, targetMargin: 50, roundPrices: false, minProfit: 0 },
    );
    expect(s.price).toBe(20);
    expect(s.strategy).toBe('target-margin');
    expect(s.expectedMargin).toBe(50);
  });

  it('lifts the price to satisfy the minimum profit', () => {
    const s = calculateSuggestedPrice(
      { purchasePrice: 10, purchaseShipping: 0, purchaseOtherCosts: 0 },
      { ...rules, markupPercent: 5, minProfit: 5, roundPrices: false },
    );
    expect(s.price).toBe(15);
    expect(s.appliedMinProfit).toBe(true);
    expect(s.strategy).toBe('min-profit-floor');
  });

  it('only ever rounds upwards', () => {
    expect(roundToPsychological(14.2)).toBe(14.99);
    expect(roundToPsychological(14.99)).toBe(14.99);
    expect(roundToPsychological(15.0)).toBe(15.99);
    expect(roundToPsychological(0.5)).toBe(0.5);
    expect(roundToPsychological(0)).toBe(0);
  });

  it('never suggests a price below cost', () => {
    const s = calculateSuggestedPrice(
      { purchasePrice: 25, purchaseShipping: 0, purchaseOtherCosts: 0 },
      { markupPercent: 0, markupFixed: 0, targetMargin: 0, minProfit: 0, roundPrices: true },
    );
    expect(s.price).toBeGreaterThanOrEqual(25);
    expect(s.expectedProfit).toBeGreaterThanOrEqual(0);
  });

  it('takes the rules from a template when one is given', () => {
    const r = rulesFrom(DEFAULT_SETTINGS, {
      id: 't',
      name: 'Fitness',
      condition: 'NEU',
      markupPercent: 80,
      minProfit: 12,
      isDefault: false,
      createdAt: '',
      updatedAt: '',
    });
    expect(r.markupPercent).toBe(80);
    expect(r.minProfit).toBe(12);
  });
});
