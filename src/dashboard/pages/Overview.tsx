import { useMemo, useState } from 'react';
import { Plus, ShoppingCart, Tag, ExternalLink } from 'lucide-react';
import type { Store } from '@/ui/useStore';
import { BarChart, EmptyState, Money, Percent, Stat, StatusBadge } from '@/ui/components';
import { computeDashboard, monthlySeries } from '@/core/services/AnalyticsService';
import { formatCurrency, formatDate } from '@/core/utils/format';
import { calculateExpectedProfit, calculateSaleProfit } from '@/core/services/ProfitCalculator';
import { ProductForm } from '../components/ProductForm';
import { SaleDialog } from '../components/SaleDialog';
import { AMAZON_DOMAINS } from '@/shared/constants';

export function Overview({
  store,
  navigate,
}: {
  store: Store;
  navigate: (route: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [saleProductId, setSaleProductId] = useState<string | null>(null);

  const stats = useMemo(
    () => computeDashboard(store.products, store.sales),
    [store.products, store.sales],
  );

  const months = useMemo(
    () => monthlySeries(store.sales, store.products, 6),
    [store.sales, store.products],
  );

  const recentSales = useMemo(
    () =>
      [...store.sales]
        .sort((a, b) => b.saleDate.localeCompare(a.saleDate) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [store.sales],
  );

  const sellable = useMemo(
    () =>
      store.products.filter(
        (p) => p.status === 'LISTED' || p.status === 'READY_TO_LIST' || p.status === 'DRAFT',
      ),
    [store.products],
  );

  const productsById = useMemo(
    () => new Map(store.products.map((p) => [p.id, p])),
    [store.products],
  );

  const currency = store.settings.currency;
  const amazonHome = `https://${AMAZON_DOMAINS[0].host}`;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Dashboard</h1>
          <div className="sub">Überblick über Bestand, Verkäufe und Gewinn</div>
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Produkt hinzufügen
          </button>
          <button
            className="btn"
            type="button"
            disabled={sellable.length === 0}
            onClick={() => setSaleProductId(sellable[0]!.id)}
          >
            <ShoppingCart size={14} /> Verkauf eintragen
          </button>
          <button className="btn" type="button" onClick={() => navigate('#/listed')}>
            <Tag size={14} /> Gelistete Produkte
          </button>
          <a className="btn" href={amazonHome} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Amazon öffnen
          </a>
        </div>
      </div>

      <div className="page">
        <div className="grid grid-3">
          <Stat
            label="Gesamtgewinn"
            value={<Money value={stats.allTime.profit} currency={currency} signed />}
            tone={stats.allTime.profit >= 0 ? 'pos' : 'neg'}
            hint={`${stats.allTime.saleCount} Verkäufe`}
          />
          <Stat
            label="Gewinn diesen Monat"
            value={<Money value={stats.thisMonth.profit} currency={currency} signed />}
            tone={stats.thisMonth.profit >= 0 ? 'pos' : 'neg'}
            hint={`${stats.thisMonth.saleCount} Verkäufe`}
          />
          <Stat
            label="Gesamtumsatz"
            value={<Money value={stats.allTime.revenue} currency={currency} />}
            hint={`Einkauf ${formatCurrency(stats.allTime.totalPurchaseCost, currency)}`}
          />
          <Stat
            label="Kapital im Bestand"
            value={<Money value={stats.capital} currency={currency} />}
            hint={`${stats.unitsInStock} Stück verfügbar`}
          />
        </div>

        <div className="grid grid-4">
          <Stat label="Produkte" value={stats.productCount} hint={`${stats.draftCount} Entwürfe`} />
          <Stat label="Gelistet" value={stats.listedCount} hint={`${stats.readyCount} vorbereitet`} />
          <Stat label="Verkauft" value={stats.soldCount} hint={`${stats.allTime.unitsSold} Stück`} />
          <Stat
            label="Ø Gewinn / Verkauf"
            value={<Money value={stats.allTime.averageProfit} currency={currency} signed />}
          />
          <Stat label="Ø Marge" value={<Percent value={stats.allTime.margin} />} />
          <Stat label="ROI" value={<Percent value={stats.allTime.roi} />} />
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(300px, 1fr)' }}>
          <section className="card">
            <div className="card-header">
              <span className="card-title">Gewinn pro Monat</span>
              <button className="btn btn-sm btn-ghost" type="button" onClick={() => navigate('#/analytics')}>
                Auswertung
              </button>
            </div>
            <div className="card-body">
              {stats.allTime.saleCount === 0 ? (
                <EmptyState title="Noch keine Verkäufe erfasst">
                  Sobald du einen Verkauf einträgst, erscheinen hier Gewinn und Marge pro Monat.
                </EmptyState>
              ) : (
                <BarChart
                  data={months.map((m) => ({
                    label: m.label.replace(/ \d{4}$/, ''),
                    value: m.profit,
                    display: formatCurrency(m.profit, currency),
                  }))}
                />
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <span className="card-title">Letzte Verkäufe</span>
              <button className="btn btn-sm btn-ghost" type="button" onClick={() => navigate('#/sales')}>
                Alle
              </button>
            </div>
            <div className="card-body" style={{ paddingTop: 0, paddingBottom: 0 }}>
              {recentSales.length === 0 ? (
                <EmptyState title="Keine Verkäufe">Noch nichts verkauft.</EmptyState>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {recentSales.map((sale) => {
                        const product = productsById.get(sale.productId);
                        if (!product) return null;
                        const b = calculateSaleProfit(product, sale);
                        return (
                          <tr
                            key={sale.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`#/products/${product.id}`)}
                          >
                            <td>
                              <div style={{ fontWeight: 600 }}>{product.title.slice(0, 34)}</div>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {formatDate(sale.saleDate)}
                              </div>
                            </td>
                            <td className="num">
                              <Money value={b.revenue} currency={currency} />
                            </td>
                            <td className="num">
                              <Money value={b.profit} currency={currency} signed colored />
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
        </div>

        <section className="card">
          <div className="card-header">
            <span className="card-title">Aktive Produkte</span>
            <button className="btn btn-sm btn-ghost" type="button" onClick={() => navigate('#/products')}>
              Produktkatalog
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {sellable.length === 0 ? (
              <EmptyState
                title="Noch keine Produkte"
                action={
                  <button className="btn btn-primary" type="button" onClick={() => setShowAdd(true)}>
                    <Plus size={14} /> Produkt hinzufügen
                  </button>
                }
              >
                Öffne ein Amazon-Produkt und starte im Popup „Produkt analysieren“, oder lege ein
                Produkt manuell an.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Produkt</th>
                      <th>Status</th>
                      <th className="num">Einkauf</th>
                      <th className="num">Geplant</th>
                      <th className="num">Erw. Gewinn</th>
                      <th className="num">Bestand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellable.slice(0, 8).map((p) => {
                      const expected = calculateExpectedProfit(p);
                      return (
                        <tr
                          key={p.id}
                          style={{ cursor: 'pointer' }}
                          onClick={() => navigate(`#/products/${p.id}`)}
                        >
                          <td style={{ fontWeight: 600 }}>{p.title.slice(0, 52)}</td>
                          <td>
                            <StatusBadge status={p.status} />
                          </td>
                          <td className="num">
                            <Money value={p.purchasePrice} currency={currency} />
                          </td>
                          <td className="num">
                            <Money value={p.plannedSalePrice} currency={currency} />
                          </td>
                          <td className="num">
                            <Money value={expected?.profit} currency={currency} signed colored />
                          </td>
                          <td className="num">{Math.max(0, p.quantity - p.soldQuantity)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {showAdd ? (
        <ProductForm
          store={store}
          onClose={() => setShowAdd(false)}
          onSaved={(id) => {
            setShowAdd(false);
            navigate(`#/products/${id}`);
          }}
        />
      ) : null}

      {saleProductId ? (
        <SaleDialog
          store={store}
          productId={saleProductId}
          allowProductChange
          onClose={() => setSaleProductId(null)}
        />
      ) : null}
    </>
  );
}
