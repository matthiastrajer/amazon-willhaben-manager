import { startListingRunner } from '../shared/listingRunner';
import { EBAY_CONFIG } from './ebayConfig';

/** eBay content script — all behaviour lives in the shared runner. */
startListingRunner(EBAY_CONFIG);
