import { useMemo, useState } from 'react';
import { ArrowLeft, Archive, ExternalLink, Link2, Pencil, ShoppingCart, Trash2 } from 'lucide-react';
import type { Store } from '@/ui/useStore';
import {
  CONDITION_LABELS,
  PRODUCT_STATUS_META,
  PRODUCT_STATUS_ORDER,
  type ProductStatus,
} from '@/core/models/Product';
import { ProductService } from '@/core/services/ProductService';
import { ListingService } from '@/core/services/ListingService';
import { SaleService } from '@/core/services/SaleService';
import { calculateExpectedProfit, calculateSaleProfit, unitPurchaseCost } from '@/core/services/ProfitCalculator';
import { stockOf } from '@/core/services/InventoryService';
import { sendMessage } from '@/shared/messages';
import { LISTING_STATUS_LABELS } from '@/core/models/Listing';
import { PLATFORMS, platformLabel } from '@/shared/constants';
import { formatDate, formatDateTime } from '@/core/utils/format';
import {
  Alert,
  EmptyState,
  Money,
  Percent,
  Select,
  StatusBadge,
  Stat,
} from '@/ui/components';
import { ProductForm } from '../components/ProductForm';
import { SaleDialog } from '../components/SaleDialog';

/** Marketplaces the extension can actually prefill. */
const SUPPORTED_PLATFORMS = PLATFORMS.filter((p) => p.supported);

export function ProductDetail({
  productId,
  store,
  navigate,
}: {
  productId: string;
  store: Store;
  navigate: (route: string) => void;
}) {
  const product = store.products.find((p) => p.id === productId);
  const [editing, setEditing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [urlDraft, setUrlDraft] = useState('');

  const currency = store.settings.currency;

  const sales = useMemo(
    () =>
      store.sales
        .filter((s) => s.productId === productId)
        .sort((a, b) => b.saleDate.localeCompare(a.saleDate)),
    [store.sales, productId],
  );

  const listings = useMemo(
    () => store.listings.filter((l) => l.productId === productId),
    [store.listings, productId],
  );

  if (!product) {
    return (
      <>
        <div className="topbar">
          <div>
            <h1>Produkt</h1>
          </div>
        </div>
        <div className="page">
          <div className="card">
            <EmptyState
              title="Produkt nicht gefunden"
              action={
                <button className="btn" type="button" onClick={() => navigate('#/products')}>
                  Zum Produktkatalog
                </button>
              }
            >
              Dieses Produkt existiert nicht (mehr).
            </EmptyState>
          </div>
        </div>
      </>
    );
  }

  const stock = stockOf(product, store.sales);
  const unitCost = unitPurchaseCost(product);
  const expected = calculateExpectedProfit(product);
  const realised = sales.map((s) => calculateSaleProfit(product, s));
  const realisedProfit = realised.reduce((sum, b) => sum + b.profit, 0);
  const realisedRevenue = realised.reduce((sum, b) => sum + b.revenue, 0);
  const realisedSaleCosts = realised.reduce((sum, b) => sum + b.totalSaleCosts, 0);
  const realisedPurchase = realised.reduce((sum, b) => sum + b.totalPurchaseCost, 0);

  const images = product.images.length ? product.images : [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleImageSelection = (url: string) => {
    const selected = new Set(product.selectedImages.length ? product.selectedImages : product.images);
    if (selected.has(url)) selected.delete(url);
    else selected.add(url);
    void run(() => ProductService.update(product.id, { selectedImages: [...selected] }));
  };

  const selectedSet = new Set(
    product.selectedImages.length ? product.selectedImages : product.images,
  );

  return (
    <>
      <div className="topbar">
        <div className="row">
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => navigate('#/products')}>
            <ArrowLeft size={15} />
          </button>
          <div>
            <h1>{product.title.slice(0, 70)}</h1>
            <div className="sub">
              {[product.brand, product.asin ? `ASIN ${product.asin}` : null, product.ean ? `EAN ${product.ean}` : null]
                .filter(Boolean)
                .join(' · ') || 'Manuell angelegtes Produkt'}
            </div>
          </div>
        </div>
        <div className="actions">
          {product.amazonUrl ? (
            <a className="btn" href={product.amazonUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Amazon
            </a>
          ) : null}
          {listings
            .filter((l) => l.url)
            .map((l) => (
              <a key={l.id} className="btn" href={l.url} target="_blank" rel="noreferrer">
                <ExternalLink size={14} /> {platformLabel(l.platform)}
              </a>
            ))}
          {SUPPORTED_PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              className="btn"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await sendMessage({
                    type: 'PREPARE_LISTING',
                    productId: product.id,
                    platform: platform.id,
                  });
                })
              }
            >
              → {platform.label} vorbereiten
            </button>
          ))}
          <button className="btn" type="button" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Bearbeiten
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={stock.available <= 0}
            title={stock.available <= 0 ? 'Kein Bestand mehr verfügbar' : undefined}
            onClick={() => setSelling(true)}
          >
            <ShoppingCart size={14} /> Als verkauft markieren
          </button>
        </div>
      </div>

      <div className="page">
        {error ? <Alert tone="err">{error}</Alert> : null}

        {product.status === 'READY_TO_LIST' ? (
          <Alert tone="warn" title="Vorbereitet – noch nicht bestätigt">
            Das Formular wurde vorbereitet. Sobald die Anzeige tatsächlich online ist, bestätige den
            Status „Gelistet“ (im Assistenten auf der Plattform oder direkt hier).
          </Alert>
        ) : null}

        <div className="grid grid-4">
          <Stat label="Status" value={<StatusBadge status={product.status} />} />
          <Stat label="Bestand" value={`${stock.available} / ${stock.total}`} hint={`${stock.listed} gelistet, ${stock.sold} verkauft`} />
          <Stat label="Einkauf gesamt / Stück" value={<Money value={unitCost} currency={currency} />} />
          <Stat
            label={sales.length ? 'Tatsächlicher Gewinn' : 'Erwarteter Gewinn'}
            value={
              <Money
                value={sales.length ? realisedProfit : expected?.profit}
                currency={currency}
                signed
              />
            }
            tone={(sales.length ? realisedProfit : (expected?.profit ?? 0)) >= 0 ? 'pos' : 'neg'}
            hint={sales.length ? `${sales.length} Verkauf/Verkäufe` : 'ohne Verkaufskosten'}
          />
        </div>

        <div className="detail-grid">
          <div className="col">
            <section className="card">
              <div className="card-header">
                <span className="card-title">Bilder</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {selectedSet.size} von {images.length} für die Anzeige ausgewählt
                </span>
              </div>
              <div className="card-body">
                {images.length === 0 ? (
                  <EmptyState title="Keine Bilder">
                    Für dieses Produkt sind keine Bilder hinterlegt. Bild-URLs können über
                    „Bearbeiten“ ergänzt werden.
                  </EmptyState>
                ) : (
                  <div className="gallery">
                    <div className="main-img">
                      <img src={images[Math.min(activeImage, images.length - 1)]} alt={product.title} />
                    </div>
                    <div className="strip">
                      {images.map((url, i) => (
                        <button
                          key={url}
                          type="button"
                          className={selectedSet.has(url) ? 'selected' : ''}
                          onMouseEnter={() => setActiveImage(i)}
                          onClick={() => toggleImageSelection(url)}
                          title={selectedSet.has(url) ? 'Aus Anzeige entfernen' : 'Für Anzeige auswählen'}
                        >
                          <img src={url} alt={`Bild ${i + 1}`} loading="lazy" />
                          {selectedSet.has(url) ? <span className="tick">✓</span> : null}
                        </button>
                      ))}
                    </div>
                    <Alert tone="info">
                      Bilder werden für die Anzeige vorbereitet, aber nicht automatisch hochgeladen –
                      der Datei-Upload muss aus Sicherheitsgründen im Browser selbst erfolgen. Ob
                      fremde Produktbilder weiterverwendet werden dürfen, ist rechtlich gesondert zu
                      prüfen.
                    </Alert>
                  </div>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span className="card-title">Anzeigentext</span>
              </div>
              <div className="card-body col">
                <div>
                  <span className="section-title">Titel</span>
                  <p className="pre">{product.listingTitle || product.title}</p>
                </div>
                <div>
                  <span className="section-title">Beschreibung</span>
                  <p className="pre">
                    {product.listingDescription || product.description || 'Keine Beschreibung hinterlegt.'}
                  </p>
                </div>
                {product.bulletPoints.length ? (
                  <div>
                    <span className="section-title">Merkmale (Amazon)</span>
                    <ul className="bullets">
                      {product.bulletPoints.slice(0, 8).map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {product.notes ? (
                  <div>
                    <span className="section-title">Interne Notizen</span>
                    <p className="pre muted">{product.notes}</p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span className="card-title">Verkäufe</span>
              </div>
              <div className="card-body" style={{ padding: sales.length ? 0 : undefined }}>
                {sales.length === 0 ? (
                  <EmptyState title="Noch kein Verkauf erfasst">
                    Sobald das Produkt verkauft wurde, trage den tatsächlichen Verkaufspreis ein.
                  </EmptyState>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th className="num">Stk.</th>
                          <th className="num">Verkauf</th>
                          <th className="num">Kosten</th>
                          <th className="num">Gewinn</th>
                          <th className="num">Marge</th>
                          <th className="num">ROI</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {sales.map((sale, i) => {
                          const b = realised[i]!;
                          return (
                            <tr key={sale.id}>
                              <td>{formatDate(sale.saleDate)}</td>
                              <td className="num">{sale.quantity}</td>
                              <td className="num">
                                <Money value={b.revenue} currency={currency} />
                              </td>
                              <td className="num">
                                <Money value={b.totalSaleCosts} currency={currency} />
                              </td>
                              <td className="num">
                                <Money value={b.profit} currency={currency} signed colored />
                              </td>
                              <td className="num">
                                <Percent value={b.margin} />
                              </td>
                              <td className="num">
                                <Percent value={b.roi} />
                              </td>
                              <td className="num">
                                <button
                                  className="btn btn-sm btn-ghost"
                                  type="button"
                                  disabled={busy}
                                  title="Verkauf löschen"
                                  onClick={() => {
                                    if (window.confirm('Diesen Verkauf wirklich löschen?')) {
                                      void run(() => SaleService.remove(sale.id));
                                    }
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span className="card-title">Verlauf</span>
              </div>
              <div className="card-body">
                <div className="timeline">
                  {[...product.history].reverse().map((entry, i) => (
                    <div className="entry" key={`${entry.at}-${i}`}>
                      <span className="when">{formatDateTime(entry.at)}</span>
                      <span className="what">
                        <strong>{entry.event}</strong>
                        {entry.detail ? <span>{entry.detail}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <div className="col">
            <section className="card">
              <div className="card-header">
                <span className="card-title">Einkauf</span>
              </div>
              <div className="card-body">
                <dl className="kv">
                  <dt>Einkaufspreis</dt>
                  <dd>
                    <Money value={product.purchasePrice} currency={currency} />
                  </dd>
                  <dt>Einkaufsversand</dt>
                  <dd>
                    <Money value={product.purchaseShipping} currency={currency} />
                  </dd>
                  <dt>Sonstige Kosten</dt>
                  <dd>
                    <Money value={product.purchaseOtherCosts} currency={currency} />
                  </dd>
                  <dt className="total">Gesamt / Stück</dt>
                  <dd className="total">
                    <Money value={unitCost} currency={currency} />
                  </dd>
                  {product.amazonPrice !== undefined ? (
                    <>
                      <dt>Amazon-Preis bei Import</dt>
                      <dd>
                        <Money value={product.amazonPrice} currency={currency} />
                      </dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span className="card-title">Verkauf</span>
              </div>
              <div className="card-body">
                <dl className="kv">
                  <dt>Geplanter Verkauf</dt>
                  <dd>
                    <Money value={product.plannedSalePrice} currency={currency} />
                  </dd>
                  <dt>Erwarteter Gewinn / Stück</dt>
                  <dd>
                    <Money value={expected?.profit} currency={currency} signed colored />
                  </dd>
                  <dt>Erwartete Marge</dt>
                  <dd>
                    <Percent value={expected?.margin} />
                  </dd>
                  <dt className="total">Tatsächlicher Umsatz</dt>
                  <dd className="total">
                    <Money value={sales.length ? realisedRevenue : undefined} currency={currency} />
                  </dd>
                  <dt>Einkaufskosten (verkauft)</dt>
                  <dd>
                    <Money value={sales.length ? realisedPurchase : undefined} currency={currency} />
                  </dd>
                  <dt>Verkaufskosten</dt>
                  <dd>
                    <Money value={sales.length ? realisedSaleCosts : undefined} currency={currency} />
                  </dd>
                  <dt className="total">Tatsächlicher Gewinn</dt>
                  <dd className="total">
                    <Money
                      value={sales.length ? realisedProfit : undefined}
                      currency={currency}
                      signed
                      colored
                    />
                  </dd>
                  <dt>ROI</dt>
                  <dd>
                    <Percent
                      value={
                        sales.length && realisedPurchase > 0
                          ? (realisedProfit / realisedPurchase) * 100
                          : undefined
                      }
                    />
                  </dd>
                </dl>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span className="card-title">Status & Listing</span>
              </div>
              <div className="card-body col">
                <label className="field">
                  <span className="field-label">Status ändern</span>
                  <Select
                    value={product.status}
                    onChange={(next: ProductStatus) =>
                      void run(() => ProductService.setStatus(product.id, next, 'Manuell geändert'))
                    }
                    options={PRODUCT_STATUS_ORDER.map((s) => ({
                      value: s,
                      label: PRODUCT_STATUS_META[s].label,
                    }))}
                  />
                  <span className="field-hint">{PRODUCT_STATUS_META[product.status].description}</span>
                </label>

                {listings.length ? (
                  <div className="col" style={{ gap: 'var(--space-2)' }}>
                    <span className="section-title">Anzeigen</span>
                    {listings.map((l) => (
                      <div key={l.id} className="row-between" style={{ fontSize: 13 }}>
                        <span>
                          {platformLabel(l.platform)} · {LISTING_STATUS_LABELS[l.status]}
                          {l.externalId ? <span className="muted"> · ID {l.externalId}</span> : null}
                        </span>
                        {l.url ? (
                          <a href={l.url} target="_blank" rel="noreferrer">
                            öffnen
                          </a>
                        ) : (
                          <span className="muted">keine URL</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                <label className="field">
                  <span className="field-label">Willhaben-URL eintragen</span>
                  <input
                    className="input"
                    type="url"
                    placeholder="https://www.willhaben.at/iad/kaufen-und-verkaufen/d/…"
                    value={urlDraft}
                    onChange={(e) => setUrlDraft(e.target.value)}
                  />
                  <span className="field-hint">
                    Wird die Anzeige im Browser geöffnet, erkennt die Erweiterung die URL meist selbst.
                  </span>
                </label>
                <button
                  className="btn"
                  type="button"
                  disabled={busy || !urlDraft.trim()}
                  onClick={() =>
                    void run(async () => {
                      await ListingService.attachUrl(product.id, product.platform, urlDraft.trim(), 'ACTIVE');
                      await ProductService.setStatus(product.id, 'LISTED', urlDraft.trim());
                      setUrlDraft('');
                    })
                  }
                >
                  <Link2 size={14} /> URL speichern & als gelistet markieren
                </button>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <span className="card-title">Stammdaten</span>
              </div>
              <div className="card-body">
                <dl className="kv">
                  <dt>Zustand</dt>
                  <dd className="wide">{CONDITION_LABELS[product.condition]}</dd>
                  <dt>Kategorie</dt>
                  <dd className="wide">
                    {[product.category, product.subcategory].filter(Boolean).join(' → ') || '–'}
                  </dd>
                  {product.color ? (
                    <>
                      <dt>Farbe</dt>
                      <dd className="wide">{product.color}</dd>
                    </>
                  ) : null}
                  {product.size ? (
                    <>
                      <dt>Größe</dt>
                      <dd className="wide">{product.size}</dd>
                    </>
                  ) : null}
                  {product.weight ? (
                    <>
                      <dt>Gewicht</dt>
                      <dd className="wide">{product.weight}</dd>
                    </>
                  ) : null}
                  <dt>Herkunft</dt>
                  <dd className="wide">{product.source === 'amazon' ? 'Amazon-Import' : 'Manuell'}</dd>
                  <dt>Importiert</dt>
                  <dd className="wide">{formatDate(product.importedAt)}</dd>
                  {product.listedAt ? (
                    <>
                      <dt>Gelistet</dt>
                      <dd className="wide">{formatDate(product.listedAt)}</dd>
                    </>
                  ) : null}
                  {product.soldAt ? (
                    <>
                      <dt>Verkauft</dt>
                      <dd className="wide">{formatDate(product.soldAt)}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
            </section>

            <div className="row wrap">
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => void run(() => ProductService.setStatus(product.id, 'ARCHIVED', 'Archiviert'))}
              >
                <Archive size={14} /> Archivieren
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      'Produkt inklusive aller erfassten Verkäufe und Anzeigen löschen? Das kann nicht rückgängig gemacht werden.',
                    )
                  ) {
                    void run(async () => {
                      await ProductService.remove(product.id);
                      navigate('#/products');
                    });
                  }
                }}
              >
                <Trash2 size={14} /> Löschen
              </button>
            </div>
          </div>
        </div>
      </div>

      {editing ? (
        <ProductForm store={store} product={product} onClose={() => setEditing(false)} />
      ) : null}

      {selling ? (
        <SaleDialog store={store} productId={product.id} onClose={() => setSelling(false)} />
      ) : null}
    </>
  );
}
