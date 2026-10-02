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
}
