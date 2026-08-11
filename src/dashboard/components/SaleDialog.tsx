import { useMemo, useState } from 'react';
import type { Store } from '@/ui/useStore';
import type { Sale } from '@/core/models/Sale';
import { SaleService } from '@/core/services/SaleService';
import { calculateProfit } from '@/core/services/ProfitCalculator';
import { stockOf } from '@/core/services/InventoryService';
import { PLATFORMS } from '@/shared/constants';
import { formatCurrency, todayISODate } from '@/core/utils/format';
import {
  Alert,
  Field,
  Modal,
  Money,
  MoneyInput,
  NumberInput,
  Percent,
  Select,
  TextArea,
  TextInput,
} from '@/ui/components';

/**
 * "Als verkauft markieren" dialog.
 *
 * The actual sale price is always entered by the user — the planned price is
 * only offered as a one-click suggestion, never silently adopted.
 */
export function SaleDialog({
  store,
  productId,
  sale,
  allowProductChange = false,
  onClose,
}: {
  store: Store;
  productId: string;
  sale?: Sale;
  allowProductChange?: boolean;
  onClose: () => void;
}) {
  const editing = !!sale;
  const [selectedId, setSelectedId] = useState(productId);
  const product = store.products.find((p) => p.id === selectedId);

  const [quantity, setQuantity] = useState(sale?.quantity ?? 1);
  const [salePrice, setSalePrice] = useState<number | undefined>(sale?.salePrice);
  const [platformFees, setPlatformFees] = useState<number | undefined>(sale?.platformFees ?? 0);
  const [shippingCost, setShippingCost] = useState<number | undefined>(sale?.shippingCost ?? 0);
  const [packagingCost, setPackagingCost] = useState<number | undefined>(sale?.packagingCost ?? 0);
  const [otherCosts, setOtherCosts] = useState<number | undefined>(sale?.otherCosts ?? 0);
  const [saleDate, setSaleDate] = useState(sale?.saleDate ?? todayISODate());
  const [platform, setPlatform] = useState(sale?.platform ?? product?.platform ?? 'willhaben');
  const [buyerNote, setBuyerNote] = useState(sale?.buyerNote ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const stock = useMemo(
    () => (product ? stockOf(product, store.sales) : null),
    [product, store.sales],
  );

  // When editing, the units of this very sale are still available to it.
  const maxQuantity = stock
    ? Math.max(1, stock.available + (editing ? (sale?.quantity ?? 0) : 0))
    : 1;

  const breakdown = useMemo(() => {
    if (!product) return null;
    return calculateProfit(
      product,
      salePrice ?? 0,
      {
        platformFees: platformFees ?? 0,
        shippingCost: shippingCost ?? 0,
        packagingCost: packagingCost ?? 0,
        otherCosts: otherCosts ?? 0,
      },
      quantity,
    );
  }, [product, salePrice, platformFees, shippingCost, packagingCost, otherCosts, quantity]);

  const submit = async () => {
    if (!product) {
      setError('Bitte ein Produkt auswählen.');
      return;
    }
    if (salePrice === undefined || salePrice <= 0) {
      setError('Bitte den tatsächlichen Verkaufspreis eingeben.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const payload = {
        productId: product.id,
        quantity,
        salePrice,
        platformFees: platformFees ?? 0,
        shippingCost: shippingCost ?? 0,
        packagingCost: packagingCost ?? 0,
        otherCosts: otherCosts ?? 0,
        saleDate,
        platform,
        buyerNote: buyerNote.trim() || undefined,
      };
      if (editing && sale) await SaleService.update(sale.id, payload);
      else await SaleService.record(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const currency = store.settings.currency;
  const sellable = store.products.filter((p) => stockOf(p, store.sales).available > 0);

  return (
    <Modal
      title={editing ? 'Verkauf bearbeiten' : 'Produkt verkauft'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void submit()} disabled={saving}>
            {saving ? <span className="spinner" /> : null}
            Verkauf speichern
          </button>
        </>
      }
    >
      {error ? <Alert tone="err">{error}</Alert> : null}

      {allowProductChange ? (
        <Field label="Produkt">
          <Select
            value={selectedId}
            onChange={(id) => {
              setSelectedId(id);
              const next = store.products.find((p) => p.id === id);
              if (next) {
                setPlatform(next.platform);
                setQuantity(1);
              }
            }}
            options={(sellable.length ? sellable : store.products).map((p) => ({
              value: p.id,
              label: `${p.title.slice(0, 46)} (${stockOf(p, store.sales).available} verfügbar)`,
            }))}
          />
        </Field>
      ) : (
        <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
          <strong>{product?.title}</strong>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Einkauf {formatCurrency(product?.purchasePrice, currency)} / Stück ·{' '}
            {stock?.available ?? 0} verfügbar
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <Field
          label="Tatsächlicher Verkaufspreis *"
          hint={
            product?.plannedSalePrice ? (
              <>
                Geplant war {formatCurrency(product.plannedSalePrice * quantity, currency)}{' '}
                <button
                  className="btn btn-sm btn-ghost"
                  type="button"
                  onClick={() => setSalePrice(product.plannedSalePrice! * quantity)}
                >
                  übernehmen
                </button>
              </>
            ) : (
              'Gesamtbetrag dieses Verkaufs'
            )
          }
        >
          <MoneyInput value={salePrice} onChange={setSalePrice} />
        </Field>
        <Field label="Menge" hint={`Maximal ${maxQuantity} Stück verfügbar`}>
          <NumberInput value={quantity} onChange={setQuantity} min={1} max={maxQuantity} />
        </Field>
      </div>

      <span className="section-title">Verkaufskosten</span>
      <div className="grid grid-2">
        <Field label="Plattform-Gebühren">
          <MoneyInput value={platformFees} onChange={setPlatformFees} />
        </Field>
        <Field label="Versand">
          <MoneyInput value={shippingCost} onChange={setShippingCost} />
        </Field>
        <Field label="Verpackung">
          <MoneyInput value={packagingCost} onChange={setPackagingCost} />
        </Field>
        <Field label="Sonstige Kosten">
          <MoneyInput value={otherCosts} onChange={setOtherCosts} />
        </Field>
      </div>

      <div className="grid grid-2">
        <Field label="Verkaufsdatum">
          <TextInput type="date" value={saleDate} onChange={setSaleDate} />
        </Field>
        <Field label="Plattform">
          <Select
            value={platform}
            onChange={setPlatform}
            options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
          />
        </Field>
      </div>

      <Field label="Notiz zum Verkauf" hint="Optional, nur intern.">
        <TextArea value={buyerNote} onChange={setBuyerNote} rows={2} />
      </Field>

      {breakdown ? (
        <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
          <dl className="kv">
            <dt>Umsatz</dt>
            <dd>
              <Money value={breakdown.revenue} currency={currency} />
            </dd>
            <dt>Einkaufskosten ({breakdown.quantity} × {formatCurrency(breakdown.unitPurchaseCost, currency)})</dt>
            <dd>
              <Money value={-breakdown.totalPurchaseCost} currency={currency} />
            </dd>
            <dt>Verkaufskosten</dt>
            <dd>
              <Money value={-breakdown.totalSaleCosts} currency={currency} />
            </dd>
            <dt className="total">Gewinn</dt>
            <dd className="total">
              <Money value={breakdown.profit} currency={currency} signed colored />
            </dd>
            <dt>Marge</dt>
            <dd>
              <Percent value={breakdown.margin} colored />
            </dd>
            <dt>ROI</dt>
            <dd>
              <Percent value={breakdown.roi} colored />
            </dd>
          </dl>
        </div>
      ) : null}
    </Modal>
  );
}
