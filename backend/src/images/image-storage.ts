export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

/** Long browser and CDN caching: every upload gets a new key, so updates still show. */
export const IMAGE_CACHE_SECONDS = 31_536_000;

/**
 * Where site photos live (AGENT.md 3.1): Supabase Storage in the app, memory in tests. Keys are
 * object paths inside the bucket; only the backend ever writes.
 */
export interface ImageStorage {
  /** Stores a new file. Keys are versioned, so this never overwrites. */
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Deletes the files; missing ones are ignored. */
  remove(keys: string[]): Promise<void>;
  /** Total bytes stored in the bucket. */
  usedBytes(): Promise<number>;
}
