import { resolveItemOptionGroups, type OptionRows } from './menu-options';

const ITEM_A = 'item-a';
const ITEM_B = 'item-b';

function rows(overrides: Partial<OptionRows> = {}): OptionRows {
  return {
    groups: [
      {
        id: 'g-protein',
        name: 'Soup protein',
        minChoices: 1,
        maxChoices: 1,
        sortOrder: 10,
        archived: false,
      },
    ],
    options: [
      {
        id: 'o-beef',
        groupId: 'g-protein',
        name: 'Beef',
        priceDeltaKobo: 0,
        isAvailable: true,
        sortOrder: 10,
        archived: false,
      },
      {
        id: 'o-chicken',
        groupId: 'g-protein',
        name: 'Chicken',
        priceDeltaKobo: 50000,
        isAvailable: true,
        sortOrder: 20,
        archived: false,
      },
      {
        id: 'o-turkey',
        groupId: 'g-protein',
        name: 'Turkey',
        priceDeltaKobo: 0,
        isAvailable: false,
        sortOrder: 30,
        archived: false,
      },
    ],
    links: [
      { menuItemId: ITEM_A, groupId: 'g-protein', sortOrder: 10 },
      { menuItemId: ITEM_B, groupId: 'g-protein', sortOrder: 10 },
    ],
    overrides: [],
    ...overrides,
  };
}

describe('resolveItemOptionGroups', () => {
  it('gives each linked item its groups with options in display order', () => {
    const byItem = resolveItemOptionGroups(rows());
    expect(byItem.get(ITEM_A)).toEqual([
      {
        id: 'g-protein',
        name: 'Soup protein',
        minChoices: 1,
        maxChoices: 1,
        options: [
          { id: 'o-beef', name: 'Beef', priceDeltaKobo: 0, isAvailable: true },
          { id: 'o-chicken', name: 'Chicken', priceDeltaKobo: 50000, isAvailable: true },
          { id: 'o-turkey', name: 'Turkey', priceDeltaKobo: 0, isAvailable: false },
        ],
      },
    ]);
    expect(byItem.get('unlinked')).toBeUndefined();
  });

  it('leaves out an option an item excludes, on that item only', () => {
    const byItem = resolveItemOptionGroups(
      rows({
        overrides: [
          { menuItemId: ITEM_B, optionId: 'o-beef', isExcluded: true, priceDeltaKobo: null },
        ],
      }),
    );
    expect(byItem.get(ITEM_A)?.[0].options.map((o) => o.name)).toEqual([
      'Beef',
      'Chicken',
      'Turkey',
    ]);
    expect(byItem.get(ITEM_B)?.[0].options.map((o) => o.name)).toEqual(['Chicken', 'Turkey']);
  });

  it("applies an item's price override for an option", () => {
    const byItem = resolveItemOptionGroups(
      rows({
        overrides: [
          { menuItemId: ITEM_B, optionId: 'o-chicken', isExcluded: false, priceDeltaKobo: 20000 },
        ],
      }),
    );
    expect(byItem.get(ITEM_A)?.[0].options[1].priceDeltaKobo).toBe(50000);
    expect(byItem.get(ITEM_B)?.[0].options[1].priceDeltaKobo).toBe(20000);
  });

  it('hides archived options and archived groups', () => {
    const base = rows();
    const byItem = resolveItemOptionGroups({
      ...base,
      options: base.options.map((o) => (o.id === 'o-turkey' ? { ...o, archived: true } : o)),
    });
    expect(byItem.get(ITEM_A)?.[0].options.map((o) => o.name)).toEqual(['Beef', 'Chicken']);

    const archivedGroup = resolveItemOptionGroups({
      ...base,
      groups: base.groups.map((g) => ({ ...g, archived: true })),
    });
    expect(archivedGroup.get(ITEM_A)).toBeUndefined();
  });

  it('orders several groups by the item link order, then group order', () => {
    const base = rows();
    const byItem = resolveItemOptionGroups({
      ...base,
      groups: [
        ...base.groups,
        {
          id: 'g-extra',
          name: 'Extras',
          minChoices: 0,
          maxChoices: 2,
          sortOrder: 5,
          archived: false,
        },
      ],
      options: [
        ...base.options,
        {
          id: 'o-egg',
          groupId: 'g-extra',
          name: 'Egg',
          priceDeltaKobo: 30000,
          isAvailable: true,
          sortOrder: 10,
          archived: false,
        },
      ],
      links: [...base.links, { menuItemId: ITEM_A, groupId: 'g-extra', sortOrder: 20 }],
    });
    expect(byItem.get(ITEM_A)?.map((g) => g.name)).toEqual(['Soup protein', 'Extras']);
  });
});
