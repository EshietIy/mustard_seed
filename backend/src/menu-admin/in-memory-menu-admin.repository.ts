import type {
  AdminMenuItem,
  MenuAdminRepository,
  MenuItemImage,
  MenuItemPatch,
} from './menu-admin.repository';

type Item = AdminMenuItem & { imagePath?: string | null };

/** In-memory MenuAdminRepository for unit tests. */
export class InMemoryMenuAdminRepository implements MenuAdminRepository {
  constructor(public items: Item[] = []) {}

  updateItem(id: string, patch: MenuItemPatch): Promise<AdminMenuItem | null> {
    const item = this.items.find((i) => i.id === id);
    if (!item) return Promise.resolve(null);
    Object.assign(item, patch);
    const { id: itemId, name, category, priceKobo, isAvailable } = item;
    return Promise.resolve({ id: itemId, name, category, priceKobo, isAvailable });
  }

  findImage(id: string): Promise<MenuItemImage | null> {
    const item = this.items.find((i) => i.id === id);
    return Promise.resolve(
      item ? { id: item.id, name: item.name, imagePath: item.imagePath ?? null } : null,
    );
  }

  setImagePath(id: string, imagePath: string | null): Promise<void> {
    const item = this.items.find((i) => i.id === id);
    if (item) item.imagePath = imagePath;
    return Promise.resolve();
  }
}
