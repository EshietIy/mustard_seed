import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import { api } from '@/api/client';
import { asApiError } from '@/api/errors';
import type { MenuItem } from '@/api/types';
import { useAuthStore } from './auth';
import { useToastStore } from './toast';

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
  /** Base price (display only). */
  priceKobo: number | null;
  /** Price of one, including the options; null until the item has a price. */
  unitPriceKobo: number | null;
  quantity: number;
  isAvailable: boolean;
  options: CartLineOption[];
  /** A chosen option is no longer offered, or a required choice is missing. */
  needsChoice: boolean;
  /** What must be fixed before checkout, in words (from the server). */
  problems: string[];
  /** The price changed since the customer last saw it; accept with acceptPrice(). */
  priceChange: { fromKobo: number; toKobo: number } | null;
  /** The server's id for this line (signed in only). */
  serverId?: string;
}

/** The server cart (GET/PUT/DELETE /cart), see AGENT.md section 13. */
interface ServerCart {
  lines: Array<{
    id: string;
    menuItemId: string;
    name: string;
    optionIds: string[];
    options: Array<{ id: string; name: string; priceDeltaKobo: number }>;
    quantity: number;
    unitPriceKobo: number | null;
    isAvailable: boolean;
    problems: Array<{ code: string; message: string }>;
    priceChange: { fromKobo: number; toKobo: number } | null;
  }>;
  subtotalKobo: number | null;
  canCheckout: boolean;
}

export function lineKey(itemId: string, optionIds: readonly string[]): string {
  return optionIds.length === 0 ? itemId : [itemId, ...[...optionIds].sort()].join('|');
}

interface StoredLine {
  itemId: string;
  name: string;
  priceKobo: number | null;
  quantity: number;
  isAvailable: boolean;
  options?: unknown;
  needsChoice?: unknown;
}

function isStoredLine(value: unknown): value is StoredLine {
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

const unitPrice = (priceKobo: number | null, options: CartLineOption[]) =>
  priceKobo === null ? null : options.reduce((sum, o) => sum + o.priceDeltaKobo, priceKobo);

function guestLine(l: {
  itemId: string;
  name: string;
  priceKobo: number | null;
  quantity: number;
  isAvailable: boolean;
  options: CartLineOption[];
  needsChoice?: boolean;
}): CartLine {
  return {
    key: lineKey(
      l.itemId,
      l.options.map((o) => o.id),
    ),
    itemId: l.itemId,
    name: l.name,
    priceKobo: l.priceKobo,
    unitPriceKobo: unitPrice(l.priceKobo, l.options),
    quantity: Math.min(l.quantity, MAX_QUANTITY),
    isAvailable: l.isAvailable,
    options: l.options,
    needsChoice: l.needsChoice === true,
    problems: [],
    priceChange: null,
  };
}

/**
 * A guest's cart lives on the device (localStorage) so it survives reloads and the sign-in
 * redirect. Storage failures (private mode, blocked storage) are ignored. Carts saved before
 * options existed load with no options.
 */
function readStoredLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { lines?: unknown };
    if (!Array.isArray(parsed.lines) || !parsed.lines.every(isStoredLine)) return [];
    return parsed.lines.map((l) =>
      guestLine({
        ...l,
        options: Array.isArray(l.options) ? l.options.filter(isOption) : [],
        needsChoice: l.needsChoice === true,
      }),
    );
  } catch {
    return [];
  }
}

function writeStoredLines(lines: CartLine[]): void {
  try {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({
        lines: lines.map((l) => ({
          itemId: l.itemId,
          name: l.name,
          priceKobo: l.priceKobo,
          quantity: l.quantity,
          isAvailable: l.isAvailable,
          options: l.options,
          needsChoice: l.needsChoice,
        })),
      }),
    );
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

function fromServer(cart: ServerCart): CartLine[] {
  return cart.lines.map((l) => ({
    key: lineKey(l.menuItemId, l.optionIds),
    itemId: l.menuItemId,
    name: l.name,
    priceKobo:
      l.unitPriceKobo === null
        ? null
        : l.unitPriceKobo - l.options.reduce((s, o) => s + o.priceDeltaKobo, 0),
    unitPriceKobo: l.unitPriceKobo,
    quantity: l.quantity,
    isAvailable: l.isAvailable,
    options: l.options.map((o) => ({ id: o.id, name: o.name, priceDeltaKobo: o.priceDeltaKobo })),
    needsChoice: l.problems.some((p) => p.code.startsWith('OPTION_')),
    problems: l.problems.map((p) => p.message),
    priceChange: l.priceChange,
    serverId: l.id,
  }));
}

/**
 * The customer's order in progress. Guests keep it on the device; once signed in it is the
 * shared server cart (AGENT.md section 13), and the device cart is merged into it once.
 */
export const useCartStore = defineStore('cart', () => {
  const auth = useAuthStore();
  const toast = useToastStore();

  const lines = ref<CartLine[]>(readStoredLines());
  const mode = ref<'guest' | 'server'>('guest');
  const syncing = ref(false);

  // Guest only: saved synchronously so nothing is lost if the tab closes straight away.
  watch(
    lines,
    (value) => {
      if (mode.value === 'guest') writeStoredLines(value);
    },
    { deep: true, flush: 'sync' },
  );

  const count = computed(() => lines.value.reduce((n, l) => n + l.quantity, 0));
  const isEmpty = computed(() => lines.value.length === 0);
  const hasUnavailable = computed(() => lines.value.some((l) => !l.isAvailable));
  /** Anything the customer must fix before checkout. */
  const hasProblems = computed(() =>
    lines.value.some(
      (l) => !l.isAvailable || l.needsChoice || l.problems.length > 0 || l.priceChange !== null,
    ),
  );
  /** null while any line has no price yet ([PRICE] placeholder). */
  const subtotalKobo = computed<number | null>(() =>
    lines.value.some((l) => l.unitPriceKobo === null)
      ? null
      : lines.value.reduce((sum, l) => sum + (l.unitPriceKobo ?? 0) * l.quantity, 0),
  );

  const find = (key: string) => lines.value.find((l) => l.key === key);

  /** Runs a server cart call; on failure the cart is unchanged and the reason is shown. */
  async function server(call: () => Promise<ServerCart>): Promise<boolean> {
    try {
      lines.value = fromServer(await call());
      return true;
    } catch (err) {
      const error = asApiError(err);
      if (error.kind !== 'unauthorized') toast.show(error.message);
      return false;
    }
  }

  const setOnServer = (menuItemId: string, optionIds: string[], quantity: number) =>
    server(() => api.put<ServerCart>('/cart/lines', { menuItemId, optionIds, quantity }));

  /**
   * Adds one of the item with the given choices (the choice sheet has already checked them).
   * Returns false if it cannot be added (sold out, at the quantity limit, or refused).
   */
  async function add(item: MenuItem, optionIds: readonly string[] = []): Promise<boolean> {
    if (!item.isAvailable) return false;
    const key = lineKey(item.id, optionIds);
    const line = find(key);
    if (line && line.quantity >= MAX_QUANTITY) return false;
    if (mode.value === 'server') {
      return setOnServer(item.id, [...optionIds].sort(), (line?.quantity ?? 0) + 1);
    }
    if (line) {
      line.quantity += 1;
      return true;
    }
    const options = item.optionGroups
      .flatMap((g) => g.options)
      .filter((o) => optionIds.includes(o.id))
      .map((o) => ({ id: o.id, name: o.name, priceDeltaKobo: o.priceDeltaKobo }));
    lines.value.push(
      guestLine({
        itemId: item.id,
        name: item.name,
        priceKobo: item.priceKobo,
        quantity: 1,
        isAvailable: true,
        options,
        needsChoice: resolveOptions(item, optionIds) === null,
      }),
    );
    return true;
  }

  /**
   * Makes sure the cart holds at least this many of the item with these choices, without
   * adding on top of what is already there (used by "Order again", so a failed payment
   * followed by Order again never doubles the order).
   */
  async function ensure(
    item: MenuItem,
    optionIds: readonly string[],
    quantity: number,
  ): Promise<boolean> {
    if (!item.isAvailable) return false;
    const wanted = Math.min(quantity, MAX_QUANTITY);
    const line = find(lineKey(item.id, optionIds));
    if (line && line.quantity >= wanted) return true;
    if (mode.value === 'server') return setOnServer(item.id, [...optionIds].sort(), wanted);
    if (!(await add(item, optionIds))) return false;
    const added = find(lineKey(item.id, optionIds));
    if (added) added.quantity = wanted;
    return true;
  }

  async function setQuantity(key: string, quantity: number): Promise<void> {
    const line = find(key);
    if (!line) return;
    if (quantity < 1) return remove(key);
    if (mode.value === 'server') {
      await setOnServer(
        line.itemId,
        line.options.map((o) => o.id),
        quantity,
      );
    } else {
      line.quantity = quantity;
    }
  }

  async function increment(key: string): Promise<void> {
    const line = find(key);
    if (line && line.isAvailable && line.quantity < MAX_QUANTITY) {
      await setQuantity(key, line.quantity + 1);
    }
  }

  async function decrement(key: string): Promise<void> {
    const line = find(key);
    if (line) await setQuantity(key, line.quantity - 1);
  }

  async function remove(key: string): Promise<void> {
    const line = find(key);
    if (!line) return;
    if (mode.value === 'server' && line.serverId) {
      await server(() => api.delete<ServerCart>(`/cart/lines/${line.serverId}`));
    } else {
      lines.value = lines.value.filter((l) => l.key !== key);
    }
  }

  /** Accepts a changed price by setting the line again at the same quantity. */
  async function acceptPrice(key: string): Promise<void> {
    const line = find(key);
    if (line) await setQuantity(key, line.quantity);
  }

  function clear(): void {
    lines.value = [];
    if (mode.value === 'server') void server(() => api.delete<ServerCart>('/cart'));
  }

  /** Reloads the server cart (on load, return to the tab, before checkout, after payment). */
  async function refresh(): Promise<void> {
    if (mode.value === 'server') await server(() => api.get<ServerCart>('/cart'));
  }

  /** Guest cart only: brings stored lines up to date with the live menu. */
  function reconcile(menuItems: MenuItem[]): {
    removed: number;
    unavailable: number;
    needsChoice: number;
  } {
    if (mode.value === 'server') return { removed: 0, unavailable: 0, needsChoice: 0 };
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
        return guestLine({
          ...l,
          name: item.name,
          priceKobo: item.priceKobo,
          isAvailable: item.isAvailable,
          options: options ?? l.options,
          needsChoice: options === null,
        });
      });
    return {
      removed: before - lines.value.length,
      unavailable: lines.value.filter((l) => !l.isAvailable).length,
      needsChoice: lines.value.filter((l) => l.needsChoice).length,
    };
  }

  /** On sign-in: merge the device cart into the saved cart once, then use the saved cart. */
  async function useServerCart(): Promise<void> {
    syncing.value = true;
    const guest = lines.value;
    mode.value = 'server';
    try {
      if (guest.length === 0) {
        lines.value = fromServer(await api.get<ServerCart>('/cart'));
        return;
      }
      const result = await api.post<{ cart: ServerCart; skipped: number }>('/cart/merge', {
        lines: guest.map((l) => ({
          menuItemId: l.itemId,
          optionIds: l.options.map((o) => o.id),
          quantity: l.quantity,
        })),
      });
      lines.value = fromServer(result.cart);
      writeStoredLines([]);
      if (result.skipped > 0) {
        toast.show(
          'Some items from before you signed in can no longer be ordered and were left out.',
        );
      }
    } catch (err) {
      // Keep the device cart: it is merged on the next sign-in.
      mode.value = 'guest';
      lines.value = guest;
      const error = asApiError(err);
      if (error.kind !== 'unauthorized') toast.show(error.message);
    } finally {
      syncing.value = false;
    }
  }

  // Another device may have changed the saved cart while this tab was in the background.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void refresh();
    });
  }

  watch(
    () => auth.status,
    (status) => {
      if (status === 'signed-in' && mode.value === 'guest') void useServerCart();
      if (status === 'signed-out' && mode.value === 'server') {
        mode.value = 'guest';
        lines.value = [];
      }
    },
    { immediate: true },
  );

  return {
    lines,
    mode,
    syncing,
    count,
    isEmpty,
    hasUnavailable,
    hasProblems,
    subtotalKobo,
    add,
    ensure,
    increment,
    decrement,
    remove,
    acceptPrice,
    clear,
    refresh,
    reconcile,
  };
});
