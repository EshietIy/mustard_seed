import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '@/api/types';
import { CART_STORAGE_KEY, MAX_QUANTITY, useCartStore } from './cart';

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'i-1',
    slug: 'edikang-ikong',
    name: 'Edikang Ikong',
    description: '',
    priceKobo: 450000,
    isHouseSignature: true,
    isFreshJuice: false,
    isAvailable: true,
    image: null,
    optionGroups: [],
    ...overrides,
  };
}

describe('cart store', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('starts empty', () => {
    const cart = useCartStore();
    expect(cart.count).toBe(0);
    expect(cart.isEmpty).toBe(true);
    expect(cart.subtotalKobo).toBe(0);
  });

  it('adds items and increments the same item instead of duplicating it', () => {
    const cart = useCartStore();
    cart.add(item());
    cart.add(item());
    cart.add(item({ id: 'i-2', name: 'Zobo', priceKobo: 80000 }));
    expect(cart.lines).toHaveLength(2);
    expect(cart.count).toBe(3);
    expect(cart.subtotalKobo).toBe(450000 * 2 + 80000);
  });

  it('refuses unavailable items', () => {
    const cart = useCartStore();
    expect(cart.add(item({ isAvailable: false }))).toBe(false);
    expect(cart.count).toBe(0);
  });

  it('caps the quantity per line', () => {
    const cart = useCartStore();
    for (let i = 0; i < MAX_QUANTITY + 5; i++) cart.add(item());
    expect(cart.count).toBe(MAX_QUANTITY);
  });

  it('decrements and removes a line at zero', () => {
    const cart = useCartStore();
    cart.add(item());
    cart.add(item());
    cart.decrement('i-1');
    expect(cart.count).toBe(1);
    cart.decrement('i-1');
    expect(cart.isEmpty).toBe(true);
  });

  it('removes a line and clears the cart', () => {
    const cart = useCartStore();
    cart.add(item());
    cart.add(item({ id: 'i-2' }));
    cart.remove('i-1');
    expect(cart.lines.map((l) => l.itemId)).toEqual(['i-2']);
    cart.clear();
    expect(cart.isEmpty).toBe(true);
  });

  it('has no subtotal while any line is missing its price', () => {
    const cart = useCartStore();
    cart.add(item());
    cart.add(item({ id: 'i-2', priceKobo: null }));
    expect(cart.subtotalKobo).toBeNull();
  });

  it('persists to and restores from localStorage', () => {
    const cart = useCartStore();
    cart.add(item());
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '{}')).toMatchObject({
      lines: [{ itemId: 'i-1', quantity: 1 }],
    });
    setActivePinia(createPinia());
    expect(useCartStore().count).toBe(1);
  });

  it('ignores corrupted stored data', () => {
    localStorage.setItem(CART_STORAGE_KEY, '{not json');
    expect(useCartStore().count).toBe(0);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ lines: [{ itemId: 5 }] }));
    setActivePinia(createPinia());
    expect(useCartStore().count).toBe(0);
  });

  it('keeps working when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const cart = useCartStore();
    cart.add(item());
    expect(cart.count).toBe(1);
  });

  it('reconciles with the latest menu: updates details, drops removed items, flags sold out', () => {
    const cart = useCartStore();
    cart.add(item({ id: 'keep', name: 'Old name', priceKobo: 100 }));
    cart.add(item({ id: 'gone' }));
    cart.add(item({ id: 'soldout' }));
    const changes = cart.reconcile([
      item({ id: 'keep', name: 'New name', priceKobo: 200 }),
      item({ id: 'soldout', isAvailable: false }),
    ]);
    expect(cart.lines.map((l) => [l.itemId, l.name, l.priceKobo, l.isAvailable])).toEqual([
      ['keep', 'New name', 200, true],
      ['soldout', 'Edikang Ikong', 450000, false],
    ]);
    expect(changes).toEqual({ removed: 1, unavailable: 1, needsChoice: 0 });
    expect(cart.hasUnavailable).toBe(true);
  });

  describe('with options', () => {
    const protein = {
      id: 'g-protein',
      name: 'Soup protein',
      minChoices: 1,
      maxChoices: 1,
      options: [
        { id: 'o-beef', name: 'Beef', priceDeltaKobo: 0, isAvailable: true },
        { id: 'o-chicken', name: 'Chicken', priceDeltaKobo: 50000, isAvailable: true },
      ],
    };
    const soup = (overrides: Partial<MenuItem> = {}) =>
      item({
        id: 'soup',
        name: 'Afang Soup',
        priceKobo: 400000,
        optionGroups: [protein],
        ...overrides,
      });

    it('keeps the same item with different choices as separate lines', () => {
      const cart = useCartStore();
      cart.add(soup(), ['o-beef']);
      cart.add(soup(), ['o-chicken']);
      cart.add(soup(), ['o-beef']);
      expect(cart.lines.map((l) => [l.quantity, l.options.map((o) => o.name)])).toEqual([
        [2, ['Beef']],
        [1, ['Chicken']],
      ]);
      expect(new Set(cart.lines.map((l) => l.key)).size).toBe(2);
    });

    it('prices a line as the base price plus its options', () => {
      const cart = useCartStore();
      cart.add(soup(), ['o-chicken']);
      cart.add(soup(), ['o-chicken']);
      expect(cart.subtotalKobo).toBe(2 * 450000);
    });

    it('treats the same choices in any order as one line', () => {
      const cart = useCartStore();
      const both = { ...protein, maxChoices: 2 };
      cart.add(soup({ optionGroups: [both] }), ['o-beef', 'o-chicken']);
      cart.add(soup({ optionGroups: [both] }), ['o-chicken', 'o-beef']);
      expect(cart.lines).toHaveLength(1);
      expect(cart.lines[0]!.quantity).toBe(2);
    });

    it('changes quantities per line by its key', () => {
      const cart = useCartStore();
      cart.add(soup(), ['o-beef']);
      cart.add(soup(), ['o-chicken']);
      const chicken = cart.lines[1]!.key;
      cart.increment(chicken);
      cart.decrement(cart.lines[0]!.key);
      expect(cart.lines.map((l) => [l.options[0]!.name, l.quantity])).toEqual([['Chicken', 2]]);
      cart.remove(chicken);
      expect(cart.isEmpty).toBe(true);
    });

    it('restores a cart saved before options existed', () => {
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({
          lines: [
            { itemId: 'zobo', name: 'Zobo', priceKobo: 80000, quantity: 2, isAvailable: true },
          ],
        }),
      );
      const cart = useCartStore();
      expect(cart.lines).toEqual([
        expect.objectContaining({ key: 'zobo', itemId: 'zobo', quantity: 2, options: [] }),
      ]);
    });

    it('flags a line whose choice is missing or no longer offered, so checkout can be fixed', () => {
      const cart = useCartStore();
      cart.add(soup(), ['o-beef']);
      cart.add(soup(), ['o-chicken']);
      // A line saved before the soup had a required protein:
      cart.add(item({ id: 'soup', name: 'Afang Soup', priceKobo: 400000 }));
      const changes = cart.reconcile([
        soup({
          optionGroups: [
            {
              ...protein,
              options: [
                { id: 'o-chicken', name: 'Chicken', priceDeltaKobo: 70000, isAvailable: true },
              ],
            },
          ],
        }),
      ]);
      expect(cart.lines.map((l) => [l.options.map((o) => o.name), l.needsChoice])).toEqual([
        [['Beef'], true],
        [['Chicken'], false],
        [[], true],
      ]);
      expect(cart.lines[1]!.options[0]!.priceDeltaKobo).toBe(70000);
      expect(changes.needsChoice).toBe(2);
      expect(cart.hasProblems).toBe(true);
    });

    it('flags a line whose chosen option has been switched off', () => {
      const cart = useCartStore();
      cart.add(soup(), ['o-beef']);
      cart.reconcile([
        soup({
          optionGroups: [
            {
              ...protein,
              options: [{ ...protein.options[0]!, isAvailable: false }, protein.options[1]!],
            },
          ],
        }),
      ]);
      expect(cart.lines[0]!.needsChoice).toBe(true);
    });
  });
});
