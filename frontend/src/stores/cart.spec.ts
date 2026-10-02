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
    expect(changes).toEqual({ removed: 1, unavailable: 1 });
    expect(cart.hasUnavailable).toBe(true);
  });
});
