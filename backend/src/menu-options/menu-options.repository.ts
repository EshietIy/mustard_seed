import type { OptionRows } from '../menu/menu-options';

export const MENU_OPTIONS_REPOSITORY = Symbol('MENU_OPTIONS_REPOSITORY');

/** Thrown when a live group (or a live option within its group) already has that name. */
export class OptionNameTakenError extends Error {
  constructor() {
    super('option name already in use');
  }
}

export interface GroupWrite {
  name: string;
  minChoices: number;
  maxChoices: number;
  sortOrder: number;
}

export interface OptionWrite {
  name: string;
  priceDeltaKobo: number;
  sortOrder: number;
}

/**
 * Staff management of option groups and options (AGENT.md section 14). Groups and options are
 * archived, never deleted, so past orders keep displaying correctly.
 */
export interface MenuOptionsRepository {
  /** Every group, option, item link and override, archived ones included. */
  loadAll(): Promise<OptionRows>;
  /** Ids of all menu items (to check the ones a request names). */
  listMenuItemIds(): Promise<string[]>;
  createGroup(input: GroupWrite): Promise<string>;
  updateGroup(id: string, patch: Partial<GroupWrite> & { archived?: boolean }): Promise<void>;
  /** Creates the option and, atomically, an exclusion for each item in excludeItemIds. */
  createOption(groupId: string, input: OptionWrite, excludeItemIds: string[]): Promise<string>;
  updateOption(
    id: string,
    patch: Partial<OptionWrite> & { isAvailable?: boolean; archived?: boolean },
  ): Promise<void>;
  /** Replaces the groups an item offers, in order (atomic). */
  setItemGroups(itemId: string, groupIds: string[]): Promise<void>;
  upsertOverride(
    itemId: string,
    optionId: string,
    value: { isExcluded: boolean; priceDeltaKobo: number | null },
  ): Promise<void>;
  /** Returns false when there was no override. */
  deleteOverride(itemId: string, optionId: string): Promise<boolean>;
}
