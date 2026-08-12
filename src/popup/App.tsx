import { useCallback, useEffect, useMemo, useState } from 'react';
import { Settings as SettingsIcon, LayoutDashboard, Package, RefreshCw } from 'lucide-react';
import type { AmazonPageState, ExtractedProduct, ExtractionResult } from '@/shared/types';
import { sendMessage } from '@/shared/messages';
import { formatCurrency, formatDate } from '@/core/utils/format';
import { PRODUCT_STATUS_META, type Product } from '@/core/models/Product';
import { ProductService } from '@/core/services/ProductService';
import { SettingsService } from '@/core/services/SettingsService';
import { TemplateService } from '@/core/services/TemplateService';
import { DEFAULT_SETTINGS, type Settings } from '@/core/models/Settings';
import {
  DUPLICATE_REASON_LABELS,
  findDuplicates,
  fromExtracted,
  type DuplicateMatch,
} from '@/core/services/DuplicateService';
import { calculateSuggestedPrice, rulesFrom } from '@/core/services/PriceCalculator';
import {
  generateListingDescription,
  generateListingTitle,
} from '@/core/services/ListingContentService';
import { StorageService } from '@/core/services/StorageService';
import { PLATFORMS, platformLabel } from '@/shared/constants';
import { Alert, Field, Money, MoneyInput, ProductImage, Spinner } from '@/ui/components';
import { useTheme } from '@/ui/useStore';

/** Fields shown in the analysis checklist, in display order. */
const CHECK_FIELDS: { key: string; label: string }[] = [
  { key: 'title', label: 'Titel' },
  { key: 'price', label: 'Preis' },
  { key: 'asin', label: 'ASIN' },
  { key: 'brand', label: 'Marke' },
  { key: 'images', label: 'Bilder' },
  { key: 'bulletPoints', label: 'Merkmale' },
  { key: 'category', label: 'Kategorie' },
  { key: 'ean', label: 'EAN' },
];

type Phase = 'detecting' | 'idle' | 'analyzing' | 'analyzed' | 'saving' | 'prepared';

/** Marketplaces the extension can actually prefill, in button order. */
const SUPPORTED_PLATFORMS = PLATFORMS.filter((p) => p.supported);

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [pageState, setPageState] = useState<AmazonPageState | null>(null);
  const [phase, setPhase] = useState<Phase>('detecting');
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [forceNew, setForceNew] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState<number | undefined>();
  const [salePrice, setSalePrice] = useState<number | undefined>();
  const [savedProduct, setSavedProduct] = useState<Product | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  useTheme(settings.theme);

  useEffect(() => {
    void (async () => {
      await StorageService.init();
      await TemplateService.ensureSeeded();
      setSettings(await SettingsService.get());
      try {
        setPageState(await sendMessage({ type: 'GET_PAGE_STATE' }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setPageState({ isAmazon: false, isProductPage: false });
      } finally {
        setPhase('idle');
      }
    })();
  }, []);

  const extracted: ExtractedProduct | undefined = result?.product;

  const suggestion = useMemo(() => {
    if (purchasePrice === undefined) return null;
    return calculateSuggestedPrice(
      { purchasePrice, purchaseShipping: 0, purchaseOtherCosts: 0 },
      rulesFrom(settings, null),
    );
  }, [purchasePrice, settings]);

  const analyze = useCallback(async () => {
    setPhase('analyzing');
    setError(undefined);
    setSavedProduct(null);
    setForceNew(false);
    try {
      const res = await sendMessage({ type: 'ANALYZE_ACTIVE_TAB' });
      setResult(res);

      if (res.product) {
        const products = await ProductService.all();
        setDuplicates(findDuplicates(fromExtracted(res.product), products));
        const price = res.product.price;
        setPurchasePrice(price);
        if (price !== undefined) {
          setSalePrice(
            calculateSuggestedPrice(
              { purchasePrice: price, purchaseShipping: 0, purchaseOtherCosts: 0 },
              rulesFrom(settings, null),
            ).price,
          );
        }
      }
      setPhase('analyzed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('idle');
    }
  }, [settings]);

  /**
   * Saves the product and hands it to one marketplace. The same product record
   * feeds every platform, so preparing for eBay after Willhaben reuses it rather
   * than creating a second entry.
   */
  const prepare = useCallback(async (platform: string) => {
    if (!extracted) return;
    setPreparing(platform);
    setPhase('saving');
    setError(undefined);
    try {
      const template = await TemplateService.suggestFor({
        category: extracted.category,
        categoryPath: extracted.categoryPath,
        title: extracted.title,
        bulletPoints: extracted.bulletPoints,
      });

      // An exact duplicate reuses the existing record unless the user insisted
      // on a fresh import, so the catalogue never silently doubles up.
      const exact = duplicates.find((d) => d.confidence === 'exact');
      let product: Product;

      if (exact && !forceNew) {
        product =
          (await ProductService.update(
            exact.product.id,
            {
              purchasePrice: purchasePrice ?? exact.product.purchasePrice,
              plannedSalePrice: salePrice ?? exact.product.plannedSalePrice,
            },
            `Erneut für ${platformLabel(platform)} vorbereitet`,
          )) ?? exact.product;
      } else {
        const created = await ProductService.createFromExtraction(extracted, settings, {
          purchasePrice: purchasePrice ?? extracted.price ?? 0,
          plannedSalePrice: salePrice,
        });

        const listingTitle = settings.autoOptimizeTitle
          ? generateListingTitle(created, { template })
          : created.title;
        const listingDescription = settings.autoGenerateDescription
          ? generateListingDescription(created, { template, settings })
          : created.description;

        product =
          (await ProductService.update(created.id, { listingTitle, listingDescription })) ?? created;
      }

      setSavedProduct(product);
      await sendMessage({ type: 'PREPARE_LISTING', productId: product.id, platform });
      setPhase('prepared');
      // The marketplace opens in a new tab, which closes the popup anyway.
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('analyzed');
    } finally {
      setPreparing(null);
    }
  }, [extracted, duplicates, forceNew, purchasePrice, salePrice, settings]);

  const openDashboard = useCallback(async (route: string) => {
    try {
      await sendMessage({ type: 'OPEN_DASHBOARD', route });
      window.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const detected = pageState?.isProductPage === true;

  return (
    <div className="popup">
      <header className="popup-header">
        <span className="mark">→</span>
        <span className="titles">
          <span className="name">AMAZON → WILLHABEN</span>
          <span className="sub">Reselling Manager</span>
        </span>
        <button
          type="button"
          title="Einstellungen"
          aria-label="Einstellungen"
          onClick={() => void openDashboard('#/settings')}
        >
          <SettingsIcon size={15} />
        </button>
      </header>

      <div className="popup-body">
        {phase === 'detecting' ? (
          <Spinner label="Seite wird geprüft…" />
        ) : (
          <div className={`detect ${detected ? 'ok' : 'warn'}`}>
            <span className="dot" />
            <span>
              <strong>
                {detected
                  ? 'Amazon-Produkt erkannt'
                  : pageState?.isAmazon
                    ? 'Keine Amazon-Produktseite'
                    : 'Keine unterstützte Amazon-Seite'}
              </strong>
              {pageState?.host ? <span className="host">{pageState.host}</span> : null}
              {!detected ? (
                <span className="host">
                  Öffne eine Produktseite auf amazon.de, amazon.at oder amazon.com.
                </span>
              ) : null}
            </span>
          </div>
        )}

        {error ? <Alert tone="err" title="Fehler">{error}</Alert> : null}

        {result && !result.ok ? (
          <Alert tone="warn" title="Analyse unvollständig">
            {result.error ?? 'Produkt konnte nur teilweise analysiert werden.'}
          </Alert>
        ) : null}

        {extracted ? (
          <>
            <div className="preview">
              <ProductImage src={extracted.images[0]} alt={extracted.title ?? 'Produkt'} size={64} />
              <div className="info">
                <span className="ptitle">{extracted.title ?? 'Ohne Titel'}</span>
                <span className="price">
                  {extracted.price !== undefined
                    ? formatCurrency(extracted.price, extracted.currency)
                    : 'Kein Preis erkannt'}
                </span>
                <span className="meta">
                  {extracted.brand ? <span>{extracted.brand}</span> : null}
                  {extracted.asin ? <span>ASIN {extracted.asin}</span> : null}
                  <span>{extracted.images.length} Bilder</span>
                </span>
              </div>
            </div>

            <div className="checks">
              {CHECK_FIELDS.map(({ key, label }) => {
                const field = result?.report.fields[key];
                const found = field && field.confidence !== 'missing';
                return (
                  <div key={key}>
                    <span className={found ? 'ok' : 'miss'}>{found ? '✓' : '⚠'}</span>
                    <span className="name">{label}</span>
                    {settings.debugMode && field ? (
                      <span className="src">{field.source}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {duplicates.length > 0 && !forceNew ? (
              <div className="dup">
                <span className="head">⚠ Produkt bereits vorhanden</span>
                {duplicates.slice(0, 2).map((d) => (
                  <div className="item" key={d.product.id}>
                    <span>
                      <strong>{d.product.title.slice(0, 48)}</strong>
                    </span>
                    <span className="muted">
                      {DUPLICATE_REASON_LABELS[d.reason]} · {PRODUCT_STATUS_META[d.product.status].label} ·
                      importiert {formatDate(d.product.importedAt)}
                    </span>
                    <span className="muted">
                      Einkauf {formatCurrency(d.product.purchasePrice)} · geplanter Verkauf{' '}
                      {d.product.plannedSalePrice ? formatCurrency(d.product.plannedSalePrice) : '–'}
                    </span>
                  </div>
                ))}
                <div className="row2">
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => void openDashboard(`#/products/${duplicates[0]!.product.id}`)}
                  >
                    Vorhandenes öffnen
                  </button>
                  <button className="btn btn-sm" type="button" onClick={() => setForceNew(true)}>
                    Trotzdem neu
                  </button>
                </div>
              </div>
            ) : null}

            <div className="price-row">
              <Field label="Einkauf (pro Stück)">
                <MoneyInput value={purchasePrice} onChange={setPurchasePrice} />
              </Field>
              <Field label="Geplanter Verkauf">
                <MoneyInput value={salePrice} onChange={setSalePrice} />
              </Field>
            </div>
            {suggestion ? (
              <span className="suggestion">
                Vorschlag {formatCurrency(suggestion.price)} · erwarteter Gewinn{' '}
                <Money value={suggestion.expectedProfit} signed colored /> ·{' '}
                {suggestion.strategy === 'target-margin'
                  ? `Zielmarge ${settings.targetMargin} %`
                  : suggestion.appliedMinProfit
                    ? `Mindestgewinn ${formatCurrency(settings.minProfit)}`
                    : `Aufschlag ${settings.defaultMarkupPercent} %`}
              </span>
            ) : null}
          </>
        ) : null}

        <div className="actions">
          <button
            className="btn"
            type="button"
            disabled={!detected || phase === 'analyzing'}
            onClick={() => void analyze()}
          >
            {phase === 'analyzing' ? <span className="spinner" /> : <RefreshCw size={14} />}
            {phase === 'analyzing' ? 'Analysiere…' : 'Produkt analysieren'}
          </button>

          {SUPPORTED_PLATFORMS.map((platform, index) => (
            <button
              key={platform.id}
              className={`btn ${index === 0 ? 'btn-primary' : ''}`}
              type="button"
              disabled={!extracted || !extracted.title || phase === 'saving'}
              onClick={() => void prepare(platform.id)}
            >
              {preparing === platform.id ? <span className="spinner" /> : null}
              → {platform.label} vorbereiten
            </button>
          ))}
        </div>

        {savedProduct && phase === 'prepared' ? (
          <Alert tone="ok" title="Vorbereitet">
            {savedProduct.title.slice(0, 40)} wurde gespeichert. Bitte im Formular prüfen und selbst
            veröffentlichen.
          </Alert>
        ) : null}
      </div>

      <footer className="popup-footer">
        <button className="btn btn-sm" type="button" onClick={() => void openDashboard('#/products')}>
          <Package size={14} /> Produkte
        </button>
        <button className="btn btn-sm" type="button" onClick={() => void openDashboard('#/')}>
          <LayoutDashboard size={14} /> Dashboard
        </button>
      </footer>
    </div>
  );
}
