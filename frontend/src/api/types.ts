/**
 * API contract for the endpoints the frontend uses. Duplicated from the backend on purpose
 * (AGENT.md §2: no code is shared across frontend/ and backend/).
 */

export type MenuCategoryId = 'calabar_classics' | 'swallow_sides' | 'continental' | 'drinks';

export interface MenuImage {
  thumbnailUrl: string;
  fullUrl: string;
}

export interface MenuItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Integer kobo; null until the real price is supplied. */
  priceKobo: number | null;
  isHouseSignature: boolean;
  isFreshJuice: boolean;
  isAvailable: boolean;
  image: MenuImage | null;
}

export interface MenuCategory {
  id: MenuCategoryId;
  label: string;
  items: MenuItem[];
}

export interface Menu {
  categories: MenuCategory[];
}

export interface Branch {
  id: string;
  city: string;
  state: string;
  role: 'headquarters' | 'branch';
  /** null until supplied: rendered as a placeholder. */
  streetAddress: string | null;
  onlineOrderingEnabled: boolean;
}

export interface SiteInfo {
  name: string;
  phoneWhatsapp: string | null;
  hours: { opensAt: string; closesAt: string; onlineOrdersCloseAt: string; timezone: string };
  delivery: { feeKobo: number; area: string };
  branches: Branch[];
}
