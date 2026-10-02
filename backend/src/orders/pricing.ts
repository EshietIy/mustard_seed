import type { MenuItemRecord } from '../menu/menu.types';
import type { BranchRecord, RestaurantInfoRecord } from '../site/site.types';
import { formatClock, isOrderingOpen } from './hours';

export const MAX_QUANTITY = 20;

export type Fulfilment = 'delivery' | 'pickup';

export interface QuoteInput {
  fulfilment: Fulfilment;
  branchId: string;
  items: Array<{ menuItemId: string; quantity: number }>;
}

export type QuoteProblemCode =
  | 'ORDERING_CLOSED'
  | 'BRANCH_NOT_ACCEPTING_ORDERS'
  | 'EMPTY_CART'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_UNAVAILABLE'
  | 'ITEM_PRICE_UNAVAILABLE';

export interface QuoteProblem {
  code: QuoteProblemCode;
  message: string;
  menuItemId?: string;
}

export interface QuoteLine {
  menuItemId: string;
  name: string;
  unitPriceKobo: number | null;
  quantity: number;
  lineTotalKobo: number | null;
  isAvailable: boolean;
}

export interface Quote {
  lines: QuoteLine[];
  /** null while any line can't be priced. */
  subtotalKobo: number | null;
  deliveryFeeKobo: number;
  totalKobo: number | null;
  ordering: { open: boolean; opensAt: string; onlineOrdersCloseAt: string; timezone: string };
  problems: QuoteProblem[];
  canPlaceOrder: boolean;
}

export interface PricingContext {
  menu: MenuItemRecord[];
  info: RestaurantInfoRecord;
  branches: BranchRecord[];
  now: Date;
}

/**
 * The single source of truth for what an order costs and whether it can be placed.
 * Integer kobo only; prices always come from the menu, never from the client.
 */
export function buildQuote(ctx: PricingContext, input: QuoteInput): Quote {
  for (const { quantity } of input.items) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new RangeError(`quantity must be an integer from 1 to ${MAX_QUANTITY}`);
    }
  }

  const problems: QuoteProblem[] = [];
  const opensAt = ctx.info.opensAt.slice(0, 5);
  const closeAt = ctx.info.onlineOrdersCloseAt.slice(0, 5);
  const open = isOrderingOpen(
    { opensAt, onlineOrdersCloseAt: closeAt, timezone: ctx.info.timezone },
    ctx.now,
  );
  if (!open) {
    problems.push({
      code: 'ORDERING_CLOSED',
      message: `Online orders are open ${formatClock(opensAt)} – ${formatClock(closeAt)}. Please come back then.`,
    });
  }

  const branch = ctx.branches.find((b) => b.id === input.branchId);
  if (!branch?.onlineOrderingEnabled) {
    problems.push({
      code: 'BRANCH_NOT_ACCEPTING_ORDERS',
      message: branch
        ? `Online ordering is coming soon for ${branch.city}.`
        : 'Online ordering isn’t available for that branch.',
    });
  }

  if (input.items.length === 0) {
    problems.push({ code: 'EMPTY_CART', message: 'Your order is empty.' });
  }

  const byId = new Map(ctx.menu.map((m) => [m.id, m]));
  const lines: QuoteLine[] = [];
  for (const { menuItemId, quantity } of input.items) {
    const menuItem = byId.get(menuItemId);
    if (!menuItem) {
      problems.push({
        code: 'ITEM_NOT_FOUND',
        menuItemId,
        message: 'One of the items is no longer on the menu.',
      });
      continue;
    }
    if (!menuItem.isAvailable) {
      problems.push({
        code: 'ITEM_UNAVAILABLE',
        menuItemId,
        message: `${menuItem.name} has just sold out.`,
      });
    } else if (menuItem.priceKobo === null) {
      problems.push({
        code: 'ITEM_PRICE_UNAVAILABLE',
        menuItemId,
        message: `${menuItem.name} can’t be ordered online yet.`,
      });
    }
    lines.push({
      menuItemId,
      name: menuItem.name,
      unitPriceKobo: menuItem.priceKobo,
      quantity,
      lineTotalKobo: menuItem.priceKobo === null ? null : menuItem.priceKobo * quantity,
      isAvailable: menuItem.isAvailable,
    });
  }

  const priced =
    lines.length > 0 &&
    lines.length === input.items.length &&
    lines.every((l) => l.lineTotalKobo !== null);
  const subtotalKobo = priced ? lines.reduce((sum, l) => sum + (l.lineTotalKobo ?? 0), 0) : null;
  const deliveryFeeKobo = input.fulfilment === 'delivery' ? ctx.info.deliveryFeeKobo : 0;

  return {
    lines,
    subtotalKobo,
    deliveryFeeKobo,
    totalKobo: subtotalKobo === null ? null : subtotalKobo + deliveryFeeKobo,
    ordering: { open, opensAt, onlineOrdersCloseAt: closeAt, timezone: ctx.info.timezone },
    problems,
    canPlaceOrder: problems.length === 0 && subtotalKobo !== null,
  };
}
