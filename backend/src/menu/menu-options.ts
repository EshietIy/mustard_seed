import type { MenuOptionGroup } from './menu.types';

/** Raw option data as stored; resolved per item by resolveItemOptionGroups. */
export interface OptionRows {
  groups: Array<{
    id: string;
    name: string;
    minChoices: number;
    maxChoices: number;
    sortOrder: number;
    archived: boolean;
  }>;
  options: Array<{
    id: string;
    groupId: string;
    name: string;
    priceDeltaKobo: number;
    isAvailable: boolean;
    sortOrder: number;
    archived: boolean;
  }>;
  links: Array<{ menuItemId: string; groupId: string; sortOrder: number }>;
  overrides: Array<{
    menuItemId: string;
    optionId: string;
    isExcluded: boolean;
    /** null keeps the option's own price difference. */
    priceDeltaKobo: number | null;
  }>;
}

const bySortThenName = <T extends { sortOrder: number; name: string }>(a: T, b: T): number =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/**
 * The option groups each menu item offers. Archived groups and options are left out (old
 * orders keep their own snapshot), excluded options are removed per item, and per-item price
 * overrides are applied. Items with no live groups are absent from the map.
 */
export function resolveItemOptionGroups(rows: OptionRows): Map<string, MenuOptionGroup[]> {
  const groups = new Map(rows.groups.filter((g) => !g.archived).map((g) => [g.id, g]));
  const optionsByGroup = new Map<string, OptionRows['options']>();
  for (const option of [...rows.options].sort(bySortThenName)) {
    if (option.archived) continue;
    optionsByGroup.set(option.groupId, [...(optionsByGroup.get(option.groupId) ?? []), option]);
  }
  const overrides = new Map(rows.overrides.map((o) => [`${o.menuItemId}:${o.optionId}`, o]));

  const result = new Map<string, MenuOptionGroup[]>();
  const links = [...rows.links].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      (groups.get(a.groupId)?.sortOrder ?? 0) - (groups.get(b.groupId)?.sortOrder ?? 0),
  );
  for (const link of links) {
    const group = groups.get(link.groupId);
    if (!group) continue;
    const options = (optionsByGroup.get(group.id) ?? []).flatMap((option) => {
      const override = overrides.get(`${link.menuItemId}:${option.id}`);
      if (override?.isExcluded) return [];
      return [
        {
          id: option.id,
          name: option.name,
          priceDeltaKobo: override?.priceDeltaKobo ?? option.priceDeltaKobo,
          isAvailable: option.isAvailable,
        },
      ];
    });
    result.set(link.menuItemId, [
      ...(result.get(link.menuItemId) ?? []),
      {
        id: group.id,
        name: group.name,
        minChoices: group.minChoices,
        maxChoices: group.maxChoices,
        options,
      },
    ]);
  }
  return result;
}
