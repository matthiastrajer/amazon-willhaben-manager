import { useMemo, useState } from 'react';
import type { Store } from '@/ui/useStore';
import {
  CONDITIONS,
  CONDITION_LABELS,
  PRODUCT_STATUS_META,
  PRODUCT_STATUS_ORDER,
  type Condition,
  type Product,
  type ProductStatus,
} from '@/core/models/Product';
import { PLATFORMS } from '@/shared/constants';
import { ProductService } from '@/core/services/ProductService';
import { calculateSuggestedPrice, rulesFrom } from '@/core/services/PriceCalculator';
import { calculateProfit } from '@/core/services/ProfitCalculator';
import { findDuplicates } from '@/core/services/DuplicateService';
import {
  generateListingDescription,
  generateListingTitle,
} from '@/core/services/ListingContentService';
import {
  Alert,
  Checkbox,
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
import { formatCurrency } from '@/core/utils/format';

/**
 * Create/edit form for a product.
 *
 * The same form serves manual creation and editing of imported products, so the
 * catalogue never depends on Amazon being reachable.
 */
export function ProductForm({
  store,
  product,
  onClose,
  onSaved,
}: {
  store: Store;
  product?: Product;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const editing = !!product;
  const [title, setTitle] = useState(product?.title ?? '');
  const [brand, setBrand] = useState(product?.brand ?? '');
  const [asin, setAsin] = useState(product?.asin ?? '');
  const [ean, setEan] = useState(product?.ean ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [condition, setCondition] = useState<Condition>(
    product?.condition ?? store.settings.defaultCondition,
  );
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? 'DRAFT');
  const [platform, setPlatform] = useState(product?.platform ?? store.settings.defaultPlatform);

  const [purchasePrice, setPurchasePrice] = useState<number | undefined>(product?.purchasePrice ?? undefined);
  const [purchaseShipping, setPurchaseShipping] = useState<number | undefined>(
    product?.purchaseShipping ?? 0,
  );
  const [purchaseOther, setPurchaseOther] = useState<number | undefined>(
    product?.purchaseOtherCosts ?? 0,
  );
  const [salePrice, setSalePrice] = useState<number | undefined>(product?.plannedSalePrice);
  const [quantity, setQuantity] = useState(product?.quantity ?? 1);
  const [listedQuantity, setListedQuantity] = useState(product?.listedQuantity ?? 0);

  const [description, setDescription] = useState(product?.description ?? '');
  const [listingTitle, setListingTitle] = useState(product?.listingTitle ?? '');
  const [listingDescription, setListingDescription] = useState(product?.listingDescription ?? '');
  const [imagesText, setImagesText] = useState((product?.images ?? []).join('\n'));
  const [notes, setNotes] = useState(product?.notes ?? '');
  const [regenerate, setRegenerate] = useState(!editing);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const costBase = {
    purchasePrice: purchasePrice ?? 0,
    purchaseShipping: purchaseShipping ?? 0,
    purchaseOtherCosts: purchaseOther ?? 0,
  };

  const suggestion = useMemo(
    () => calculateSuggestedPrice(costBase, rulesFrom(store.settings, null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [purchasePrice, purchaseShipping, purchaseOther, store.settings],
  );

  const expected = useMemo(
    () => (salePrice ? calculateProfit(costBase, salePrice) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [salePrice, purchasePrice, purchaseShipping, purchaseOther],
  );

  const duplicates = useMemo(() => {
    if (!title.trim() && !asin.trim() && !ean.trim()) return [];
    return findDuplicates(
      { title, asin, ean, brand },
      store.products,
      { excludeId: product?.id },
    );
  }, [title, asin, ean, brand, store.products, product?.id]);

  const save = async () => {
    if (!title.trim()) {
      setError('Bitte einen Produktnamen eingeben.');
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const images = imagesText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s));

      const base = {
        title: title.trim(),
        brand: brand.trim() || undefined,
        asin: asin.trim() || undefined,
        ean: ean.trim() || undefined,
        category: category.trim() || undefined,
        condition,
        status,
        platform,
        purchasePrice: purchasePrice ?? 0,
        purchaseShipping: purchaseShipping ?? 0,
        purchaseOtherCosts: purchaseOther ?? 0,
        plannedSalePrice: salePrice,
        quantity: Math.max(1, quantity),
        listedQuantity: Math.max(0, listedQuantity),
        description,
        images,
        selectedImages: images.slice(0, store.settings.maxImages),
        notes: notes.trim() || undefined,
        currency: store.settings.currency,
      };

      const draft = {
        ...base,
        bulletPoints: product?.bulletPoints ?? [],
      } as Product;

      const nextListingTitle = regenerate
        ? generateListingTitle(draft, { template: null })
        : listingTitle.trim() || undefined;
      const nextListingDescription = regenerate
        ? generateListingDescription(draft, { settings: store.settings })
        : listingDescription.trim() || undefined;

      if (editing && product) {
        await ProductService.update(
          product.id,
          { ...base, listingTitle: nextListingTitle, listingDescription: nextListingDescription },
          'Produkt bearbeitet',
        );
        onSaved?.(product.id);
      } else {
        const created = await ProductService.create({
          ...base,
          source: 'manual',
          listingTitle: nextListingTitle,
          listingDescription: nextListingDescription,
        });
        onSaved?.(created.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      wide
      title={editing ? 'Produkt bearbeiten' : 'Produkt hinzufügen'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <span className="spinner" /> : null}
            {editing ? 'Änderungen speichern' : 'Produkt anlegen'}
          </button>
        </>
      }
    >
      {error ? <Alert tone="err">{error}</Alert> : null}

      {duplicates.length > 0 ? (
        <Alert tone="warn" title="Möglicherweise bereits vorhanden">
          {duplicates
            .slice(0, 2)
            .map((d) => d.product.title.slice(0, 40))
            .join(' · ')}
        </Alert>
      ) : null}

      <Field label="Produktname *">
        <TextInput value={title} onChange={setTitle} placeholder="z. B. Fitgriff Zughilfen" />
      </Field>

      <div className="grid grid-3">
        <Field label="Marke">
          <TextInput value={brand} onChange={setBrand} />
        </Field>
        <Field label="ASIN">
          <TextInput value={asin} onChange={setAsin} placeholder="B0XXXXXXXX" />
        </Field>
        <Field label="EAN / GTIN">
          <TextInput value={ean} onChange={setEan} />
        </Field>
      </div>

      <div className="grid grid-3">
        <Field label="Kategorie">
          <TextInput value={category} onChange={setCategory} />
        </Field>
        <Field label="Zustand">
          <Select
            value={condition}
            onChange={setCondition}
            options={CONDITIONS.map((c) => ({ value: c, label: CONDITION_LABELS[c] }))}
          />
        </Field>
        <Field label="Plattform">
          <Select
            value={platform}
            onChange={setPlatform}
            options={PLATFORMS.map((p) => ({
              value: p.id,
              label: p.supported ? p.label : `${p.label} (nur Verwaltung)`,
            }))}
          />
        </Field>
      </div>

      <span className="section-title">Einkauf (pro Stück)</span>
      <div className="grid grid-3">
        <Field label="Einkaufspreis">
          <MoneyInput value={purchasePrice} onChange={setPurchasePrice} />
        </Field>
        <Field label="Einkaufsversand">
          <MoneyInput value={purchaseShipping} onChange={setPurchaseShipping} />
        </Field>
        <Field label="Sonstige Kosten">
          <MoneyInput value={purchaseOther} onChange={setPurchaseOther} />
        </Field>
      </div>

      <span className="section-title">Verkauf & Bestand</span>
      <div className="grid grid-3">
        <Field
          label="Geplanter Verkaufspreis"
          hint={
            <>
              Vorschlag {formatCurrency(suggestion.price, store.settings.currency)}{' '}
              <button
                className="btn btn-sm btn-ghost"
                type="button"
                onClick={() => setSalePrice(suggestion.price)}
              >
                übernehmen
              </button>
            </>
          }
        >
          <MoneyInput value={salePrice} onChange={setSalePrice} />
        </Field>
        <Field label="Menge (gesamt)">
          <NumberInput value={quantity} onChange={setQuantity} min={1} />
        </Field>
        <Field label="Davon gelistet">
          <NumberInput value={listedQuantity} onChange={setListedQuantity} min={0} max={quantity} />
        </Field>
      </div>

      <div className="card card-pad" style={{ background: 'var(--surface-2)' }}>
        <dl className="kv">
          <dt>Einkaufskosten gesamt (pro Stück)</dt>
          <dd>
            <Money
              value={costBase.purchasePrice + costBase.purchaseShipping + costBase.purchaseOtherCosts}
              currency={store.settings.currency}
            />
          </dd>
          <dt>Erwarteter Gewinn (pro Stück, ohne Verkaufskosten)</dt>
          <dd>
            <Money value={expected?.profit} currency={store.settings.currency} signed colored />
          </dd>
          <dt>Erwartete Marge</dt>
          <dd>
            <Percent value={expected?.margin} />
          </dd>
          <dt>Erwarteter ROI</dt>
          <dd>
            <Percent value={expected?.roi} />
          </dd>
        </dl>
      </div>

      <Field label="Status">
        <Select
          value={status}
          onChange={setStatus}
          options={PRODUCT_STATUS_ORDER.map((s) => ({
            value: s,
            label: PRODUCT_STATUS_META[s].label,
          }))}
        />
      </Field>

      <span className="section-title">Inhalte</span>
      <Field label="Beschreibung (intern / Quelle)">
        <TextArea value={description} onChange={setDescription} rows={3} />
      </Field>

      <Checkbox
        checked={regenerate}
        onChange={setRegenerate}
        label="Anzeigentitel und -beschreibung automatisch generieren"
      />

      {!regenerate ? (
        <>
          <Field label="Anzeigentitel (Willhaben)">
            <TextInput value={listingTitle} onChange={setListingTitle} />
          </Field>
          <Field label="Anzeigenbeschreibung (Willhaben)">
            <TextArea value={listingDescription} onChange={setListingDescription} rows={5} />
          </Field>
        </>
      ) : null}

      <Field label="Bild-URLs" hint="Eine URL pro Zeile.">
        <TextArea value={imagesText} onChange={setImagesText} rows={3} />
      </Field>

      <Field label="Notizen" hint="Nur intern – wird nie in die Anzeige übernommen.">
        <TextArea value={notes} onChange={setNotes} rows={2} />
      </Field>
    </Modal>
  );
}
