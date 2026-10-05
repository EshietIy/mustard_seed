/** Display order and labels of the menu tabs (docs/landing-page.pdf). */
export const MENU_CATEGORIES = [
  { id: 'calabar_classics', label: 'Calabar classics' },
  { id: 'swallow_sides', label: 'Swallow & sides' },
  { id: 'continental', label: 'Continental' },
  { id: 'drinks', label: 'Drinks' },
] as const;

export type MenuCategoryId = (typeof MENU_CATEGORIES)[number]['id'];

export interface MenuItemRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: MenuCategoryId;
  /** Integer kobo; null until the real price is supplied. */
  priceKobo: number | null;
  isHouseSignature: boolean;
  isFreshJuice: boolean;
  isAvailable: boolean;
  /** Storage object key prefix; null shows the "Photo coming" placeholder. */
  imagePath: string | null;
  sortOrder: number;
  /** Choices offered on this item, already resolved (see menu-options.ts). Empty if none. */
  optionGroups: MenuOptionGroup[];
}

/** An option as offered on one item: exclusions removed, that item's price applied. */
export interface MenuOption {
  id: string;
  name: string;
  /** Added to the item's base price, in kobo. */
  priceDeltaKobo: number;
  /** False when staff have switched it off; shown but not choosable. */
  isAvailable: boolean;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  /** min 1 / max 1 = required single choice; min 0 = optional; max > 1 = several. */
  minChoices: number;
  maxChoices: number;
  options: MenuOption[];
}
