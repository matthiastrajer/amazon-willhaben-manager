import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Product } from '@/core/models/Product';
import type { Sale } from '@/core/models/Sale';
import type { Listing } from '@/core/models/Listing';
import type { Template } from '@/core/models/Template';
import { DEFAULT_SETTINGS, type Settings } from '@/core/models/Settings';
import { StorageService } from '@/core/services/StorageService';
import { ProductService } from '@/core/services/ProductService';
import { SaleService } from '@/core/services/SaleService';
import { ListingService } from '@/core/services/ListingService';
import { TemplateService } from '@/core/services/TemplateService';
import { SettingsService } from '@/core/services/SettingsService';

export interface Store {
  products: Product[];
  sales: Sale[];
  listings: Listing[];
  templates: Template[];
  settings: Settings;
  loading: boolean;
  error?: string;
  reload: () => Promise<void>;
}

/**
 * Single source of truth for every view.
 *
 * All collections are loaded together and re-loaded whenever chrome.storage
 * changes, no matter which view or content script wrote it. That is what keeps
 * the dashboard, the popup and the product detail page consistent without any
 * view-local caching.
 */
export function useStore(): Store {
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    try {
      const [p, s, l, t, cfg] = await Promise.all([
        ProductService.all(),
        SaleService.all(),
        ListingService.all(),
        TemplateService.all(),
        SettingsService.get(),
      ]);
      setProducts(p);
      setSales(s);
      setListings(l);
      setTemplates(t);
      setSettings(cfg);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await StorageService.init();
      await TemplateService.ensureSeeded();
      await reload();
    })();
    return StorageService.subscribe(() => {
      void reload();
    });
  }, [reload]);

  return useMemo(
    () => ({ products, sales, listings, templates, settings, loading, error, reload }),
    [products, sales, listings, templates, settings, loading, error, reload],
  );
}

/** Applies the theme setting to the document root. */
export function useTheme(theme: Settings['theme']): void {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}

/** Hash-based router state, e.g. `#/products/prd_123`. */
export function useHashRoute(): [string, (route: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const onChange = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: string) => {
    window.location.hash = next.startsWith('#') ? next : `#${next}`;
  }, []);

  return [route, navigate];
}
