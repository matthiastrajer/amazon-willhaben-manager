import type { Product } from '@/core/models/Product';
import type { Settings } from '@/core/models/Settings';
import type { FieldFillResult } from '@/shared/types';
import type { PlatformFormConfig } from '@/content/shared/fieldProfiles';
import { buildListingValues } from '@/content/shared/listingValues';
import { fillListingForm, type FillOptions } from '@/content/shared/formFiller';
import { WILLHABEN_CONFIG } from '@/content/willhaben/willhabenConfig';
import { EBAY_CONFIG } from '@/content/ebay/ebayConfig';

/**
 * Composes the two production steps — build the values, then write them — so the
 * tests exercise exactly the path the content script takes.
 */
export function fillFormFor(
  config: PlatformFormConfig,
  product: Product,
  settings: Settings,
  options: FillOptions = {},
): Promise<FieldFillResult[]> {
  return fillListingForm(config, buildListingValues(config, product, settings), options);
}

export const fillWillhabenForm = (
  product: Product,
  settings: Settings,
  options: FillOptions = {},
) => fillFormFor(WILLHABEN_CONFIG, product, settings, options);

export const fillEbayForm = (product: Product, settings: Settings, options: FillOptions = {}) =>
  fillFormFor(EBAY_CONFIG, product, settings, options);
