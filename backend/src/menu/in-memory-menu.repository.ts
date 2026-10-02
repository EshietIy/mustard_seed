import type { MenuRepository } from './menu.repository';
import type { MenuItemRecord } from './menu.types';

/** In-memory MenuRepository for unit tests. */
export class InMemoryMenuRepository implements MenuRepository {
  private failure?: Error;

  constructor(private items: MenuItemRecord[] = []) {}

  failWith(err: Error): void {
    this.failure = err;
  }

  listItems(): Promise<MenuItemRecord[]> {
    if (this.failure) return Promise.reject(this.failure);
    return Promise.resolve([...this.items]);
  }
}
