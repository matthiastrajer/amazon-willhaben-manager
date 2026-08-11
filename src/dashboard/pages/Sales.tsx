import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Store } from '@/ui/useStore';
import type { Sale } from '@/core/models/Sale';
import { SaleService } from '@/core/services/SaleService';
import { calculateSaleProfit } from '@/core/services/ProfitCalculator';
import { computeStats, PERIOD_LABELS, resolvePeriod, salesInRange, type PeriodId } from '@/core/services/AnalyticsService';
import { stockOf } from '@/core/services/InventoryService';
import { platformLabel } from '@/shared/constants';
import { formatDate, todayISODate } from '@/core/utils/format';
import { normalizeKey } from '@/core/utils/text';
import { Alert, EmptyState, Money, Percent, Stat } from '@/ui/components';
import { SaleDialog } from '../components/SaleDialog';
import { downloadTextFile, ExportService } from '@/core/services/ExportService';

const PERIODS: PeriodId[] = ['all', 'today', 'week', 'month', 'last-month', 'year'];

export function Sales({ store, navigate }: { store: Store; navigate: (route: string) => void }) {
  const [period, setPeriod] = useState<PeriodId>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [error, setError] = useState<string | undefined>();

  const currency = store.settings.currency;
  const productsById = useMemo(() => new Map(store.products.map((p) => [p.id, p])), [store.products]);

  const filtered = useMemo(() => {
    const range = resolvePeriod(period);
    const inPeriod = salesInRange(store.sales, range);
    const q = normalizeKey(query);
    const list = q
      ? inPeriod.filter((s) => {
          const p = productsById.get(s.productId);
          if (!p) return false;
          return normalizeKey([p.title, p.brand, p.asin, s.buyerNote].filter(Boolean).join(' ')).includes(q);
        })
      : inPeriod;
    return [...list].sort(
      (a, b) => b.saleDate.localeCompare(a.saleDate) || b.createdAt.localeCompare(a.createdAt),
    );
  }, [store.sales, period, query, productsById]);

  const stats = useMemo(() => computeStats(filtered, store.products), [filtered, store.products]);

  const sellable = store.products.filter((p) => stockOf(p, store.sales).available > 0);

  const remove = async (sale: Sale) => {
    if (!window.confirm('Diesen Verkauf wirklich löschen? Bestand und Status werden neu berechnet.')) return;
    try {
      await SaleService.remove(sale.id);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Verkäufe</h1>
          <div className="sub">
            {filtered.length} Verkäufe · {PERIOD_LABELS[period]}
          </div>
        </div>
        <div className="actions">
          <button
            className="btn"
            type="button"
            disabled={filtered.length === 0}
            onClick={() =>
              downloadTextFile(
                `verkaeufe-${todayISODate()}.csv`,
                ExportService.salesToCsv(filtered, store.products),
                'text/csv',
              )
            }
          >
            CSV exportieren
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={sellable.length === 0}
            title={sellable.length === 0 ? 'Kein Produkt mit verfügbarem Bestand' : undefined}
            onClick={() => setAdding(true)}
          >
            <Plus size={14} /> Verkauf eintragen
          </button>
        </div>
      </div>

      <div className="page">
        {error ? <Alert tone="err">{error}</Alert> : null}

        <div className="grid grid-4">
          <Stat label="Umsatz" value={<Money value={stats.revenue} currency={currency} />} />
          <Stat
            label="Gewinn"
            value={<Money value={stats.profit} currency={currency} signed />}
            tone={stats.profit >= 0 ? 'pos' : 'neg'}
          />
          <Stat label="Marge" value={<Percent value={stats.margin} />} />
          <Stat label="ROI" value={<Percent value={stats.roi} />} />
          <Stat label="Verkäufe" value={stats.saleCount} hint={`${stats.unitsSold} Stück`} />
          <Stat label="Ø Gewinn" value={<Money value={stats.averageProfit} currency={currency} signed />} />
        </div>

        <div className="toolbar">
          <div className="search">
            <Search size={15} />
            <input
              className="input"
              type="search"
              placeholder="Verkäufe durchsuchen…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="filters">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                className={period === p ? 'active' : ''}
                onClick={() => setPeriod(p)}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          {filtered.length === 0 ? (
            <EmptyState
              title={store.sales.length === 0 ? 'Noch keine Verkäufe' : 'Keine Treffer'}
              action={
                store.sales.length === 0 && sellable.length > 0 ? (
                  <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
                    <Plus size={14} /> Verkauf eintragen
                  </button>
                ) : null
              }
            >
              {store.sales.length === 0
                ? 'Sobald du ein Produkt verkauft hast, trage hier den tatsächlichen Verkaufspreis und die Kosten ein.'
                : 'Für diesen Zeitraum bzw. diese Suche gibt es keine Verkäufe.'}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Produkt</th>
                    <th className="num">Stk.</th>
                    <th className="num">Einkauf</th>
                    <th className="num">Verkauf</th>
                    <th className="num">Kosten</th>
                    <th className="num">Gewinn</th>
                    <th className="num">Marge</th>
                    <th className="num">ROI</th>
                    <th>Plattform</th>
                    <th className="num">Datum</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sale) => {
                    const product = productsById.get(sale.productId);
                    if (!product) return null;
                    const b = calculateSaleProfit(product, sale);
                    return (
                      <tr key={sale.id}>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            style={{ padding: 0, fontWeight: 600 }}
                            onClick={() => navigate(`#/products/${product.id}`)}
                          >
                            {product.title.slice(0, 46)}
                          </button>
                        </td>
                        <td className="num">{sale.quantity}</td>
                        <td className="num">
                          <Money value={b.totalPurchaseCost} currency={currency} />
                        </td>
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
                        <td>{platformLabel(sale.platform)}</td>
                        <td className="num">{formatDate(sale.saleDate)}</td>
                        <td className="num nowrap">
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            title="Bearbeiten"
                            onClick={() => setEditingSale(sale)}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            title="Löschen"
                            onClick={() => void remove(sale)}
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
      </div>

      {adding && sellable[0] ? (
        <SaleDialog
          store={store}
          productId={sellable[0].id}
          allowProductChange
          onClose={() => setAdding(false)}
        />
      ) : null}

      {editingSale ? (
        <SaleDialog
          store={store}
          productId={editingSale.productId}
          sale={editingSale}
          onClose={() => setEditingSale(null)}
        />
      ) : null}
    </>
  );
}
