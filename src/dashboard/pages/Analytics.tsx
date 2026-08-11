import { useMemo, useState } from 'react';
import type { Store } from '@/ui/useStore';
import {
  computeStats,
  monthlySeries,
  PERIOD_LABELS,
  resolvePeriod,
  salesInRange,
  type PeriodId,
} from '@/core/services/AnalyticsService';
import { totalCapital } from '@/core/services/InventoryService';
import { BarChart, EmptyState, Field, Money, Percent, Segmented, Stat, TextInput } from '@/ui/components';
import { formatCurrency, formatNumber } from '@/core/utils/format';

const PERIODS: PeriodId[] = [
  'today',
  'week',
  'month',
  'last-month',
  'year',
  'last-year',
  'all',
  'custom',
];

type Metric = 'profit' | 'revenue' | 'sales' | 'margin';

export function Analytics({ store }: { store: Store }) {
  const [period, setPeriod] = useState<PeriodId>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [metric, setMetric] = useState<Metric>('profit');
  const [monthCount, setMonthCount] = useState(6);

  const currency = store.settings.currency;

  const range = useMemo(
    () => resolvePeriod(period, new Date(), { from: from || undefined, to: to || undefined }),
    [period, from, to],
  );

  const periodSales = useMemo(() => salesInRange(store.sales, range), [store.sales, range]);
  const stats = useMemo(() => computeStats(periodSales, store.products), [periodSales, store.products]);

  const months = useMemo(
    () => monthlySeries(store.sales, store.products, monthCount),
    [store.sales, store.products, monthCount],
  );

  const capital = useMemo(() => totalCapital(store.products, store.sales), [store.products, store.sales]);

  const chartData = months.map((m) => {
    const label = m.label.replace(/(\w+) (\d{4})/, (_all, name: string, year: string) => `${name.slice(0, 3)} ${year.slice(2)}`);
    switch (metric) {
      case 'revenue':
        return { label, value: m.revenue, display: formatCurrency(m.revenue, currency) };
      case 'sales':
        return { label, value: m.saleCount, display: formatNumber(m.saleCount) };
      case 'margin':
        return { label, value: m.margin, display: `${formatNumber(m.margin)} %` };
      case 'profit':
      default:
        return { label, value: m.profit, display: formatCurrency(m.profit, currency) };
    }
  });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Auswertung</h1>
          <div className="sub">
            {PERIOD_LABELS[period]}
            {range.from ? ` · ${range.from} bis ${range.to ?? 'heute'}` : ''}
          </div>
        </div>
      </div>

      <div className="page">
        <div className="toolbar">
          <div className="filters">
            {PERIODS.map((p) => (
              <button key={p} type="button" className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>
          {period === 'custom' ? (
            <div className="row">
              <Field label="Von">
                <TextInput type="date" value={from} onChange={setFrom} />
              </Field>
              <Field label="Bis">
                <TextInput type="date" value={to} onChange={setTo} />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="grid grid-4">
          <Stat label="Umsatz" value={<Money value={stats.revenue} currency={currency} />} />
          <Stat label="Einkaufskosten" value={<Money value={stats.totalPurchaseCost} currency={currency} />} />
          <Stat label="Verkaufskosten" value={<Money value={stats.totalSaleCosts} currency={currency} />} />
          <Stat
            label="Gewinn"
            value={<Money value={stats.profit} currency={currency} signed />}
            tone={stats.profit >= 0 ? 'pos' : 'neg'}
          />
          <Stat label="Marge" value={<Percent value={stats.margin} />} />
          <Stat label="ROI" value={<Percent value={stats.roi} />} />
          <Stat label="Anzahl Verkäufe" value={stats.saleCount} hint={`${stats.unitsSold} Stück`} />
          <Stat label="Ø Gewinn / Verkauf" value={<Money value={stats.averageProfit} currency={currency} signed />} />
        </div>

        <div className="grid grid-3">
          <Stat label="Ø Verkaufspreis" value={<Money value={stats.averageSalePrice} currency={currency} />} />
          <Stat label="Gebundenes Kapital (aktuell)" value={<Money value={capital} currency={currency} />} />
          <Stat
            label="Plattform-Gebühren"
            value={<Money value={stats.platformFees} currency={currency} />}
            hint={`Versand ${formatCurrency(stats.shippingCost, currency)}`}
          />
        </div>

        <section className="card">
          <div className="card-header">
            <span className="card-title">Verlauf</span>
            <div className="row">
              <Segmented
                value={metric}
                onChange={setMetric}
                options={[
                  { value: 'profit', label: 'Gewinn' },
                  { value: 'revenue', label: 'Umsatz' },
                  { value: 'sales', label: 'Verkäufe' },
                  { value: 'margin', label: 'Marge' },
                ]}
              />
              <select
                className="select"
                style={{ width: 'auto' }}
                value={String(monthCount)}
                onChange={(e) => setMonthCount(Number(e.target.value))}
              >
                <option value="3">3 Monate</option>
                <option value="6">6 Monate</option>
                <option value="12">12 Monate</option>
              </select>
            </div>
          </div>
          <div className="card-body">
            {store.sales.length === 0 ? (
              <EmptyState title="Noch keine Daten">
                Der Verlauf füllt sich, sobald Verkäufe erfasst werden.
              </EmptyState>
            ) : (
              <BarChart data={chartData} />
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <span className="card-title">Monatsübersicht</span>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Monat</th>
                    <th className="num">Verkäufe</th>
                    <th className="num">Umsatz</th>
                    <th className="num">Gewinn</th>
                    <th className="num">Marge</th>
                  </tr>
                </thead>
                <tbody>
                  {[...months].reverse().map((m) => (
                    <tr key={m.key}>
                      <td>{m.label}</td>
                      <td className="num">{m.saleCount}</td>
                      <td className="num">
                        <Money value={m.revenue} currency={currency} />
                      </td>
                      <td className="num">
                        <Money value={m.profit} currency={currency} signed colored />
                      </td>
                      <td className="num">
                        <Percent value={m.margin} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
