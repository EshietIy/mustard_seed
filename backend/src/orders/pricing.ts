import type { MenuItemRecord, MenuOptionGroup } from '../menu/menu.types';
import type { BranchRecord, RestaurantInfoRecord } from '../site/site.types';
import { formatClock, isOrderingOpen } from './hours';

export const MAX_QUANTITY = 20;

export type Fulfilment = 'delivery' | 'pickup';

export interface QuoteInput {
  fulfilment: Fulfilment;
  branchId: string;
  /** optionIds: the chosen options for this line (none for items without option groups). */
  items: Array<{ menuItemId: string; quantity: number; optionIds?: string[] }>;
}

export type QuoteProblemCode =
  | 'ORDERING_CLOSED'
  | 'BRANCH_NOT_ACCEPTING_ORDERS'
  | 'EMPTY_CART'
  | 'ITEM_NOT_FOUND'
  | 'ITEM_UNAVAILABLE'
  | 'ITEM_PRICE_UNAVAILABLE'
  | 'OPTION_NOT_OFFERED'
  | 'OPTION_UNAVAILABLE'
  | 'OPTION_REQUIRED'
  | 'OPTION_TOO_MANY';

export interface QuoteProblem {
  code: QuoteProblemCode;
  message: string;
  menuItemId?: string;
  /** Option problems: which line and group, so the site can show the error next to it. */
  lineIndex?: number;
  groupId?: string;
  optionId?: string;
}

/** A chosen option as priced on a line; copied onto the order line as a snapshot. */
export interface QuoteLineOption {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  priceDeltaKobo: number;
}

export interface QuoteLine {
  menuItemId: string;
  name: string;
  unitPriceKobo: number | null;
  quantity: number;
  lineTotalKobo: number | null;
  isAvailable: boolean;
  /** Chosen options in menu order; unitPriceKobo already includes their price differences. */
  options: QuoteLineOption[];
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
  input.items.forEach((requested, lineIndex) => {
    const priced = priceLine(byId, requested, lineIndex);
    problems.push(...priced.problems);
    if (priced.line) lines.push(priced.line);
  });

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

/**
 * Prices one requested line from the live menu and lists its problems (unknown, sold out or
 * unpriced item; invalid options). Shared by quotes, orders and the cart, so they always agree.
 * line is null only when the item is not on the menu.
 */
export function priceLine(
  menuById: ReadonlyMap<string, MenuItemRecord>,
  requested: { menuItemId: string; quantity: number; optionIds?: string[] },
  lineIndex: number,
): { line: QuoteLine | null; problems: QuoteProblem[] } {
  const { menuItemId, quantity, optionIds = [] } = requested;
  const problems: QuoteProblem[] = [];
  const menuItem = menuById.get(menuItemId);
  if (!menuItem) {
    problems.push({
      code: 'ITEM_NOT_FOUND',
      menuItemId,
      message: 'One of the items is no longer on the menu.',
    });
    return { line: null, problems };
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
  const options = chooseOptions(menuItem, optionIds, lineIndex, problems);
  const unitPriceKobo =
    menuItem.priceKobo === null
      ? null
      : options.reduce((sum, o) => sum + o.priceDeltaKobo, menuItem.priceKobo);
  return {
    line: {
      menuItemId,
      name: menuItem.name,
      unitPriceKobo,
      quantity,
      lineTotalKobo: unitPriceKobo === null ? null : unitPriceKobo * quantity,
      isAvailable: menuItem.isAvailable,
      options,
    },
    problems,
  };
}

const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function choiceMessage(group: MenuOptionGroup, itemName: string): string {
  const what = group.name.toLowerCase();
  if (group.minChoices === 1 && group.maxChoices === 1) {
    return `Choose ${article(what)} ${what} for ${itemName}.`;
  }
  if (group.minChoices === 1) return `Choose at least one ${what} for ${itemName}.`;
  return `Choose at least ${group.minChoices} ${what} for ${itemName}.`;
}

/**
 * Validates one line's chosen options against what the item offers (AGENT.md section 14) and
 * returns the valid ones in menu order. Anything not offered on this item (another item's or
 * group's option, an excluded or archived option, an unknown id, or a repeat) is refused.
 */
function chooseOptions(
  menuItem: MenuItemRecord,
  optionIds: string[],
  lineIndex: number,
  problems: QuoteProblem[],
): QuoteLineOption[] {
  const offered = new Map(
    menuItem.optionGroups.flatMap((group) =>
      group.options.map((o) => [o.id, { group, option: o }]),
    ),
  );
  const seen = new Set<string>();
  for (const optionId of optionIds) {
    if (!offered.has(optionId) || seen.has(optionId)) {
      problems.push({
        code: 'OPTION_NOT_OFFERED',
        menuItemId: menuItem.id,
        lineIndex,
        optionId,
        message: `One of the choices for ${menuItem.name} is no longer offered. Please choose again.`,
      });
    }
    seen.add(optionId);
  }

  const chosen: QuoteLineOption[] = [];
  for (const group of menuItem.optionGroups) {
    const picked = group.options.filter((o) => seen.has(o.id));
    for (const option of picked.filter((o) => !o.isAvailable)) {
      problems.push({
        code: 'OPTION_UNAVAILABLE',
        menuItemId: menuItem.id,
        lineIndex,
        groupId: group.id,
        optionId: option.id,
        message: `${option.name} isn’t available right now for ${menuItem.name}. Please choose another.`,
      });
    }
    if (picked.length < group.minChoices) {
      problems.push({
        code: 'OPTION_REQUIRED',
        menuItemId: menuItem.id,
        lineIndex,
        groupId: group.id,
        message: choiceMessage(group, menuItem.name),
      });
    } else if (picked.length > group.maxChoices) {
      const what = group.name.toLowerCase();
      problems.push({
        code: 'OPTION_TOO_MANY',
        menuItemId: menuItem.id,
        lineIndex,
        groupId: group.id,
        message:
          group.maxChoices === 1
            ? `Choose only one ${what} for ${menuItem.name}.`
            : `Choose up to ${group.maxChoices} ${what} for ${menuItem.name}.`,
      });
    }
    chosen.push(
      ...picked.map((o) => ({
        id: o.id,
        groupId: group.id,
        groupName: group.name,
        name: o.name,
        priceDeltaKobo: o.priceDeltaKobo,
      })),
    );
  }
  return chosen;
}
