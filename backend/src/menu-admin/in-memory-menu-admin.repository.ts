import {
  DishNameTakenError,
  type AdminMenuItem,
  type MenuAdminRepository,
  type MenuItemImage,
  type MenuItemPatch,
  type MoveDirection,
  type NewMenuItem,
} from './menu-admin.repository';

/** A stored dish; the optional fields default as the database columns do. */
export type InMemoryDish = Pick<
  AdminMenuItem,
  'id' | 'name' | 'category' | 'priceKobo' | 'isAvailable'
> &
  Partial<AdminMenuItem> & { imagePath?: string | null; isFreshJuice?: boolean };

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function toItem(d: InMemoryDish): AdminMenuItem {
  return {
    id: d.id,
    slug: d.slug ?? d.id,
    name: d.name,
    description: d.description ?? '',
    category: d.category,
    priceKobo: d.priceKobo,
    isAvailable: d.isAvailable,
    isHouseSignature: d.isHouseSignature ?? false,
    sortOrder: d.sortOrder ?? 0,
    archivedAt: d.archivedAt ?? null,
  };
}

/** In-memory MenuAdminRepository for unit tests. */
export class InMemoryMenuAdminRepository implements MenuAdminRepository {
  private nextId = 1;

  constructor(public items: InMemoryDish[] = []) {}

  listItems(): Promise<AdminMenuItem[]> {
    return Promise.resolve(
      this.items
        .map(toItem)
        .sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.sortOrder - b.sortOrder ||
            a.name.localeCompare(b.name),
        ),
    );
  }

  createItem(item: NewMenuItem): Promise<AdminMenuItem> {
    if (this.items.some((d) => !d.archivedAt && sameName(d.name, item.name))) {
      return Promise.reject(new DishNameTakenError());
    }
    const dish: InMemoryDish = {
      ...item,
      id: `new-${this.nextId++}`,
      isAvailable: false,
      archivedAt: null,
    };
    this.items.push(dish);
    return Promise.resolve(toItem(dish));
  }

  updateItem(id: string, patch: MenuItemPatch): Promise<AdminMenuItem | null> {
    const item = this.items.find((i) => i.id === id);
    if (!item) return Promise.resolve(null);
    const { archived, ...fields } = patch;
    const archivedAt =
      archived === undefined
        ? (item.archivedAt ?? null)
        : archived
          ? new Date().toISOString()
          : null;
    const name = fields.name ?? item.name;
    if (
      !archivedAt &&
      this.items.some((d) => d.id !== id && !d.archivedAt && sameName(d.name, name))
    ) {
      return Promise.reject(new DishNameTakenError());
    }
    Object.assign(item, fields, { archivedAt });
    return Promise.resolve(toItem(item));
  }

  moveItem(id: string, direction: MoveDirection): Promise<void> {
    const item = this.items.find((i) => i.id === id && !i.archivedAt);
    if (!item) return Promise.resolve();
    const list = this.items
      .filter((d) => d.category === item.category && !d.archivedAt)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    list.forEach((d, i) => (d.sortOrder = (i + 1) * 10));
    const at = list.indexOf(item);
    const neighbour = list[direction === 'up' ? at - 1 : at + 1];
    if (neighbour) {
      [item.sortOrder, neighbour.sortOrder] = [neighbour.sortOrder, item.sortOrder];
    }
    return Promise.resolve();
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
