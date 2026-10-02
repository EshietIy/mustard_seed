import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { MenuItem } from '@/api/types';

export const CART_STORAGE_KEY = 'ms-cart-v1';
export const MAX_QUANTITY = 20;

export interface CartLine {
  itemId: string;
  name: string;
  /** Display only. The server computes every real total at checkout. */
  priceKobo: number | null;
  quantity: number;
  isAvailable: boolean;
}

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Record<string, unknown>;
  return (
    typeof l.itemId === 'string' &&
    typeof l.name === 'string' &&
    (l.priceKobo === null || Number.isInteger(l.priceKobo)) &&
    Number.isInteger(l.quantity) &&
    (l.quantity as number) > 0 &&
    typeof l.isAvailable === 'boolean'
  );
}

/**
 * The cart lives on the device (localStorage) so it survives reloads and a later sign-in redirect.
 * It holds no secrets; storage failures (private mode, blocked storage) are ignored.
 */
function readStoredLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { lines?: unknown };
    if (!Array.isArray(parsed.lines) || !parsed.lines.every(isCartLine)) return [];
    return parsed.lines.map((l) => ({ ...l, quantity: Math.min(l.quantity, MAX_QUANTITY) }));
  } catch {
    return [];
  }
}

function writeStoredLines(lines: CartLine[]): void {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ lines }));
  } catch {
    // Storage unavailable: the cart still works for this visit.
  }
}

export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>(readStoredLines());

  // Saved synchronously so nothing is lost if the tab closes straight after a change.
  watch(lines, (value) => writeStoredLines(value), { deep: true, flush: 'sync' });

  const count = computed(() => lines.value.reduce((n, l) => n + l.quantity, 0));
  const isEmpty = computed(() => lines.value.length === 0);
  const hasUnavailable = computed(() => lines.value.some((l) => !l.isAvailable));
  /** null while any line has no price yet ([PRICE] placeholder). */
  const subtotalKobo = computed<number | null>(() =>
    lines.value.some((l) => l.priceKobo === null)
      ? null
      : lines.value.reduce((sum, l) => sum + (l.priceKobo ?? 0) * l.quantity, 0),
  );

  const find = (itemId: string) => lines.value.find((l) => l.itemId === itemId);

  /** Returns false if the item cannot be added (sold out or at the quantity limit). */
  function add(item: MenuItem): boolean {
    if (!item.isAvailable) return false;
    const line = find(item.id);
    if (line) {
      if (line.quantity >= MAX_QUANTITY) return false;
      line.quantity += 1;
      return true;
    }
    lines.value.push({
      itemId: item.id,
      name: item.name,
      priceKobo: item.priceKobo,
      quantity: 1,
      isAvailable: true,
    });
    return true;
  }

  function increment(itemId: string): void {
    const line = find(itemId);
    if (line && line.isAvailable && line.quantity < MAX_QUANTITY) line.quantity += 1;
  }

  function decrement(itemId: string): void {
    const line = find(itemId);
    if (!line) return;
    if (line.quantity <= 1) remove(itemId);
    else line.quantity -= 1;
  }

  function remove(itemId: string): void {
    lines.value = lines.value.filter((l) => l.itemId !== itemId);
  }

  function clear(): void {
    lines.value = [];
  }

  /** Brings stored lines up to date with the live menu (names, prices, availability). */
  function reconcile(menuItems: MenuItem[]): { removed: number; unavailable: number } {
    const byId = new Map(menuItems.map((i) => [i.id, i]));
    const before = lines.value.length;
    lines.value = lines.value
      .filter((l) => byId.has(l.itemId))
      .map((l) => {
        const item = byId.get(l.itemId) as MenuItem;
        return { ...l, name: item.name, priceKobo: item.priceKobo, isAvailable: item.isAvailable };
      });
    return {
      removed: before - lines.value.length,
      unavailable: lines.value.filter((l) => !l.isAvailable).length,
    };
  }

  return {
    lines,
    count,
    isEmpty,
    hasUnavailable,
    subtotalKobo,
    add,
    increment,
    decrement,
    remove,
    clear,
    reconcile,
  };
});
