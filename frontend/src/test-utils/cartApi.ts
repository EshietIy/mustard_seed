import type { MenuItem } from '@/api/types';

interface Line {
  id: string;
  menuItemId: string;
  optionIds: string[];
  quantity: number;
}

/**
 * An in-memory stand-in for the server cart (/cart endpoints) for view tests. Spread its
 * handlers into routeFetch({...}). Prices and names come from the given menu items.
 */
export function fakeCartApi(menu: MenuItem[] = []) {
  let lines: Line[] = [];
  let next = 1;
  const view = () => {
    const out = lines.map((l) => {
      const item = menu.find((m) => m.id === l.menuItemId);
      const options = (item?.optionGroups ?? [])
        .flatMap((g) => g.options.map((o) => ({ ...o, groupName: g.name })))
        .filter((o) => l.optionIds.includes(o.id))
        .map((o) => ({
          id: o.id,
          groupName: o.groupName,
          name: o.name,
          priceDeltaKobo: o.priceDeltaKobo,
        }));
      const unit =
        item?.priceKobo == null
          ? null
          : options.reduce((s, o) => s + o.priceDeltaKobo, item.priceKobo);
      return {
        id: l.id,
        menuItemId: l.menuItemId,
        name: item?.name ?? l.menuItemId,
        optionIds: l.optionIds,
        options,
        quantity: l.quantity,
        unitPriceKobo: unit,
        lineTotalKobo: unit === null ? null : unit * l.quantity,
        isAvailable: item?.isAvailable ?? true,
        problems: [],
        priceChange: null,
      };
    });
    return {
      lines: out,
      itemCount: out.reduce((n, l) => n + l.quantity, 0),
      subtotalKobo: out.every((l) => l.lineTotalKobo !== null)
        ? out.reduce((s, l) => s + (l.lineTotalKobo ?? 0), 0)
        : null,
      canCheckout: out.length > 0,
    };
  };
  const same = (a: Omit<Line, 'id' | 'quantity'>, b: Line) =>
    a.menuItemId === b.menuItemId && [...a.optionIds].sort().join() === b.optionIds.join();
  const set = (body: Omit<Line, 'id'>, add: boolean) => {
    const optionIds = [...(body.optionIds ?? [])].sort();
    const existing = lines.find((l) => same({ ...body, optionIds }, l));
    if (existing)
      existing.quantity = Math.min(add ? existing.quantity + body.quantity : body.quantity, 20);
    else
      lines.push({
        id: `line-${next++}`,
        menuItemId: body.menuItemId,
        optionIds,
        quantity: body.quantity,
      });
  };
  const json = (init: RequestInit | undefined) => JSON.parse(String(init?.body)) as unknown;
  return {
    get lines() {
      return lines;
    },
    handlers: {
      'GET /cart': () => Response.json(view()),
      'PUT /cart/lines': (init: RequestInit | undefined) => {
        set(json(init) as Omit<Line, 'id'>, false);
        return Response.json(view());
      },
      'POST /cart/merge': (init: RequestInit | undefined) => {
        for (const l of (json(init) as { lines: Array<Omit<Line, 'id'>> }).lines) set(l, true);
        return Response.json({ cart: view(), skipped: 0 });
      },
      'DELETE /cart': () => {
        lines = [];
        return Response.json(view());
      },
    } as Record<string, (init: RequestInit | undefined) => Response>,
  };
}
