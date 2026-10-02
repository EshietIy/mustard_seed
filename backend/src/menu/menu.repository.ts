import type { MenuItemRecord } from './menu.types';

export const MENU_REPOSITORY = Symbol('MENU_REPOSITORY');

export interface MenuRepository {
  /** All menu items, ordered by category, sort order, then name. */
  listItems(): Promise<MenuItemRecord[]>;
}
