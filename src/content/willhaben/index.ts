import { startListingRunner } from '../shared/listingRunner';
import { WILLHABEN_CONFIG } from './willhabenConfig';

/** Willhaben content script — all behaviour lives in the shared runner. */
startListingRunner(WILLHABEN_CONFIG);
