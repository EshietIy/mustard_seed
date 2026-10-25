import type { MenuItemRecord } from './menu.types';

export const MENU_REPOSITORY = Symbol('MENU_REPOSITORY');

export interface MenuRepository {
  /**
   * Every dish on the menu (retired dishes excluded, so they cannot be shown, carted or
   * ordered), ordered by category, sort order, then name.
   */
  listItems(): Promise<MenuItemRecord[]>;
}
