import type { AdminMenuItem, MenuAdminRepository, MenuItemPatch } from './menu-admin.repository';

/** In-memory MenuAdminRepository for unit tests. */
export class InMemoryMenuAdminRepository implements MenuAdminRepository {
  constructor(public items: AdminMenuItem[] = []) {}

  updateItem(id: string, patch: MenuItemPatch): Promise<AdminMenuItem | null> {
    const item = this.items.find((i) => i.id === id);
    if (!item) return Promise.resolve(null);
    Object.assign(item, patch);
    return Promise.resolve({ ...item });
  }
}
