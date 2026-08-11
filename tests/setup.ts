import { beforeEach, vi } from 'vitest';
import { StorageService } from '@/core/services/StorageService';

/**
 * The services fall back to an in-memory storage area when the chrome APIs are
 * absent, which is exactly the situation in tests. Each test starts from a
 * clean slate so ordering can never leak state between suites.
 */
beforeEach(async () => {
  await StorageService.clearAll();
});

// `notifyDataChanged` fires a runtime message; there is no extension host in
// tests, so it is stubbed to a no-op rather than throwing.
vi.stubGlobal('chrome', undefined);
