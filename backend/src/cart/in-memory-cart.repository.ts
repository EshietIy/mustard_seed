import { randomUUID } from 'node:crypto';
import type { CartLineRecord, CartLineWrite, CartRepository } from './cart.repository';

const MAX = 20;
const same = (a: CartLineWrite, b: CartLineRecord) =>
  a.menuItemId === b.menuItemId && a.optionIds.join() === b.optionIds.join();

/** In-memory CartRepository for unit tests. */
export class InMemoryCartRepository implements CartRepository {
  readonly carts = new Map<string, CartLineRecord[]>();

  private cart(userId: string): CartLineRecord[] {
    if (!this.carts.has(userId)) this.carts.set(userId, []);
    return this.carts.get(userId) as CartLineRecord[];
  }

  list(userId: string): Promise<CartLineRecord[]> {
    return Promise.resolve(structuredClone(this.cart(userId)));
  }

  setLine(userId: string, line: CartLineWrite): Promise<void> {
    const cart = this.cart(userId);
    const existing = cart.find((l) => same(line, l));
    if (existing) Object.assign(existing, line);
    else cart.push({ id: randomUUID(), ...line });
    return Promise.resolve();
  }

  deleteLine(userId: string, lineId: string): Promise<boolean> {
    const cart = this.cart(userId);
    const index = cart.findIndex((l) => l.id === lineId);
    if (index === -1) return Promise.resolve(false);
    cart.splice(index, 1);
    return Promise.resolve(true);
  }

  clear(userId: string): Promise<void> {
    this.carts.set(userId, []);
    return Promise.resolve();
  }

  merge(userId: string, lines: CartLineWrite[]): Promise<void> {
    const cart = this.cart(userId);
    for (const line of lines) {
      const existing = cart.find((l) => same(line, l));
      if (existing) {
        existing.quantity = Math.min(existing.quantity + line.quantity, MAX);
        existing.seenUnitPriceKobo ??= line.seenUnitPriceKobo;
      } else {
        cart.push({ id: randomUUID(), ...line, quantity: Math.min(line.quantity, MAX) });
      }
    }
    return Promise.resolve();
  }
}
