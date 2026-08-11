import type { Listing, ListingStatus } from '@/core/models/Listing';
import { STORAGE_KEYS } from '@/shared/constants';
import { createId } from '@/core/utils/id';
import { StorageService } from './StorageService';
import { notifyDataChanged } from '@/shared/messages';

/**
 * Willhaben ad URLs end in a numeric id, e.g.
 * /iad/kaufen-und-verkaufen/d/<slug>-1234567890/. The id is the last long
 * number in the path; when no such number exists we simply store no id rather
 * than guessing.
 */
export function parseWillhabenId(url: string): string | undefined {
  try {
    const { pathname } = new URL(url);
    const matches = pathname.match(/\d{6,}/g);
    return matches ? matches[matches.length - 1] : undefined;
  } catch {
    const matches = url.match(/\d{6,}/g);
    return matches ? matches[matches.length - 1] : undefined;
  }
}

export const ListingService = {
  async all(): Promise<Listing[]> {
    return StorageService.get<Listing[]>(STORAGE_KEYS.listings, []);
  },

  async forProduct(productId: string): Promise<Listing[]> {
    const listings = await ListingService.all();
    return listings.filter((l) => l.productId === productId);
  },

  async byId(id: string): Promise<Listing | undefined> {
    return (await ListingService.all()).find((l) => l.id === id);
  },

  /**
   * Creates or refreshes the listing for a (product, platform) pair. Preparing
   * the same product twice must not create duplicate listing records.
   */
  async upsertPrepared(input: {
    productId: string;
    platform: string;
    listedPrice?: number;
    title?: string;
    description?: string;
  }): Promise<Listing> {
    const now = new Date().toISOString();
    let result: Listing | undefined;

    await StorageService.mutate<Listing[]>(STORAGE_KEYS.listings, [], (list) => {
      const existing = list.find(
        (l) =>
          l.productId === input.productId &&
          l.platform === input.platform &&
          (l.status === 'PREPARED' || l.status === 'ACTIVE'),
      );

      if (existing) {
        result = {
          ...existing,
          listedPrice: input.listedPrice ?? existing.listedPrice,
          title: input.title ?? existing.title,
          description: input.description ?? existing.description,
          updatedAt: now,
        };
        return list.map((l) => (l.id === existing.id ? result! : l));
      }

      result = {
        id: createId('lst'),
        productId: input.productId,
        platform: input.platform,
        status: 'PREPARED',
        listedPrice: input.listedPrice,
        title: input.title,
        description: input.description,
        createdAt: now,
        updatedAt: now,
      };
      return [result, ...list];
    });

    notifyDataChanged(['listings']);
    return result!;
  },

  async update(id: string, patch: Partial<Listing>): Promise<Listing | undefined> {
    let updated: Listing | undefined;
    await StorageService.mutate<Listing[]>(STORAGE_KEYS.listings, [], (list) =>
      list.map((l) => {
        if (l.id !== id) return l;
        updated = { ...l, ...patch, id: l.id, updatedAt: new Date().toISOString() };
        return updated;
      }),
    );
    if (updated) notifyDataChanged(['listings']);
    return updated;
  },

  /** Attaches the published ad URL, deriving the external id when possible. */
  async attachUrl(
    productId: string,
    platform: string,
    url: string,
    status: ListingStatus = 'ACTIVE',
  ): Promise<Listing> {
    const externalId = parseWillhabenId(url);
    const listings = await ListingService.forProduct(productId);
    const target = listings.find((l) => l.platform === platform) ?? null;

    if (target) {
      const updated = await ListingService.update(target.id, {
        url,
        externalId,
        status,
        publishedAt: target.publishedAt ?? new Date().toISOString(),
      });
      return updated!;
    }

    const created = await ListingService.upsertPrepared({ productId, platform });
    const updated = await ListingService.update(created.id, {
      url,
      externalId,
      status,
      publishedAt: new Date().toISOString(),
    });
    return updated!;
  },

  async remove(id: string): Promise<void> {
    await StorageService.mutate<Listing[]>(STORAGE_KEYS.listings, [], (list) =>
      list.filter((l) => l.id !== id),
    );
    notifyDataChanged(['listings']);
  },

  async replaceAll(listings: Listing[]): Promise<void> {
    await StorageService.set(STORAGE_KEYS.listings, listings);
    notifyDataChanged(['listings']);
  },
};
