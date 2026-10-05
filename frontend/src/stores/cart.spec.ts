import { createPinia, setActivePinia } from 'pinia';
import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '@/api/types';
import { bodyOf, routeFetch } from '@/test-utils/fetch';
import { useAuthStore } from './auth';
import { CART_STORAGE_KEY, MAX_QUANTITY, useCartStore } from './cart';
import { useToastStore } from './toast';

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

  it('refuses unavailable items', async () => {
    const cart = useCartStore();
    await expect(cart.add(item({ isAvailable: false }))).resolves.toBe(false);
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

  describe('signed in (server cart)', () => {
    const serverLine = (overrides: Record<string, unknown> = {}) => ({
      id: 'line-1',
      menuItemId: 'zobo',
      name: 'Zobo',
      optionIds: [],
      options: [],
      quantity: 2,
      unitPriceKobo: 80000,
      lineTotalKobo: 160000,
      isAvailable: true,
      problems: [],
      priceChange: null,
      ...overrides,
    });
    const serverCart = (lines: unknown[] = [serverLine()]) => ({
      lines,
      itemCount: 2,
      subtotalKobo: 160000,
      canCheckout: true,
    });
    const zobo = () =>
      item({ id: 'zobo', name: 'Zobo', priceKobo: 80000, isHouseSignature: false });

    async function signIn() {
      useAuthStore().status = 'signed-in';
      await flushPromises();
    }

    it('loads the saved cart after sign-in', async () => {
      routeFetch({ 'GET /cart': () => Response.json(serverCart()) });
      const cart = useCartStore();
      await signIn();
      expect(cart.lines.map((l) => [l.name, l.quantity, l.unitPriceKobo])).toEqual([
        ['Zobo', 2, 80000],
      ]);
      expect(cart.subtotalKobo).toBe(160000);
    });

    it('merges the device cart into the saved cart on sign-in, then forgets the device copy', async () => {
      const fetchMock = routeFetch({
        'POST /cart/merge': () => Response.json({ cart: serverCart(), skipped: 1 }),
      });
      const cart = useCartStore();
      cart.add(zobo());
      cart.add(zobo());
      await signIn();
      expect(bodyOf(fetchMock, 'POST /cart/merge')).toEqual({
        lines: [{ menuItemId: 'zobo', optionIds: [], quantity: 2 }],
      });
      expect(cart.lines.map((l) => l.name)).toEqual(['Zobo']);
      expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '{}').lines).toEqual([]);
      expect(useToastStore().messages[0]?.text).toBe(
        'Some items from before you signed in can no longer be ordered and were left out.',
      );
    });

    it('sets the new quantity on the server when adding', async () => {
      const fetchMock = routeFetch({
        'GET /cart': () => Response.json(serverCart()),
        'PUT /cart/lines': () => Response.json(serverCart([serverLine({ quantity: 3 })])),
      });
      const cart = useCartStore();
      await signIn();
      await expect(cart.add(zobo())).resolves.toBe(true);
      expect(bodyOf(fetchMock, 'PUT /cart/lines')).toEqual({
        menuItemId: 'zobo',
        optionIds: [],
        quantity: 3,
      });
      expect(cart.lines[0]!.quantity).toBe(3);
    });

    it('removes a line on the server when its quantity reaches zero', async () => {
      const fetchMock = routeFetch({
        'GET /cart': () => Response.json(serverCart([serverLine({ quantity: 1 })])),
        'DELETE /cart/lines/line-1': () => Response.json(serverCart([])),
      });
      const cart = useCartStore();
      await signIn();
      await cart.decrement(cart.lines[0]!.key);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://api.test/api/v1/cart/lines/line-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(cart.isEmpty).toBe(true);
    });

    it('flags a price change and accepts it by setting the line again', async () => {
      const changed = serverLine({
        unitPriceKobo: 90000,
        priceChange: { fromKobo: 80000, toKobo: 90000 },
      });
      const fetchMock = routeFetch({
        'GET /cart': () => Response.json({ ...serverCart([changed]), canCheckout: false }),
        'PUT /cart/lines': () => Response.json(serverCart([serverLine({ unitPriceKobo: 90000 })])),
      });
      const cart = useCartStore();
      await signIn();
      expect(cart.lines[0]!.priceChange).toEqual({ fromKobo: 80000, toKobo: 90000 });
      expect(cart.hasProblems).toBe(true);
      await cart.acceptPrice(cart.lines[0]!.key);
      expect(bodyOf(fetchMock, 'PUT /cart/lines')).toMatchObject({ quantity: 2 });
      expect(cart.hasProblems).toBe(false);
    });

    it('shows the server problem on a line and blocks checkout', async () => {
      routeFetch({
        'GET /cart': () =>
          Response.json({
            ...serverCart([
              serverLine({
                isAvailable: false,
                problems: [{ code: 'ITEM_UNAVAILABLE', message: 'Zobo has just sold out.' }],
              }),
            ]),
            canCheckout: false,
          }),
      });
      const cart = useCartStore();
      await signIn();
      expect(cart.lines[0]!.problems).toEqual(['Zobo has just sold out.']);
      expect(cart.hasProblems).toBe(true);
    });

    it('keeps the cart and explains when the server refuses a change', async () => {
      routeFetch({
        'GET /cart': () => Response.json(serverCart()),
        'PUT /cart/lines': () =>
          Response.json(
            { error: { code: 'ITEM_UNAVAILABLE', message: 'Zobo has just sold out.' } },
            { status: 422 },
          ),
      });
      const cart = useCartStore();
      await signIn();
      await expect(cart.add(zobo())).resolves.toBe(false);
      expect(cart.lines[0]!.quantity).toBe(2);
      expect(useToastStore().messages[0]?.text).toBe('Zobo has just sold out.');
    });

    it('goes back to an empty device cart after signing out', async () => {
      routeFetch({ 'GET /cart': () => Response.json(serverCart()) });
      const cart = useCartStore();
      await signIn();
      useAuthStore().status = 'signed-out';
      await flushPromises();
      expect(cart.isEmpty).toBe(true);
    });
  });
});
