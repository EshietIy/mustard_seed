import { randomUUID } from 'node:crypto';
import type { OptionRows } from '../menu/menu-options';
import {
  OptionNameTakenError,
  type GroupWrite,
  type MenuOptionsRepository,
  type OptionWrite,
} from './menu-options.repository';

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** In-memory MenuOptionsRepository for unit tests; enforces the same name rules as the DB. */
export class InMemoryMenuOptionsRepository implements MenuOptionsRepository {
  rows: OptionRows = { groups: [], options: [], links: [], overrides: [] };

  constructor(public menuItemIds: string[] = []) {}

  loadAll(): Promise<OptionRows> {
    return Promise.resolve(structuredClone(this.rows));
  }

  listMenuItemIds(): Promise<string[]> {
    return Promise.resolve([...this.menuItemIds]);
  }

  createGroup(input: GroupWrite): Promise<string> {
    if (this.rows.groups.some((g) => !g.archived && same(g.name, input.name))) {
      return Promise.reject(new OptionNameTakenError());
    }
    const id = randomUUID();
    this.rows.groups.push({ id, ...input, name: input.name.trim(), archived: false });
    return Promise.resolve(id);
  }

  updateGroup(id: string, patch: Partial<GroupWrite> & { archived?: boolean }): Promise<void> {
    const group = this.rows.groups.find((g) => g.id === id);
    if (!group) return Promise.resolve();
    const next = { ...group, ...patch };
    const clash = this.rows.groups.some(
      (g) => g.id !== id && !g.archived && !next.archived && same(g.name, next.name),
    );
    if (clash) return Promise.reject(new OptionNameTakenError());
    Object.assign(group, next);
    return Promise.resolve();
  }

  createOption(groupId: string, input: OptionWrite, excludeItemIds: string[]): Promise<string> {
    const clash = this.rows.options.some(
      (o) => o.groupId === groupId && !o.archived && same(o.name, input.name),
    );
    if (clash) return Promise.reject(new OptionNameTakenError());
    const id = randomUUID();
    this.rows.options.push({
      id,
      groupId,
      ...input,
      name: input.name.trim(),
      isAvailable: true,
      archived: false,
    });
    for (const menuItemId of excludeItemIds) {
      this.rows.overrides.push({
        menuItemId,
        optionId: id,
        isExcluded: true,
        priceDeltaKobo: null,
      });
    }
    return Promise.resolve(id);
  }

  updateOption(
    id: string,
    patch: Partial<OptionWrite> & { isAvailable?: boolean; archived?: boolean },
  ): Promise<void> {
    const option = this.rows.options.find((o) => o.id === id);
    if (!option) return Promise.resolve();
    const next = { ...option, ...patch };
    const clash = this.rows.options.some(
      (o) =>
        o.id !== id &&
        o.groupId === option.groupId &&
        !o.archived &&
        !next.archived &&
        same(o.name, next.name),
    );
    if (clash) return Promise.reject(new OptionNameTakenError());
    Object.assign(option, next);
    return Promise.resolve();
  }

  setItemGroups(itemId: string, groupIds: string[]): Promise<void> {
    this.rows.links = [
      ...this.rows.links.filter((l) => l.menuItemId !== itemId),
      ...groupIds.map((groupId, i) => ({ menuItemId: itemId, groupId, sortOrder: (i + 1) * 10 })),
    ];
    return Promise.resolve();
  }

  upsertOverride(
    itemId: string,
    optionId: string,
    value: { isExcluded: boolean; priceDeltaKobo: number | null },
  ): Promise<void> {
    this.rows.overrides = [
      ...this.rows.overrides.filter((o) => !(o.menuItemId === itemId && o.optionId === optionId)),
      { menuItemId: itemId, optionId, ...value },
    ];
    return Promise.resolve();
  }

  deleteOverride(itemId: string, optionId: string): Promise<boolean> {
    const before = this.rows.overrides.length;
    this.rows.overrides = this.rows.overrides.filter(
      (o) => !(o.menuItemId === itemId && o.optionId === optionId),
    );
    return Promise.resolve(this.rows.overrides.length < before);
  }
}
