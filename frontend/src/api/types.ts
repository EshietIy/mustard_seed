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

export type Fulfilment = 'delivery' | 'pickup';

export interface QuoteLine {
  menuItemId: string;
  name: string;
  unitPriceKobo: number | null;
  quantity: number;
  lineTotalKobo: number | null;
  isAvailable: boolean;
}

export interface QuoteProblem {
  code: string;
  message: string;
  menuItemId?: string;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalKobo: number | null;
  deliveryFeeKobo: number;
  totalKobo: number | null;
  ordering: { open: boolean; opensAt: string; onlineOrdersCloseAt: string; timezone: string };
  problems: QuoteProblem[];
  canPlaceOrder: boolean;
}

export interface OrderLine {
  menuItemId: string;
  name: string;
  unitPriceKobo: number;
  quantity: number;
  lineTotalKobo: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  fulfilment: Fulfilment;
  branch: { id: string; city: string };
  items: OrderLine[];
  subtotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  currency: 'NGN';
  contact: { fullName: string; phone: string };
  delivery: { streetAddress: string; city: string } | null;
  createdAt: string;
  /** ISO time after which an unpaid order expires. */
  paymentExpiresAt: string;
  /** Set when payment clears: estimated arrival (delivery) or ready time (pickup). */
  estimatedReadyAt?: string | null;
  payment: { status: string; channel: string | null; paidAt: string | null } | null;
}
