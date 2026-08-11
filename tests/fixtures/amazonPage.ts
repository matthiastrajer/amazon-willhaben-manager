/**
 * Mock Amazon product pages.
 *
 * The markup mirrors the container ids and attribute patterns Amazon's product
 * detail pages have used for years (#productTitle, .a-price > .a-offscreen,
 * #landingImage[data-a-dynamic-image], #feature-bullets, #detailBullets_feature_div,
 * the ImageBlockATF inline script and the wayfinding breadcrumb). It is a
 * reduced page, not a copy: only the structures the extractor targets.
 */

export interface MockPageOptions {
  title?: string | null;
  /** og:title, controlled separately so the meta fallback can be exercised. */
  ogTitle?: string | null;
  price?: string | null;
  listPrice?: string | null;
  asin?: string | null;
  brand?: string | null;
  ean?: string | null;
  images?: number;
  bullets?: string[];
  breadcrumb?: string[];
  jsonLd?: boolean;
  inlineImages?: boolean;
  availability?: string | null;
}

const DEFAULT_TITLE =
  'Fitgriff® Zughilfen (gepolstert) für Krafttraining, Bodybuilding, Fitness – Kreuzheben Gurte – Lifting Straps für Frauen und Männer';

const DEFAULTS: Required<MockPageOptions> = {
  title: DEFAULT_TITLE,
  ogTitle: DEFAULT_TITLE,
  price: '9,99 €',
  listPrice: '14,99 €',
  asin: 'B07DFMQZ6H',
  brand: 'Fitgriff',
  ean: '4260576510129',
  images: 6,
  bullets: [
    'MAXIMALER HALT – Die gepolsterten Zughilfen entlasten den Griff bei schweren Sätzen.',
    'GEPOLSTERT – Neoprenpolster schützt die Handgelenke.',
    'UNIVERSELL – Passend für Langhantel, Kurzhantel und Klimmzugstange.',
    'LIEFERUMFANG – 1 Paar Zughilfen.',
  ],
  breadcrumb: ['Sport & Freizeit', 'Fitness & Krafttraining', 'Krafttraining', 'Zughilfen'],
  jsonLd: true,
  inlineImages: true,
  availability: 'Auf Lager',
};

function imageUrl(index: number, size = '_AC_SL1500_'): string {
  return `https://m.media-amazon.com/images/I/71ab${index}cdEfG.${size}.jpg`;
}

function thumbUrl(index: number): string {
  return `https://m.media-amazon.com/images/I/71ab${index}cdEfG._AC_US40_.jpg`;
}

export function buildAmazonPage(options: MockPageOptions = {}): string {
  const o = { ...DEFAULTS, ...options };

  const dynamicImage = JSON.stringify({
    [imageUrl(0, '_AC_SX679_')]: [679, 679],
    [imageUrl(0, '_AC_SL1500_')]: [1500, 1500],
  });

  const thumbs = Array.from({ length: Math.max(0, o.images - 1) }, (_v, i) => i + 1)
    .map(
      (i) =>
        `<li class="imageThumbnail item"><span><img src="${thumbUrl(i)}" alt="Bild ${i + 1}"></span></li>`,
    )
    .join('');

  const inlineScript = o.inlineImages
    ? `<script type="text/javascript">
        P.when('ImageBlockATF').execute(function(A){
          var data = {
            'colorImages': { 'initial': [
              ${Array.from({ length: o.images }, (_v, i) => i)
                .map(
                  (i) =>
                    `{"hiRes":"${imageUrl(i)}","thumb":"${thumbUrl(i)}","large":"${imageUrl(i, '_AC_SX679_')}","variant":"MAIN"}`,
                )
                .join(',')}
            ] }
          };
          A.trigger('P.AboveTheFold');
        });
      </script>`
    : '';

  const jsonLd = o.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: o.title ?? undefined,
        brand: { '@type': 'Brand', name: o.brand ?? undefined },
        gtin13: o.ean ?? undefined,
        description: 'Gepolsterte Zughilfen für Krafttraining und Bodybuilding.',
        offers: {
          '@type': 'Offer',
          price: o.price ? o.price.replace(/[^\d,]/g, '').replace(',', '.') : undefined,
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
        },
      })}</script>`
    : '';

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta property="og:title" content="${o.ogTitle ?? ''}">
  <meta property="og:image" content="${imageUrl(0)}">
  <meta name="description" content="Fitgriff Zughilfen für Krafttraining.">
  <link rel="canonical" href="https://www.amazon.de/dp/${o.asin ?? 'B000000000'}">
  ${jsonLd}
</head>
<body>
  <div id="dp-container">
    <div id="wayfinding-breadcrumbs_feature_div">
      <ul>
        ${o.breadcrumb.map((b) => `<li><a href="#">${b}</a></li>`).join('')}
      </ul>
    </div>

    <div id="ppd">
      <div id="centerCol">
        ${o.title === null ? '' : `<h1 id="title"><span id="productTitle">  ${o.title}  </span></h1>`}
        <div id="bylineInfo_feature_div">
          ${o.brand ? `<a id="bylineInfo" href="/stores/${o.brand}">Besuche den ${o.brand}-Store</a>` : ''}
        </div>

        <div id="corePriceDisplay_desktop_feature_div">
          ${
            o.price === null
              ? ''
              : `<span class="priceToPay"><span class="a-offscreen">${o.price}</span><span aria-hidden="true">${o.price}</span></span>`
          }
          ${
            o.listPrice
              ? `<span class="a-price a-text-price basisPrice" data-a-strike="true"><span class="a-offscreen">${o.listPrice}</span></span>`
              : ''
          }
        </div>

        <div id="availability">${o.availability ? `<span>${o.availability}</span>` : ''}</div>
        <div id="merchant-info">Verkauf durch <a id="sellerProfileTriggerId" href="#">Fitgriff GmbH</a></div>

        <div id="feature-bullets">
          <ul>
            ${o.bullets.map((b) => `<li><span class="a-list-item">${b}</span></li>`).join('')}
          </ul>
        </div>

        <div id="variation_color_name">
          <span class="selection">Schwarz</span>
        </div>
        <div id="variation_size_name">
          <span class="selection">Einheitsgröße</span>
        </div>
      </div>

      <div id="imageBlock">
        <div id="imgTagWrapperId">
          <img id="landingImage"
               src="${imageUrl(0, '_AC_SX679_')}"
               data-old-hires="${imageUrl(0)}"
               data-a-dynamic-image='${dynamicImage}'
               alt="${o.title ?? ''}">
        </div>
        <ul id="altImages">${thumbs}</ul>
        ${inlineScript}
      </div>
    </div>

    ${o.asin === null ? '' : `<input type="hidden" id="ASIN" name="ASIN" value="${o.asin}">`}

    <div id="productDescription">
      <p>Die Fitgriff Zughilfen unterstützen den Griff bei schweren Zugübungen.</p>
    </div>

    <div id="detailBullets_feature_div">
      <ul>
        <li><span class="a-list-item"><span class="a-text-bold">Artikelgewicht&nbsp;:&nbsp;</span><span>110 g</span></span></li>
        <li><span class="a-list-item"><span class="a-text-bold">Farbe&nbsp;:&nbsp;</span><span>Schwarz</span></span></li>
        ${
          o.ean
            ? `<li><span class="a-list-item"><span class="a-text-bold">EAN&nbsp;:&nbsp;</span><span>${o.ean}</span></span></li>`
            : ''
        }
        <li><span class="a-list-item"><span class="a-text-bold">Hersteller&nbsp;:&nbsp;</span><span>${o.brand ?? 'Unbekannt'}</span></span></li>
      </ul>
    </div>

    <table id="productDetails_techSpec_section_1">
      <tr><th>Marke</th><td>${o.brand ?? ''}</td></tr>
      <tr><th>Größe</th><td>Einheitsgröße</td></tr>
      <tr><th>Material</th><td>Baumwolle, Neopren</td></tr>
    </table>
  </div>
</body>
</html>`;
}

/** A search results page — must NOT be detected as a product page. */
export function buildAmazonSearchPage(): string {
  return `<!doctype html>
<html lang="de">
<head><meta charset="utf-8"><title>Amazon.de: zughilfen</title></head>
<body>
  <div class="s-main-slot">
    <div data-asin="B07DFMQZ6H"><a href="/dp/B07DFMQZ6H">Fitgriff Zughilfen</a>
      <span class="a-price"><span class="a-offscreen">9,99 €</span></span>
    </div>
    <div data-asin="B08XYZ1234"><a href="/dp/B08XYZ1234">Andere Zughilfen</a></div>
  </div>
</body>
</html>`;
}

export const AMAZON_PRODUCT_URL = 'https://www.amazon.de/dp/B07DFMQZ6H?ref=sr_1_3&keywords=zughilfen';
export const AMAZON_SEARCH_URL = 'https://www.amazon.de/s?k=zughilfen';
