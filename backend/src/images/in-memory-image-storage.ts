import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import type { ImageStorage } from './image-storage';

/** Automated tests only (IMAGE_STORAGE=memory): keeps files in memory, can simulate failures. */
export class InMemoryImageStorage implements ImageStorage {
  readonly files = new Map<string, { data: Buffer; contentType: string }>();
  private failPuts = 0;
  /** Lets n puts succeed before failures start (to test clean-up after a partial upload). */
  private putsBeforeFailure = 0;
  /** Used bytes reported instead of the real total, to test the allowance warning. */
  reportedUsage?: number;

  failNextPuts(n: number, after = 0): void {
    this.failPuts = n;
    this.putsBeforeFailure = after;
  }

  put(key: string, data: Buffer, contentType: string): Promise<void> {
    if (this.failPuts > 0) {
      if (this.putsBeforeFailure > 0) {
        this.putsBeforeFailure--;
      } else {
        this.failPuts--;
        return Promise.reject(
          new UpstreamUnavailableException('supabase-storage', 'images.put', 'simulated failure'),
        );
      }
    }
    this.files.set(key, { data, contentType });
    return Promise.resolve();
  }

  remove(keys: string[]): Promise<void> {
    for (const key of keys) this.files.delete(key);
    return Promise.resolve();
  }

  usedBytes(): Promise<number> {
    let total = 0;
    for (const { data } of this.files.values()) total += data.length;
    return Promise.resolve(this.reportedUsage ?? total);
  }

  reset(): void {
    this.files.clear();
    this.failPuts = 0;
    this.putsBeforeFailure = 0;
    this.reportedUsage = undefined;
  }
}
