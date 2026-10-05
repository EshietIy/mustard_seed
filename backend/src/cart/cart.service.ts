import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MENU_REPOSITORY, type MenuRepository } from '../menu/menu.repository';
import type { MenuItemRecord } from '../menu/menu.types';
import { priceLine, type QuoteProblem } from '../orders/pricing';
import {
  CART_REPOSITORY,
  type CartLineRecord,
  type CartLineWrite,
  type CartRepository,
} from './cart.repository';

const MAX_QUANTITY = 20;

export interface CartLineView {
  id: string;
  menuItemId: string;
  name: string;
  optionIds: string[];
  options: Array<{ id: string; groupName: string; name: string; priceDeltaKobo: number }>;
  quantity: number;
  /** From the live menu; null while the item has no price yet. */
  unitPriceKobo: number | null;
  lineTotalKobo: number | null;
  isAvailable: boolean;
  /** Anything that must be fixed before checkout (sold out, choice no longer valid...). */
  problems: Array<Pick<QuoteProblem, 'code' | 'message' | 'groupId' | 'optionId'>>;
  /** Set when the price changed since the customer last saw this line. */
  priceChange: { fromKobo: number; toKobo: number } | null;
}

export interface CartView {
  lines: CartLineView[];
  itemCount: number;
  /** null while any line has no price yet. */
  subtotalKobo: number | null;
  /** True when there is something to order and nothing to fix. */
  canCheckout: boolean;
}

export interface CartLineInput {
  menuItemId: string;
  optionIds?: string[];
  quantity: number;
}

const sortedIds = (ids: string[] = []) => [...ids].sort();
const keyOf = (l: { menuItemId: string; optionIds: string[] }) =>
  [l.menuItemId, ...l.optionIds].join('|');

/**
 * The signed-in user's cart (AGENT.md section 13). Stores ids and quantities only; prices,
 * availability and problems are worked out from the live menu on every read, with the same
 * rules as quotes and orders.
 */
@Injectable()
export class CartService {
  constructor(
    @Inject(CART_REPOSITORY) private readonly repo: CartRepository,
    @Inject(MENU_REPOSITORY) private readonly menu: MenuRepository,
  ) {}

  async view(userId: string): Promise<CartView> {
    const [lines, menu] = await Promise.all([this.repo.list(userId), this.menuById()]);
    return toView(lines, menu);
  }

  /** Creates the line or sets its quantity; choices are validated as the item is added. */
  async setLine(userId: string, input: CartLineInput): Promise<CartView> {
    const optionIds = this.checkIds(input.optionIds);
    const menu = await this.menuById();
    const line = this.validLine(menu, { ...input, optionIds });
    if (!line.ok) {
      if (line.problems[0]?.code === 'ITEM_NOT_FOUND') {
        throw new NotFoundException({
          code: 'MENU_ITEM_NOT_FOUND',
          message: 'That item is no longer on the menu.',
        });
      }
      throw new UnprocessableEntityException({
        code: line.problems[0]?.code,
        message: line.problems[0]?.message,
        details: line.problems,
      });
    }
    await this.repo.setLine(userId, line.write);
    return this.view(userId);
  }

  async deleteLine(userId: string, lineId: string): Promise<CartView> {
    if (!(await this.repo.deleteLine(userId, lineId))) {
      throw new NotFoundException({
        code: 'CART_LINE_NOT_FOUND',
        message: 'That item is no longer in your order.',
      });
    }
    return this.view(userId);
  }

  async clear(userId: string): Promise<CartView> {
    await this.repo.clear(userId);
    return this.view(userId);
  }

  /**
   * Adds a guest's device cart after sign-in: identical lines are summed (capped at 20), and
   * lines that can no longer be ordered are skipped and counted, so the customer can be told.
   */
  async merge(
    userId: string,
    input: CartLineInput[],
  ): Promise<{ cart: CartView; skipped: number }> {
    const menu = await this.menuById();
    const combined = new Map<string, CartLineWrite>();
    let skipped = 0;
    for (const requested of input) {
      const optionIds = sortedIds(requested.optionIds);
      const line =
        new Set(optionIds).size === optionIds.length
          ? this.validLine(menu, { ...requested, optionIds })
          : null;
      if (!line?.ok) {
        skipped += 1;
        continue;
      }
      const existing = combined.get(keyOf(line.write));
      if (existing)
        existing.quantity = Math.min(existing.quantity + line.write.quantity, MAX_QUANTITY);
      else combined.set(keyOf(line.write), line.write);
    }
    if (combined.size > 0) await this.repo.merge(userId, [...combined.values()]);
    return { cart: await this.view(userId), skipped };
  }

  private checkIds(optionIds: string[] | undefined): string[] {
    const ids = sortedIds(optionIds);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid.',
        details: [{ field: 'optionIds', messages: ['Each option may appear only once'] }],
      });
    }
    return ids;
  }

  private validLine(
    menu: Map<string, MenuItemRecord>,
    input: { menuItemId: string; optionIds: string[]; quantity: number },
  ): { ok: true; write: CartLineWrite } | { ok: false; problems: QuoteProblem[] } {
    const { line, problems } = priceLine(menu, input, 0);
    if (!line || problems.length > 0) return { ok: false, problems };
    return {
      ok: true,
      write: {
        menuItemId: input.menuItemId,
        optionIds: input.optionIds,
        quantity: input.quantity,
        seenUnitPriceKobo: line.unitPriceKobo,
      },
    };
  }

  private async menuById(): Promise<Map<string, MenuItemRecord>> {
    return new Map((await this.menu.listItems()).map((m) => [m.id, m]));
  }
}

function toView(records: CartLineRecord[], menu: Map<string, MenuItemRecord>): CartView {
  const lines = records.flatMap((record, index): CartLineView[] => {
    const { line, problems } = priceLine(menu, record, index);
    // Items removed from the menu take their cart lines with them (database cascade).
    if (!line) return [];
    const priceChange =
      record.seenUnitPriceKobo !== null &&
      line.unitPriceKobo !== null &&
      record.seenUnitPriceKobo !== line.unitPriceKobo
        ? { fromKobo: record.seenUnitPriceKobo, toKobo: line.unitPriceKobo }
        : null;
    return [
      {
        id: record.id,
        menuItemId: record.menuItemId,
        name: line.name,
        optionIds: record.optionIds,
        options: line.options.map((o) => ({
          id: o.id,
          groupName: o.groupName,
          name: o.name,
          priceDeltaKobo: o.priceDeltaKobo,
        })),
        quantity: record.quantity,
        unitPriceKobo: line.unitPriceKobo,
        lineTotalKobo: line.lineTotalKobo,
        isAvailable: line.isAvailable,
        problems: problems.map((p) => ({
          code: p.code,
          message: p.message,
          ...(p.groupId ? { groupId: p.groupId } : {}),
          ...(p.optionId ? { optionId: p.optionId } : {}),
        })),
        priceChange,
      },
    ];
  });
  const priced = lines.every((l) => l.lineTotalKobo !== null);
  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalKobo: priced ? lines.reduce((sum, l) => sum + (l.lineTotalKobo ?? 0), 0) : null,
    canCheckout:
      lines.length > 0 && lines.every((l) => l.problems.length === 0 && l.priceChange === null),
  };
}
