import type { MenuCategoryId } from '../menu/menu.types';

export const MENU_ADMIN_REPOSITORY = Symbol('MENU_ADMIN_REPOSITORY');

/** A dish as staff manage it. */
export interface AdminMenuItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: MenuCategoryId;
  /** Integer kobo; null until the real price is supplied. */
  priceKobo: number | null;
  isAvailable: boolean;
  isHouseSignature: boolean;
  sortOrder: number;
  /** ISO time the dish was retired; null while it is on the menu. */
  archivedAt: string | null;
}

/** A new dish. It always starts switched off, so staff can check it first. */
export interface NewMenuItem {
  slug: string;
  name: string;
  description: string;
  category: MenuCategoryId;
  priceKobo: number | null;
  isHouseSignature: boolean;
  isFreshJuice: boolean;
  sortOrder: number;
}

export interface MenuItemPatch {
  isAvailable?: boolean;
  /** Integer kobo above zero, or null to show [PRICE] (not orderable). */
  priceKobo?: number | null;
  name?: string;
  description?: string;
  category?: MenuCategoryId;
  isHouseSignature?: boolean;
  isFreshJuice?: boolean;
  sortOrder?: number;
  /** True retires the dish (archived_at = now), false brings it back. */
  archived?: boolean;
}

export type MoveDirection = 'up' | 'down';

/** A dish and the storage key of its photo (null: "Photo coming"). */
export interface MenuItemImage {
  id: string;
  name: string;
  imagePath: string | null;
}

/** Another dish on the menu already has this name (ignoring case). */
export class DishNameTakenError extends Error {
  constructor() {
    super('A dish on the menu already has this name');
  }
}

/** Staff changes to menu items (AGENT.md section 11, slice 8). */
export interface MenuAdminRepository {
  /** Every dish, retired ones included, by category, sort order, then name. */
  listItems(): Promise<AdminMenuItem[]>;
  /** Throws DishNameTakenError when the name is already on the menu. */
  createItem(item: NewMenuItem): Promise<AdminMenuItem>;
  /**
   * Saves the sent fields; null when no item has that id. Throws DishNameTakenError when the
   * change would put two dishes with the same name on the menu.
   */
  updateItem(id: string, patch: MenuItemPatch): Promise<AdminMenuItem | null>;
  /**
   * Swaps a dish with its neighbour among the dishes on the menu in its category, in one
   * transaction. Does nothing at either end of the list.
   */
  moveItem(id: string, direction: MoveDirection): Promise<void>;
  /** Null when no item has that id. */
  findImage(id: string): Promise<MenuItemImage | null>;
  setImagePath(id: string, imagePath: string | null): Promise<void>;
}
