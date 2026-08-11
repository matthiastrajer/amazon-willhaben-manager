import { normalizeKey } from '@/core/utils/text';

/**
 * Central Amazon → Willhaben category mapping.
 *
 * Everything category related lives here so mappings never end up scattered
 * across adapters. A mapping matches when any of its `match` keywords appears
 * in the normalised Amazon breadcrumb path, brand-free title or bullet text.
 *
 * `path` is the Willhaben category path as the user would click it. Willhaben's
 * category picker is a multi-step dynamic component, so the extension proposes
 * the path and — where the form exposes a matching control — pre-selects it;
 * otherwise the path is shown for one manual click. See WillhabenFieldMapper.
 */
export interface CategoryMapping {
  id: string;
  /** Normalised keywords matched against Amazon category/title text. */
  match: string[];
  /** Willhaben category path, top level first. */
  path: string[];
  /** Higher wins when several mappings match. */
  weight: number;
}

export const CATEGORY_MAPPINGS: CategoryMapping[] = [
  {
    id: 'sport-fitness',
    match: ['sport', 'fitness', 'krafttraining', 'bodybuilding', 'gym', 'training', 'hantel', 'yoga', 'laufen', 'exercise'],
    path: ['Sport & Freizeit', 'Fitness'],
    weight: 10,
  },
  {
    id: 'sport-outdoor',
    match: ['outdoor', 'camping', 'wandern', 'klettern', 'zelt', 'rucksack'],
    path: ['Sport & Freizeit', 'Camping & Outdoor'],
    weight: 9,
  },
  {
    id: 'sport-bike',
    match: ['fahrrad', 'bike', 'radsport', 'cycling', 'e bike'],
    path: ['Sport & Freizeit', 'Fahrräder'],
    weight: 9,
  },
  {
    id: 'elektronik-audio',
    match: ['kopfhoerer', 'kopfhorer', 'headphone', 'lautsprecher', 'speaker', 'audio', 'hifi', 'soundbar'],
    path: ['Elektronik', 'Audio & HiFi'],
    weight: 10,
  },
  {
    id: 'elektronik-computer',
    match: ['computer', 'laptop', 'notebook', 'pc', 'tastatur', 'keyboard', 'maus', 'monitor', 'ssd', 'festplatte'],
    path: ['Elektronik', 'Computer & Zubehör'],
    weight: 10,
  },
  {
    id: 'elektronik-handy',
    match: ['handy', 'smartphone', 'iphone', 'android', 'tablet', 'huelle', 'ladekabel', 'powerbank'],
    path: ['Elektronik', 'Handy & Zubehör'],
    weight: 10,
  },
  {
    id: 'elektronik-foto',
    match: ['kamera', 'camera', 'foto', 'objektiv', 'drohne', 'gopro'],
    path: ['Elektronik', 'Foto & Video'],
    weight: 9,
  },
  {
    id: 'elektronik-tv',
    match: ['fernseher', 'tv ', 'television', 'beamer', 'projektor'],
    path: ['Elektronik', 'TV & Video'],
    weight: 9,
  },
  {
    id: 'elektronik-gaming',
    match: ['gaming', 'konsole', 'playstation', 'xbox', 'nintendo', 'videospiel'],
    path: ['Elektronik', 'Konsolen & Games'],
    weight: 10,
  },
  {
    id: 'haushalt-kueche',
    match: ['kueche', 'kuche', 'kitchen', 'kochen', 'pfanne', 'topf', 'geschirr', 'kaffee', 'mixer'],
    path: ['Haushalt', 'Küche'],
    weight: 9,
  },
  {
    id: 'haushalt-allgemein',
    match: ['haushalt', 'household', 'reinigung', 'staubsauger', 'waschmaschine', 'buegel'],
    path: ['Haushalt', 'Haushaltsgeräte'],
    weight: 8,
  },
  {
    id: 'moebel',
    match: ['moebel', 'mobel', 'furniture', 'sessel', 'tisch', 'stuhl', 'regal', 'sofa', 'lampe', 'wohnen'],
    path: ['Haus & Garten', 'Möbel & Wohnen'],
    weight: 8,
  },
  {
    id: 'garten',
    match: ['garten', 'garden', 'rasen', 'pflanzen', 'grill', 'werkzeug garten'],
    path: ['Haus & Garten', 'Garten'],
    weight: 8,
  },
  {
    id: 'werkzeug',
    match: ['werkzeug', 'baumarkt', 'bohrmaschine', 'akkuschrauber', 'tool', 'heimwerker'],
    path: ['Haus & Garten', 'Werkzeug & Baumaterial'],
    weight: 9,
  },
  {
    id: 'mode-damen',
    match: ['damen', 'women', 'damenmode', 'kleid', 'damenschuhe'],
    path: ['Mode & Accessoires', 'Damenbekleidung'],
    weight: 8,
  },
  {
    id: 'mode-herren',
    match: ['herren', 'men', 'herrenmode', 'herrenschuhe'],
    path: ['Mode & Accessoires', 'Herrenbekleidung'],
    weight: 8,
  },
  {
    id: 'mode-uhren',
    match: ['uhr', 'watch', 'schmuck', 'armband'],
    path: ['Mode & Accessoires', 'Uhren & Schmuck'],
    weight: 9,
  },
  {
    id: 'beauty',
    match: ['beauty', 'kosmetik', 'pflege', 'parfum', 'drogerie'],
    path: ['Mode & Accessoires', 'Beauty & Gesundheit'],
    weight: 8,
  },
  {
    id: 'baby',
    match: ['baby', 'kinderwagen', 'spielzeug', 'kind', 'kinder', 'toy', 'lego'],
    path: ['Kind & Baby', 'Spielzeug'],
    weight: 9,
  },
  {
    id: 'buch-medien',
    match: ['buch', 'book', 'roman', 'dvd', 'blu ray', 'cd ', 'musik'],
    path: ['Marktplatz', 'Bücher & Medien'],
    weight: 8,
  },
  {
    id: 'auto',
    match: ['auto', 'kfz', 'autozubehoer', 'reifen', 'motorrad'],
    path: ['Auto & Motor', 'Zubehör'],
    weight: 8,
  },
  {
    id: 'tier',
    match: ['hund', 'katze', 'haustier', 'tierbedarf', 'pet'],
    path: ['Marktplatz', 'Tierzubehör'],
    weight: 8,
  },
];

/** Fallback used when nothing matches. Willhaben's generic sell-anything bucket. */
export const FALLBACK_CATEGORY_PATH = ['Marktplatz', 'Sonstiges'];

export interface CategoryMatch {
  path: string[];
  mappingId: string | null;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Maps Amazon category/title signals to a Willhaben category path.
 *
 * Breadcrumb text is the strongest signal; the title is only consulted when the
 * breadcrumb yields nothing, and then the confidence is lowered accordingly.
 */
export function mapCategory(input: {
  categoryPath?: string[];
  category?: string;
  title?: string;
  bulletPoints?: string[];
}): CategoryMatch {
  const breadcrumb = normalizeKey(
    [...(input.categoryPath ?? []), input.category ?? ''].join(' '),
  );
  const title = normalizeKey(input.title ?? '');
  const bullets = normalizeKey((input.bulletPoints ?? []).join(' '));

  const best = (haystack: string): CategoryMapping | null => {
    if (!haystack) return null;
    let winner: CategoryMapping | null = null;
    for (const mapping of CATEGORY_MAPPINGS) {
      const hit = mapping.match.some((kw) => haystack.includes(kw));
      if (hit && (!winner || mapping.weight > winner.weight)) winner = mapping;
    }
    return winner;
  };

  const fromBreadcrumb = best(breadcrumb);
  if (fromBreadcrumb) {
    return { path: fromBreadcrumb.path, mappingId: fromBreadcrumb.id, confidence: 'high' };
  }

  const fromTitle = best(title);
  if (fromTitle) {
    return { path: fromTitle.path, mappingId: fromTitle.id, confidence: 'medium' };
  }

  const fromBullets = best(bullets);
  if (fromBullets) {
    return { path: fromBullets.path, mappingId: fromBullets.id, confidence: 'low' };
  }

  return { path: FALLBACK_CATEGORY_PATH, mappingId: null, confidence: 'low' };
}
