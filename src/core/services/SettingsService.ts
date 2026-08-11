import { DEFAULT_SETTINGS, type Settings } from '@/core/models/Settings';
import { STORAGE_KEYS } from '@/shared/constants';
import { StorageService } from './StorageService';
import { notifyDataChanged } from '@/shared/messages';

export const SettingsService = {
  /** Stored settings merged over the defaults, so new keys always resolve. */
  async get(): Promise<Settings> {
    const stored = await StorageService.get<Partial<Settings>>(STORAGE_KEYS.settings, {});
    return { ...DEFAULT_SETTINGS, ...stored };
  },

  async update(patch: Partial<Settings>): Promise<Settings> {
    const next = await StorageService.mutate<Partial<Settings>>(
      STORAGE_KEYS.settings,
      {},
      (current) => ({ ...current, ...patch }),
    );
    notifyDataChanged(['settings']);
    return { ...DEFAULT_SETTINGS, ...next };
  },

  async reset(): Promise<Settings> {
    await StorageService.set(STORAGE_KEYS.settings, {});
    notifyDataChanged(['settings']);
    return { ...DEFAULT_SETTINGS };
  },

  async replaceAll(settings: Partial<Settings>): Promise<void> {
    await StorageService.set(STORAGE_KEYS.settings, settings);
    notifyDataChanged(['settings']);
  },
};
