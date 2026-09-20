/**
 * In-memory server cache for fetched tables.
 *
 * Port of V3 `@st.cache_data(ttl=300)` per-table loaders, with the V3.1
 * improvement required by the migration: a write invalidates only the AFFECTED
 * tab (V3 cleared all caches via `clear_all_caches`).
 *
 * Keyed by app key. TTL 300s (matches V3). Thread-safe for single-process use.
 */

/** Cache TTL in milliseconds — 300s, parity with V3 `@st.cache_data(ttl=300)`. */
export const CACHE_TTL_MS = 300_000;

interface CacheEntry<T> {
  value: T;
  /** Absolute epoch ms at which the entry expires. */
  expiresAt: number;
}

export class TableCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = CACHE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /** True when a fresh (unexpired) value exists for `key`. */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key); // lazy eviction
      return false;
    }
    return true;
  }

  /** Fresh value for `key`, or undefined when absent/expired. */
  get<T>(key: string): T | undefined {
    return this.has(key) ? (this.store.get(key)!.value as T) : undefined;
  }

  set(key: string, value: unknown): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Invalidate ONE tab's cache entry (the affected-table improvement). */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /** Invalidate all entries (fallback; mirrors V3 `clear_all_caches`). */
  clear(): void {
    this.store.clear();
  }

  /** Number of live entries (for tests). */
  size(): number {
    return this.store.size;
  }
}