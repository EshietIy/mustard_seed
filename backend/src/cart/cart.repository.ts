export const CART_REPOSITORY = Symbol('CART_REPOSITORY');

export interface CartLineRecord {
  id: string;
  menuItemId: string;
  /** Sorted, unique: the same choices always make the same line. */
  optionIds: string[];
  quantity: number;
  /** The unit price the customer last saw; only used to flag a price change. */
  seenUnitPriceKobo: number | null;
}

export interface CartLineWrite {
  menuItemId: string;
  optionIds: string[];
  quantity: number;
  seenUnitPriceKobo: number | null;
}

/** One implicit cart per user (AGENT.md section 13); every method is scoped to the user. */
export interface CartRepository {
  list(userId: string): Promise<CartLineRecord[]>;
  /** Creates the line or sets its quantity (set, never increment). */
  setLine(userId: string, line: CartLineWrite): Promise<void>;
  /** Returns false when the user has no such line. */
  deleteLine(userId: string, lineId: string): Promise<boolean>;
  clear(userId: string): Promise<void>;
  /** Adds lines, summing quantities with identical lines (capped at 20). Atomic. */
  merge(userId: string, lines: CartLineWrite[]): Promise<void>;
}
