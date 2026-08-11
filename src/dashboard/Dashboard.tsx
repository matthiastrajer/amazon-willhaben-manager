import { useMemo } from 'react';
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Package,
  Settings as SettingsIcon,
  Tag,
  Wallet,
} from 'lucide-react';
import { useHashRoute, useStore, useTheme } from '@/ui/useStore';
import { Spinner } from '@/ui/components';
import { Overview } from './pages/Overview';
import { Products } from './pages/Products';
import { ProductDetail } from './pages/ProductDetail';
import { Sales } from './pages/Sales';
import { Analytics } from './pages/Analytics';
import { Templates } from './pages/Templates';
import { SettingsPage } from './pages/SettingsPage';
import { stockOf } from '@/core/services/InventoryService';

interface NavItem {
  route: string;
  label: string;
  icon: typeof LayoutDashboard;
  count?: number;
}

export function Dashboard() {
  const store = useStore();
  const [route, navigate] = useHashRoute();
  useTheme(store.settings.theme);

  const counts = useMemo(() => {
    const active = store.products.filter((p) => p.status !== 'CANCELLED');
    return {
      products: active.length,
      listed: active.filter((p) => p.status === 'LISTED' || p.status === 'READY_TO_LIST').length,
      sales: store.sales.length,
      templates: store.templates.length,
    };
  }, [store.products, store.sales, store.templates]);

  const nav: NavItem[] = [
    { route: '#/', label: 'Dashboard', icon: LayoutDashboard },
    { route: '#/products', label: 'Produkte', icon: Package, count: counts.products },
    { route: '#/listed', label: 'Gelistet', icon: Tag, count: counts.listed },
    { route: '#/sales', label: 'Verkäufe', icon: Wallet, count: counts.sales },
    { route: '#/analytics', label: 'Auswertung', icon: BarChart3 },
    { route: '#/templates', label: 'Vorlagen', icon: ClipboardList, count: counts.templates },
    { route: '#/settings', label: 'Einstellungen', icon: SettingsIcon },
  ];

  const activeRoute = (() => {
    if (route.startsWith('#/products/')) return '#/products';
    const match = nav.find((n) => n.route === route);
    return match?.route ?? '#/';
  })();

  const unitsInStock = useMemo(
    () =>
      store.products
        .filter((p) => p.status !== 'CANCELLED')
        .reduce((sum, p) => sum + stockOf(p, store.sales).available, 0),
    [store.products, store.sales],
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">→</span>
          <span>
            <span className="name">Amazon → Willhaben</span>
            <br />
            <span className="sub">Reselling Manager</span>
          </span>
        </div>

        <nav className="nav">
          {nav.map(({ route: target, label, icon: Icon, count }) => (
            <a
              key={target}
              href={target}
              className={activeRoute === target ? 'active' : ''}
              aria-current={activeRoute === target ? 'page' : undefined}
            >
              <Icon size={16} />
              <span>{label}</span>
              {count !== undefined && count > 0 ? <span className="count">{count}</span> : null}
            </a>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="usage">
            {unitsInStock} Stück im Bestand · {store.sales.length} Verkäufe erfasst
          </span>
          <span className="usage">Alle Daten bleiben lokal in diesem Browser.</span>
        </div>
      </aside>

      <main className="main">
        {store.loading ? (
          <div className="page">
            <Spinner label="Daten werden geladen…" />
          </div>
        ) : (
          <Router route={route} store={store} navigate={navigate} />
        )}
      </main>
    </div>
  );
}

function Router({
  route,
  store,
  navigate,
}: {
  route: string;
  store: ReturnType<typeof useStore>;
  navigate: (route: string) => void;
}) {
  if (route.startsWith('#/products/')) {
    const id = route.slice('#/products/'.length);
    return <ProductDetail productId={id} store={store} navigate={navigate} />;
  }

  switch (route) {
    case '#/products':
      return <Products store={store} navigate={navigate} />;
    case '#/listed':
      return <Products store={store} navigate={navigate} initialStatus="LISTED" title="Gelistet" />;
    case '#/sales':
      return <Sales store={store} navigate={navigate} />;
    case '#/analytics':
      return <Analytics store={store} />;
    case '#/templates':
      return <Templates store={store} />;
    case '#/settings':
      return <SettingsPage store={store} />;
    default:
      return <Overview store={store} navigate={navigate} />;
  }
}
