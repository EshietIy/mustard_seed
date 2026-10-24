import type { MenuCategoryId } from '../menu/menu.types';

export const MENU_ADMIN_REPOSITORY = Symbol('MENU_ADMIN_REPOSITORY');

/** A dish as staff manage it. */
export interface AdminMenuItem {
  id: string;
  name: string;
  category: MenuCategoryId;
  /** Integer kobo; null until the real price is supplied. */
  priceKobo: number | null;
  isAvailable: boolean;
}

export interface MenuItemPatch {
  isAvailable?: boolean;
  /** Integer kobo above zero, or null to show [PRICE] (not orderable). */
  priceKobo?: number | null;
}

/** A dish and the storage key of its photo (null: "Photo coming"). */
export interface MenuItemImage {
  id: string;
  name: string;
  imagePath: string | null;
}

/** Staff changes to menu items (AGENT.md section 11, slice 8). */
export interface MenuAdminRepository {
  /** Saves the sent fields; null when no item has that id. */
  updateItem(id: string, patch: MenuItemPatch): Promise<AdminMenuItem | null>;
  /** Null when no item has that id. */
  findImage(id: string): Promise<MenuItemImage | null>;
  setImagePath(id: string, imagePath: string | null): Promise<void>;
}
