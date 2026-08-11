import { useMemo, useState } from 'react';
import { ExternalLink, Plus, Search } from 'lucide-react';
import type { Store } from '@/ui/useStore';
import {
  PRODUCT_STATUS_META,
  PRODUCT_STATUS_ORDER,
  type Product,
  type ProductStatus,
} from '@/core/models/Product';
import { EmptyState, Money, Percent, Segmented, Stat, StatusBadge } from '@/ui/components';
import { calculateExpectedProfit, calculateSaleProfit } from '@/core/services/ProfitCalculator';
import { stockOf, totalCapital } from '@/core/services/InventoryService';
import { formatCurrency, formatDate } from '@/core/utils/format';
import { normalizeKey } from '@/core/utils/text';
import { platformLabel } from '@/shared/constants';
import { ProductForm } from '../components/ProductForm';
import { ExportService, downloadTextFile } from '@/core/services/ExportService';
import { todayISODate } from '@/core/utils/format';

type ViewMode = 'cards' | 'table';
type SortKey = 'newest' | 'oldest' | 'profit-desc' | 'profit-asc' | 'purchase-desc' | 'sale-desc';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'Neueste' },
  { value: 'oldest', label: 'Älteste' },
  { value: 'profit-desc', label: 'Höchster Gewinn' },
  { value: 'profit-asc', label: 'Niedrigster Gewinn' },
  { value: 'purchase-desc', label: 'Höchster Einkaufspreis' },
  { value: 'sale-desc', label: 'Höchster Verkaufspreis' },
];

/** Realised profit of a product, or the expected profit when nothing sold yet. */
function profitOf(product: Product, store: Store): { value: number; realised: boolean } {
  const sales = store.sales.filter((s) => s.productId === product.id);
  if (sales.length) {
    return {
      value: sales.reduce((sum, s) => sum + calculateSaleProfit(product, s).profit, 0),
      realised: true,
    };
  }
  const expected = calculateExpectedProfit(product);
  return { value: expected?.profit ?? 0, realised: false };
}

export function Products({
  store,
  navigate,
  initialStatus,
  title = 'Produkte',
}: {
  store: Store;
  navigate: (route: string) => void;
  initialStatus?: ProductStatus;
  title?: string;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ProductStatus | 'ALL'>(initialStatus ?? 'ALL');
  const [view, setView] = useState<ViewMode>('cards');
  const [sort, setSort] = useState<SortKey>('newest');
  const [platform, setPlatform] = useState<string>('ALL');
  const [showAdd, setShowAdd] = useState(false);

  const currency = store.settings.currency;

  const filtered = useMemo(() => {
    const q = normalizeKey(query);
    const listingsByProduct = new Map<string, string>();
    for (const l of store.listings) {
      if (l.url) listingsByProduct.set(l.productId, `${l.url} ${l.externalId ?? ''}`);
    }

    let list = store.products.filter((p) => {
      if (status !== 'ALL' && p.status !== status) return false;
      if (platform !== 'ALL' && p.platform !== platform) return false;
      if (!q) return true;
      const haystack = normalizeKey(
        [
          p.title,
          p.brand,
          p.asin,
          p.ean,
          p.gtin,
          p.category,
          p.subcategory,
          p.notes,
          listingsByProduct.get(p.id),
        ]
          .filter(Boolean)
          .join(' '),
      );
      return haystack.includes(q);
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.importedAt.localeCompare(b.importedAt);
        case 'profit-desc':
          return profitOf(b, store).value - profitOf(a, store).value;
        case 'profit-asc':
          return profitOf(a, store).value - profitOf(b, store).value;
        case 'purchase-desc':
          return b.purchasePrice - a.purchasePrice;
        case 'sale-desc':
          return (b.plannedSalePrice ?? 0) - (a.plannedSalePrice ?? 0);
        case 'newest':
        default:
          return b.importedAt.localeCompare(a.importedAt);
      }
    });

    return list;
  }, [store, query, status, platform, sort]);

  const summary = useMemo(() => {
    const active = store.products.filter((p) => p.status !== 'CANCELLED');
    const realisedProfit = store.sales.reduce((sum, sale) => {
      const product = store.products.find((p) => p.id === sale.productId);
      return product ? sum + calculateSaleProfit(product, sale).profit : sum;
    }, 0);
    return {
      total: active.length,
      listed: active.filter((p) => p.status === 'LISTED').length,
      sold: active.filter((p) => p.status === 'SOLD').length,
      profit: realisedProfit,
      capital: totalCapital(store.products, store.sales),
    };
  }, [store.products, store.sales]);

  const statusFilters: (ProductStatus | 'ALL')[] = ['ALL', ...PRODUCT_STATUS_ORDER];

  const exportCsv = () => {
    downloadTextFile(
      `produkte-${todayISODate()}.csv`,
      ExportService.productsToCsv(filtered, store.sales, store.listings),
      'text/csv',
    );
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>{title}</h1>
          <div className="sub">
            {filtered.length} von {store.products.length} Produkten
          </div>
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={exportCsv} disabled={filtered.length === 0}>
            CSV exportieren
          </button>
          <button className="btn btn-primary" type="button" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Produkt hinzufügen
          </button>
        </div>
      </div>

      <div className="page">
        <div className="grid grid-4">
          <Stat label="Produkte" value={summary.total} />
          <Stat label="Gelistet" value={summary.listed} />
          <Stat label="Verkauft" value={summary.sold} />
          <Stat
            label="Gewinn"
            value={<Money value={summary.profit} currency={currency} signed />}
            tone={summary.profit >= 0 ? 'pos' : 'neg'}
          />
          <Stat label="Kapital im Bestand" value={<Money value={summary.capital} currency={currency} />} />
        </div>

        <div className="toolbar">
          <div className="search">
            <Search size={15} />
            <input
              className="input"
              type="search"
              placeholder="Produkte suchen (Name, ASIN, EAN, Marke, Willhaben-URL …)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'cards', label: 'Karten' },
              { value: 'table', label: 'Tabelle' },
            ]}
          />
          <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ width: 'auto' }}
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="ALL">Alle Plattformen</option>
            {[...new Set(store.products.map((p) => p.platform))].map((p) => (
              <option key={p} value={p}>
                {platformLabel(p)}
              </option>
            ))}
          </select>
        </div>

        <div className="filters">
          {statusFilters.map((s) => (
            <button
              key={s}
              type="button"
              className={status === s ? 'active' : ''}
              onClick={() => setStatus(s)}
            >
              {s === 'ALL' ? 'Alle' : PRODUCT_STATUS_META[s].label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              title={store.products.length === 0 ? 'Noch keine Produkte' : 'Keine Treffer'}
              action={
                store.products.length === 0 ? (
                  <button className="btn btn-primary" type="button" onClick={() => setShowAdd(true)}>
                    <Plus size={14} /> Produkt hinzufügen
                  </button>
                ) : (
                  <button className="btn" type="button" onClick={() => { setQuery(''); setStatus('ALL'); setPlatform('ALL'); }}>
                    Filter zurücksetzen
                  </button>
                )
              }
            >
              {store.products.length === 0
                ? 'Öffne ein Amazon-Produkt und klicke im Popup auf „Produkt analysieren“, oder lege ein Produkt manuell an.'
                : 'Für diese Filterkombination gibt es keine Produkte.'}
            </EmptyState>
          </div>
        ) : view === 'cards' ? (
          <div className="product-grid">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} store={store} navigate={navigate} />
            ))}
          </div>
        ) : (
          <ProductTable products={filtered} store={store} navigate={navigate} />
        )}
      </div>

      {showAdd ? (
        <ProductForm
          store={store}
          onClose={() => setShowAdd(false)}
          onSaved={(id) => navigate(`#/products/${id}`)}
        />
      ) : null}
    </>
  );
}

function ProductCard({
  product,
  store,
  navigate,
}: {
  product: Product;
  store: Store;
  navigate: (route: string) => void;
}) {
  const currency = store.settings.currency;
  const stock = stockOf(product, store.sales);
  const profit = profitOf(product, store);
  const listing = store.listings.find((l) => l.productId === product.id && l.url);
  const image = product.selectedImages[0] ?? product.images[0];

  return (
    <article className="product-card">
      <div className="thumb">
        {image ? <img src={image} alt={product.title} loading="lazy" /> : null}
        <StatusBadge status={product.status} />
      </div>
      <div className="body">
        <span className="ptitle">{product.title}</span>
        <dl className="figures">
          <dt>Einkauf</dt>
          <dd>{formatCurrency(product.purchasePrice, currency)}</dd>
          <dt>{profit.realised ? 'Verkauft' : 'Geplant'}</dt>
          <dd>
            {profit.realised
              ? formatCurrency(
                  store.sales
                    .filter((s) => s.productId === product.id)
                    .reduce((sum, s) => sum + s.salePrice, 0),
                  currency,
                )
              : formatCurrency(product.plannedSalePrice, currency)}
          </dd>
          <dt>Bestand</dt>
          <dd>
            {stock.available} / {stock.total}
          </dd>
          <dt>Plattform</dt>
          <dd>{platformLabel(product.platform)}</dd>
        </dl>
        <div className="profit">
          <span className="muted">{profit.realised ? 'Gewinn' : 'Erwarteter Gewinn'}</span>
          <Money value={profit.value} currency={currency} signed colored />
        </div>
      </div>
      <div className="foot">
        <button className="btn btn-sm" type="button" onClick={() => navigate(`#/products/${product.id}`)}>
          Öffnen
        </button>
        {listing?.url ? (
          <a className="btn btn-sm" href={listing.url} target="_blank" rel="noreferrer">
            <ExternalLink size={13} /> Anzeige
          </a>
        ) : null}
      </div>
    </article>
  );
}

function ProductTable({
  products,
  store,
  navigate,
}: {
  products: Product[];
  store: Store;
  navigate: (route: string) => void;
}) {
  const currency = store.settings.currency;

  return (
    <div className="card">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Produkt</th>
              <th>Status</th>
              <th className="num">Einkauf</th>
              <th className="num">Verkauf</th>
              <th className="num">Gewinn</th>
              <th className="num">Marge</th>
              <th className="num">Bestand</th>
              <th>Plattform</th>
              <th className="num">Datum</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const stock = stockOf(p, store.sales);
              const sales = store.sales.filter((s) => s.productId === p.id);
              const realised = sales.map((s) => calculateSaleProfit(p, s));
              const profit = realised.length
                ? realised.reduce((sum, b) => sum + b.profit, 0)
                : (calculateExpectedProfit(p)?.profit ?? undefined);
              const revenue = realised.reduce((sum, b) => sum + b.revenue, 0);
              const margin = realised.length
                ? revenue > 0
                  ? (profit! / revenue) * 100
                  : 0
                : calculateExpectedProfit(p)?.margin;

              return (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`#/products/${p.id}`)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.title.slice(0, 60)}</div>
                    {p.brand || p.asin ? (
                      <div className="muted" style={{ fontSize: 12 }}>
                        {[p.brand, p.asin].filter(Boolean).join(' · ')}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="num">
                    <Money value={p.purchasePrice} currency={currency} />
                  </td>
                  <td className="num">
                    <Money value={realised.length ? revenue : p.plannedSalePrice} currency={currency} />
                  </td>
                  <td className="num">
                    <Money value={profit} currency={currency} signed colored />
                  </td>
                  <td className="num">
                    <Percent value={margin} />
                  </td>
                  <td className="num">
                    {stock.available} / {stock.total}
                  </td>
                  <td>{platformLabel(p.platform)}</td>
                  <td className="num">{formatDate(p.soldAt ?? p.listedAt ?? p.importedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
