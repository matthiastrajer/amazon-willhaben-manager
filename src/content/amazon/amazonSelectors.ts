/**
 * Central Amazon selector catalogue.
 *
 * Every field lists several candidates in descending order of stability. The
 * extractor walks the list and takes the first candidate that yields a usable
 * value, so a single markup change on Amazon's side degrades one field instead
 * of breaking the whole extraction.
 *
 * Preference order across the extractor as a whole:
 *   1. JSON-LD / structured data   (markup-independent)
 *   2. meta tags                    (markup-independent)
 *   3. long-lived element ids       (#productTitle, #landingImage, …)
 *   4. attribute-based selectors    (data-* hooks)
 *   5. broad fallbacks              (lowest confidence)
 */

export interface SelectorGroup {
  /** Selectors in descending order of confidence. */
  selectors: string[];
  /** Confidence attributed to a value found via this group. */
  confidence: 'high' | 'medium' | 'low';
}

export const AMAZON_SELECTORS = {
  title: {
    selectors: ['#productTitle', '#title #productTitle', 'h1#title span', 'h1.product-title-word-break'],
    confidence: 'high',
  } satisfies SelectorGroup,

  /**
   * Price. The `.a-offscreen` span holds the fully formatted price string that
   * Amazon renders visually as separate whole/fraction spans.
   */
  price: {
    selectors: [
      '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
      '#corePriceDisplay_desktop_feature_div span.a-price[data-a-color="base"] .a-offscreen',
      '#corePrice_feature_div .priceToPay .a-offscreen',
      '#corePrice_feature_div .a-price .a-offscreen',
      '#apex_desktop .priceToPay .a-offscreen',
      '#apex_desktop .a-price .a-offscreen',
      '#price_inside_buybox',
      '#newBuyBoxPrice',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#priceblock_saleprice',
      '#corePriceDisplay_mobile_feature_div .a-price .a-offscreen',
      '#buybox .a-price .a-offscreen',
      '.a-price .a-offscreen',
    ],
    confidence: 'high',
  } satisfies SelectorGroup,

  /** Strike-through list price / UVP. */
  listPrice: {
    selectors: [
      '#corePriceDisplay_desktop_feature_div .basisPrice .a-offscreen',
      '#corePriceDisplay_desktop_feature_div span[data-a-strike="true"] .a-offscreen',
      '#corePrice_feature_div span[data-a-strike="true"] .a-offscreen',
      'span.a-price.a-text-price[data-a-strike="true"] .a-offscreen',
      '#listPrice',
      '.priceBlockStrikePriceString',
    ],
    confidence: 'medium',
  } satisfies SelectorGroup,

  mainImage: {
    selectors: ['#landingImage', '#imgTagWrapperId img', '#main-image-container img', '#imgBlkFront', '#ebooksImgBlkFront'],
    confidence: 'high',
  } satisfies SelectorGroup,

  thumbnails: {
    selectors: [
      '#altImages li.imageThumbnail img',
      '#altImages li.item img',
      '#imageBlockThumbs img',
      '#main-image-container li img',
    ],
    confidence: 'medium',
  } satisfies SelectorGroup,

  brand: {
    selectors: [
      '#bylineInfo',
      'a#brand',
      '#brand',
      'tr.po-brand td.a-span9 span',
      '#productOverview_feature_div tr:first-child td:last-child span',
    ],
    confidence: 'medium',
  } satisfies SelectorGroup,

  bulletPoints: {
    selectors: [
      '#feature-bullets ul li:not(.aok-hidden) span.a-list-item',
      '#feature-bullets ul li span.a-list-item',
      '#productFactsDesktopExpander ul li span.a-list-item',
      '#productOverview_feature_div + div ul li span.a-list-item',
    ],
    confidence: 'high',
  } satisfies SelectorGroup,

  description: {
    selectors: [
      '#productDescription',
      '#bookDescription_feature_div',
      '#aplus_feature_div',
      '#aplus',
      '#productDescription_feature_div',
    ],
    confidence: 'medium',
  } satisfies SelectorGroup,

  asinInput: {
    selectors: ['#ASIN', 'input[name="ASIN"]', 'input#asin', 'input[name="ASIN.0"]'],
    confidence: 'high',
  } satisfies SelectorGroup,

  breadcrumbs: {
    selectors: [
      '#wayfinding-breadcrumbs_feature_div ul li a',
      '#wayfinding-breadcrumbs_container ul li a',
      '.a-breadcrumb li a',
    ],
    confidence: 'high',
  } satisfies SelectorGroup,

  availability: {
    selectors: [
      '#availability span',
      '#availability',
      '#outOfStock .a-color-price',
      '#exports_desktop_outOfStock_buybox_message_feature_div',
    ],
    confidence: 'medium',
  } satisfies SelectorGroup,

  seller: {
    selectors: [
      '#sellerProfileTriggerId',
      '#merchant-info a',
      '#merchant-info',
      '#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Verkäufer"] span',
      '#tabular-buybox .tabular-buybox-text[tabular-attribute-name="Sold by"] span',
    ],
    confidence: 'low',
  } satisfies SelectorGroup,

  colorSelection: {
    selectors: [
      '#variation_color_name .selection',
      '#variation_color_name .a-dropdown-prompt',
      'tr.po-color td.a-span9 span',
    ],
    confidence: 'medium',
  } satisfies SelectorGroup,

  sizeSelection: {
    selectors: [
      '#variation_size_name .selection',
      '#variation_size_name .a-dropdown-prompt',
      'tr.po-size td.a-span9 span',
    ],
    confidence: 'medium',
  } satisfies SelectorGroup,

  /** Tables holding the "Produktinformation" / "Technische Details" rows. */
  detailTables: {
    selectors: [
      '#productDetails_techSpec_section_1 tr',
      '#productDetails_techSpec_section_2 tr',
      '#productDetails_detailBullets_sections1 tr',
      '#technicalSpecifications_section_1 tr',
      '#productOverview_feature_div tr',
      '#prodDetails tr',
    ],
    confidence: 'medium',
  } satisfies SelectorGroup,

  /** Bullet-style detail list used on many pages instead of a table. */
  detailBullets: {
    selectors: ['#detailBullets_feature_div li', '#detailBulletsWrapper_feature_div li'],
    confidence: 'medium',
  } satisfies SelectorGroup,
} as const;

/** Marks a page as a product detail page rather than search/category/cart. */
export const PRODUCT_PAGE_MARKERS = [
  '#productTitle',
  '#dp-container',
  '#dp',
  '#ppd',
  '#centerCol',
];

/** URL path fragments that identify a product detail page. */
export const PRODUCT_URL_PATTERNS = [
  /\/dp\/[A-Z0-9]{10}/i,
  /\/gp\/product\/[A-Z0-9]{10}/i,
  /\/gp\/aw\/d\/[A-Z0-9]{10}/i,
  /\/product\/[A-Z0-9]{10}/i,
];

/**
 * Row labels for the detail tables, per field. Matching is done on a normalised
 * label so both the German and English marketplaces work.
 */
export const DETAIL_LABELS = {
  ean: ['ean', 'ean upc', 'gtin', 'gtin13', 'upc', 'isbn', 'isbn 13'],
  brand: ['marke', 'brand', 'hersteller', 'manufacturer'],
  color: ['farbe', 'colour', 'color'],
  size: ['grosse', 'groesse', 'size', 'abmessungen', 'produktabmessungen'],
  weight: [
    'artikelgewicht',
    'produktgewicht',
    'gewicht',
    'item weight',
    'product weight',
    'package weight',
  ],
  asin: ['asin'],
  model: ['modellnummer', 'artikelmodellnummer', 'item model number'],
} as const;
