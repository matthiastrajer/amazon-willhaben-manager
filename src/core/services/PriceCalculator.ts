import type { Product } from '@/core/models/Product';
import type { Settings } from '@/core/models/Settings';
import type { Template } from '@/core/models/Template';
import { round2 } from '@/core/utils/format';
import { unitPurchaseCost } from './ProfitCalculator';

export interface PriceRules {
  markupPercent: number;
  markupFixed: number;
  /** When > 0 this wins over the markup rules. */
  targetMargin: number;
  minProfit: number;
  roundPrices: boolean;
}

export interface PriceSuggestion {
  price: number;
  basis: number;
  /** Which rule produced the number, for the explanation shown in the UI. */
  strategy: 'target-margin' | 'markup' | 'min-profit-floor';
  appliedMinProfit: boolean;
  rounded: boolean;
  expectedProfit: number;
  expectedMargin: number;
}

export function rulesFrom(settings: Settings, template?: Template | null): PriceRules {
  return {
    markupPercent: template?.markupPercent ?? settings.defaultMarkupPercent,
    markupFixed: template?.markupFixed ?? settings.defaultMarkupFixed,
    targetMargin: template?.targetMargin ?? settings.targetMargin,
    minProfit: template?.minProfit ?? settings.minProfit,
    roundPrices: settings.roundPrices,
  };
}

/**
 * Rounds up to the next "psychological" price: …,99 below 100 and whole
 * .99 steps above. Always rounds UP so a rounding never eats into the margin.
 */
export function roundToPsychological(value: number): number {
  if (value <= 0) return 0;
  if (value < 1) return round2(Math.ceil(value * 10) / 10);
  const whole = Math.floor(value);
  const candidate = whole + 0.99;
  return round2(candidate >= value ? candidate : whole + 1.99);
}

/**
 * Suggests a sale price from the per-unit purchase cost.
 *
 * Order of rules:
 *   1. target margin, when configured  → price = cost / (1 − margin/100)
 *   2. otherwise percentage + fixed markup
 *   3. the result is then lifted to satisfy the minimum profit
 *   4. optional psychological rounding, which can only raise the price
 *
 * The result is explicitly a suggestion; the user can always overwrite it.
 */
export function calculateSuggestedPrice(
  product: Pick<Product, 'purchasePrice' | 'purchaseShipping' | 'purchaseOtherCosts'>,
  rules: PriceRules,
): PriceSuggestion {
  const cost = unitPurchaseCost(product);

  let price: number;
  let strategy: PriceSuggestion['strategy'];

  if (rules.targetMargin > 0 && rules.targetMargin < 100) {
    price = cost / (1 - rules.targetMargin / 100);
    strategy = 'target-margin';
  } else {
    price = cost * (1 + (rules.markupPercent || 0) / 100) + (rules.markupFixed || 0);
    strategy = 'markup';
  }

  let appliedMinProfit = false;
  const minPrice = cost + (rules.minProfit || 0);
  if (rules.minProfit > 0 && price < minPrice) {
    price = minPrice;
    appliedMinProfit = true;
    strategy = 'min-profit-floor';
  }

  const beforeRounding = round2(price);
  const finalPrice = rules.roundPrices ? roundToPsychological(beforeRounding) : beforeRounding;

  const expectedProfit = round2(finalPrice - cost);
  const expectedMargin = finalPrice > 0 ? round2((expectedProfit / finalPrice) * 100) : 0;

  return {
    price: finalPrice,
    basis: cost,
    strategy,
    appliedMinProfit,
    rounded: rules.roundPrices && finalPrice !== beforeRounding,
    expectedProfit,
    expectedMargin,
  };
}
