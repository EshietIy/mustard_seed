import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { MenuItem } from '@/api/types';

export const CART_STORAGE_KEY = 'ms-cart-v1';
export const MAX_QUANTITY = 20;

/** A chosen option as shown in the cart (display only; the server prices it at checkout). */
export interface CartLineOption {
  id: string;
  name: string;
  priceDeltaKobo: number;
}

export interface CartLine {
  /** Identifies the line: the item plus its chosen options (just the item id when none). */
  key: string;
  itemId: string;
  name: string;
  /** Display only. The server computes every real total at checkout. */
  priceKobo: number | null;
  quantity: number;
  isAvailable: boolean;
  options: CartLineOption[];
  /** A chosen option is no longer offered, or a required choice is missing. */
  needsChoice: boolean;
}

export function lineKey(itemId: string, optionIds: readonly string[]): string {
  return optionIds.length === 0 ? itemId : [itemId, ...[...optionIds].sort()].join('|');
}

function isStoredLine(value: unknown): value is Omit<
  CartLine,
  'key' | 'options' | 'needsChoice'
> & {
  options?: unknown;
  needsChoice?: unknown;
} {
  if (typeof value !== 'object' || value === null) return false;
  const l = value as Record<string, unknown>;
  return (
    typeof l.itemId === 'string' &&
    typeof l.name === 'string' &&
    (l.priceKobo === null || Number.isInteger(l.priceKobo)) &&
    Number.isInteger(l.quantity) &&
    (l.quantity as number) > 0 &&
    typeof l.isAvailable === 'boolean' &&
    (l.options === undefined || Array.isArray(l.options))
  );
}

function isOption(value: unknown): value is CartLineOption {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.id === 'string' && typeof o.name === 'string' && Number.isInteger(o.priceDeltaKobo)
  );
}

/**
 * The cart lives on the device (localStorage) so it survives reloads and a later sign-in redirect.
 * It holds no secrets; storage failures (private mode, blocked storage) are ignored. Carts saved
 * before options existed load with no options.
 */
function readStoredLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { lines?: unknown };
    if (!Array.isArray(parsed.lines) || !parsed.lines.every(isStoredLine)) return [];
    return parsed.lines.map((l) => {
      const options = Array.isArray(l.options) ? l.options.filter(isOption) : [];
      return {
        key: lineKey(
          l.itemId,
          options.map((o) => o.id),
        ),
        itemId: l.itemId,
        name: l.name,
        priceKobo: l.priceKobo,
        quantity: Math.min(l.quantity, MAX_QUANTITY),
        isAvailable: l.isAvailable,
        options,
        needsChoice: l.needsChoice === true,
      };
    });
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

/** The item's current version of the chosen options, or null if any is no longer choosable. */
function resolveOptions(item: MenuItem, optionIds: readonly string[]): CartLineOption[] | null {
  const chosen: CartLineOption[] = [];
  for (const group of item.optionGroups) {
    const picked = group.options.filter((o) => optionIds.includes(o.id));
    if (picked.length < group.minChoices || picked.length > group.maxChoices) return null;
    if (picked.some((o) => !o.isAvailable)) return null;
    chosen.push(
      ...picked.map((o) => ({ id: o.id, name: o.name, priceDeltaKobo: o.priceDeltaKobo })),
    );
  }
  return chosen.length === optionIds.length ? chosen : null;
}

/** Whether these choices can still be ordered on the item as it is now. */
export function canChooseOptions(item: MenuItem, optionIds: readonly string[]): boolean {
  return resolveOptions(item, optionIds) !== null;
}

const unitPrice = (line: CartLine): number | null =>
  line.priceKobo === null
    ? null
    : line.options.reduce((sum, o) => sum + o.priceDeltaKobo, line.priceKobo);

export const useCartStore = defineStore('cart', () => {
  const lines = ref<CartLine[]>(readStoredLines());

  // Saved synchronously so nothing is lost if the tab closes straight after a change.
  watch(lines, (value) => writeStoredLines(value), { deep: true, flush: 'sync' });

  const count = computed(() => lines.value.reduce((n, l) => n + l.quantity, 0));
  const isEmpty = computed(() => lines.value.length === 0);
  const hasUnavailable = computed(() => lines.value.some((l) => !l.isAvailable));
  /** Anything the customer must fix before checkout: sold out, or a choice to make again. */
  const hasProblems = computed(() => lines.value.some((l) => !l.isAvailable || l.needsChoice));
  /** null while any line has no price yet ([PRICE] placeholder). */
  const subtotalKobo = computed<number | null>(() =>
    lines.value.some((l) => l.priceKobo === null)
      ? null
      : lines.value.reduce((sum, l) => sum + (unitPrice(l) ?? 0) * l.quantity, 0),
  );

  const find = (key: string) => lines.value.find((l) => l.key === key);

  /**
   * Adds one of the item with the given choices (the choice sheet has already checked them).
   * Returns false if it cannot be added (sold out or at the quantity limit).
   */
  function add(item: MenuItem, optionIds: readonly string[] = []): boolean {
    if (!item.isAvailable) return false;
    const key = lineKey(item.id, optionIds);
    const line = find(key);
    if (line) {
      if (line.quantity >= MAX_QUANTITY) return false;
      line.quantity += 1;
      return true;
    }
    const options = item.optionGroups
      .flatMap((g) => g.options)
      .filter((o) => optionIds.includes(o.id))
      .map((o) => ({ id: o.id, name: o.name, priceDeltaKobo: o.priceDeltaKobo }));
    lines.value.push({
      key,
      itemId: item.id,
      name: item.name,
      priceKobo: item.priceKobo,
      quantity: 1,
      isAvailable: true,
      options,
      needsChoice: resolveOptions(item, optionIds) === null,
    });
    return true;
  }

  function increment(key: string): void {
    const line = find(key);
    if (line && line.isAvailable && line.quantity < MAX_QUANTITY) line.quantity += 1;
  }

  function decrement(key: string): void {
    const line = find(key);
    if (!line) return;
    if (line.quantity <= 1) remove(key);
    else line.quantity -= 1;
  }

  function remove(key: string): void {
    lines.value = lines.value.filter((l) => l.key !== key);
  }

  function clear(): void {
    lines.value = [];
  }

  /** Brings stored lines up to date with the live menu (names, prices, availability, choices). */
  function reconcile(menuItems: MenuItem[]): {
    removed: number;
    unavailable: number;
    needsChoice: number;
  } {
    const byId = new Map(menuItems.map((i) => [i.id, i]));
    const before = lines.value.length;
    lines.value = lines.value
      .filter((l) => byId.has(l.itemId))
      .map((l) => {
        const item = byId.get(l.itemId) as MenuItem;
        const options = resolveOptions(
          item,
          l.options.map((o) => o.id),
        );
        return {
          ...l,
          name: item.name,
          priceKobo: item.priceKobo,
          isAvailable: item.isAvailable,
          options: options ?? l.options,
          needsChoice: options === null,
        };
      });
    return {
      removed: before - lines.value.length,
      unavailable: lines.value.filter((l) => !l.isAvailable).length,
      needsChoice: lines.value.filter((l) => l.needsChoice).length,
    };
  }

  return {
    lines,
    count,
    isEmpty,
    hasUnavailable,
    hasProblems,
    subtotalKobo,
    add,
    increment,
    decrement,
    remove,
    clear,
    reconcile,
  };
});
