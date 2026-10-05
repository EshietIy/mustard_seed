import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { OptionRows } from '../menu/menu-options';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders/orders.repository';
import {
  MENU_OPTIONS_REPOSITORY,
  OptionNameTakenError,
  type MenuOptionsRepository,
} from './menu-options.repository';

export interface AdminOptionView {
  id: string;
  name: string;
  priceDeltaKobo: number;
  isAvailable: boolean;
  sortOrder: number;
  archived: boolean;
  /** Items using the group that do not offer this option. */
  excludedFromItemIds: string[];
  /** Items charging a different price difference for this option. */
  priceOverrides: Array<{ itemId: string; priceDeltaKobo: number }>;
}

export interface AdminOptionGroupView {
  id: string;
  name: string;
  minChoices: number;
  maxChoices: number;
  sortOrder: number;
  archived: boolean;
  /** Items that offer this group. */
  itemIds: string[];
  options: AdminOptionView[];
}

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

const notFound = (code: string, message: string) => new NotFoundException({ code, message });
const groupNotFound = () =>
  notFound('OPTION_GROUP_NOT_FOUND', 'We could not find that option group.');
const optionNotFound = () => notFound('OPTION_NOT_FOUND', 'We could not find that option.');
const itemNotFound = () => notFound('MENU_ITEM_NOT_FOUND', 'We could not find that menu item.');
const fieldError = (field: string, message: string) =>
  new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Some fields are invalid.',
    details: [{ field, messages: [message] }],
  });
const nameTaken = () =>
  new ConflictException({
    code: 'OPTION_NAME_TAKEN',
    message: 'That name is already in use here. Choose a different name.',
  });

async function mapNameTaken<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (err) {
    if (err instanceof OptionNameTakenError) throw nameTaken();
    throw err;
  }
}

const bySort = <T extends { sortOrder: number; name: string }>(a: T, b: T) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

function toViews(rows: OptionRows): AdminOptionGroupView[] {
  return [...rows.groups].sort(bySort).map((g) => {
    const itemIds = rows.links.filter((l) => l.groupId === g.id).map((l) => l.menuItemId);
    return {
      id: g.id,
      name: g.name,
      minChoices: g.minChoices,
      maxChoices: g.maxChoices,
      sortOrder: g.sortOrder,
      archived: g.archived,
      itemIds,
      options: rows.options
        .filter((o) => o.groupId === g.id)
        .sort(bySort)
        .map((o) => {
          const overrides = rows.overrides.filter((x) => x.optionId === o.id);
          return {
            id: o.id,
            name: o.name,
            priceDeltaKobo: o.priceDeltaKobo,
            isAvailable: o.isAvailable,
            sortOrder: o.sortOrder,
            archived: o.archived,
            excludedFromItemIds: overrides.filter((x) => x.isExcluded).map((x) => x.menuItemId),
            priceOverrides: overrides.flatMap((x) =>
              !x.isExcluded && x.priceDeltaKobo !== null
                ? [{ itemId: x.menuItemId, priceDeltaKobo: x.priceDeltaKobo }]
                : [],
            ),
          };
        }),
    };
  });
}

/**
 * Staff management of menu options (AGENT.md section 14). super_admin manages everything;
 * a supervisor may only switch an option on or off. Every change is audited.
 */
@Injectable()
export class MenuOptionsService {
  private readonly logger = new Logger(MenuOptionsService.name);

  constructor(
    @Inject(MENU_OPTIONS_REPOSITORY) private readonly repo: MenuOptionsRepository,
    @Inject(ORDERS_REPOSITORY) private readonly audit: Pick<OrdersRepository, 'recordAudit'>,
  ) {}

  async list(): Promise<AdminOptionGroupView[]> {
    return toViews(await this.repo.loadAll());
  }

  async createGroup(
    actor: Actor,
    input: { name: string; minChoices: number; maxChoices: number; sortOrder?: number },
    correlationId: string,
  ): Promise<AdminOptionGroupView> {
    this.checkChoices(input.minChoices, input.maxChoices);
    const name = input.name.trim();
    const id = await mapNameTaken(
      this.repo.createGroup({
        name,
        minChoices: input.minChoices,
        maxChoices: input.maxChoices,
        sortOrder: input.sortOrder ?? 0,
      }),
    );
    await this.record(actor, 'option_group.created', correlationId, { groupId: id, name });
    return this.group(id);
  }

  async updateGroup(
    actor: Actor,
    groupId: string,
    patch: {
      name?: string;
      minChoices?: number;
      maxChoices?: number;
      sortOrder?: number;
      archived?: boolean;
    },
    correlationId: string,
  ): Promise<AdminOptionGroupView> {
    const current = (await this.repo.loadAll()).groups.find((g) => g.id === groupId);
    if (!current) throw groupNotFound();
    this.checkChoices(
      patch.minChoices ?? current.minChoices,
      patch.maxChoices ?? current.maxChoices,
    );
    const changes = { ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) };
    await mapNameTaken(this.repo.updateGroup(groupId, changes));
    await this.record(actor, 'option_group.updated', correlationId, { groupId, changes });
    return this.group(groupId);
  }

  async createOption(
    actor: Actor,
    groupId: string,
    input: { name: string; priceDeltaKobo?: number; sortOrder?: number; itemIds?: string[] },
    correlationId: string,
  ): Promise<AdminOptionGroupView> {
    const rows = await this.repo.loadAll();
    const group = rows.groups.find((g) => g.id === groupId);
    if (!group) throw groupNotFound();
    if (group.archived) {
      throw new ConflictException({
        code: 'OPTION_GROUP_ARCHIVED',
        message: 'This option group is archived. Restore it before adding options.',
      });
    }
    // The admin checklist: items using the group, all ticked by default.
    const usingGroup = rows.links.filter((l) => l.groupId === groupId).map((l) => l.menuItemId);
    const offeredOn = input.itemIds ?? usingGroup;
    if (offeredOn.some((id) => !usingGroup.includes(id))) {
      throw fieldError('itemIds', 'Choose only items that offer this option group');
    }
    const name = input.name.trim();
    // A new option goes to the end of its group unless staff choose a place.
    const lastSort = Math.max(
      0,
      ...rows.options.filter((o) => o.groupId === groupId).map((o) => o.sortOrder),
    );
    const optionId = await mapNameTaken(
      this.repo.createOption(
        groupId,
        {
          name,
          priceDeltaKobo: input.priceDeltaKobo ?? 0,
          sortOrder: input.sortOrder ?? lastSort + 10,
        },
        usingGroup.filter((id) => !offeredOn.includes(id)),
      ),
    );
    await this.record(actor, 'option.created', correlationId, {
      groupId,
      optionId,
      name,
      priceDeltaKobo: input.priceDeltaKobo ?? 0,
      excludedFromItemIds: usingGroup.filter((id) => !offeredOn.includes(id)),
    });
    return this.group(groupId);
  }

  async updateOption(
    actor: Actor,
    optionId: string,
    patch: {
      name?: string;
      priceDeltaKobo?: number;
      sortOrder?: number;
      isAvailable?: boolean;
      archived?: boolean;
    },
    correlationId: string,
  ): Promise<AdminOptionGroupView> {
    if (actor.role !== 'super_admin' && Object.keys(patch).some((k) => k !== 'isAvailable')) {
      throw new ForbiddenException({
        code: 'SUPER_ADMIN_ONLY',
        message: 'Only a super admin can change options. Supervisors can switch them on or off.',
      });
    }
    const option = (await this.repo.loadAll()).options.find((o) => o.id === optionId);
    if (!option) throw optionNotFound();
    const changes = { ...patch, ...(patch.name !== undefined ? { name: patch.name.trim() } : {}) };
    await mapNameTaken(this.repo.updateOption(optionId, changes));
    await this.record(actor, 'option.updated', correlationId, {
      groupId: option.groupId,
      optionId,
      changes,
    });
    return this.group(option.groupId);
  }

  async setItemGroups(
    actor: Actor,
    itemId: string,
    groupIds: string[],
    correlationId: string,
  ): Promise<{ itemId: string; groupIds: string[] }> {
    if (new Set(groupIds).size !== groupIds.length) {
      throw fieldError('groupIds', 'Each option group may appear only once');
    }
    const [rows, itemIds] = await Promise.all([this.repo.loadAll(), this.repo.listMenuItemIds()]);
    if (!itemIds.includes(itemId)) throw itemNotFound();
    const live = new Set(rows.groups.filter((g) => !g.archived).map((g) => g.id));
    if (groupIds.some((id) => !live.has(id))) throw groupNotFound();
    await this.repo.setItemGroups(itemId, groupIds);
    await this.record(actor, 'menu_item.option_groups_set', correlationId, { itemId, groupIds });
    return { itemId, groupIds };
  }

  async setOverride(
    actor: Actor,
    itemId: string,
    optionId: string,
    input: { isExcluded?: boolean; priceDeltaKobo?: number | null },
    correlationId: string,
  ): Promise<{
    itemId: string;
    optionId: string;
    isExcluded: boolean;
    priceDeltaKobo: number | null;
  }> {
    const [rows, itemIds] = await Promise.all([this.repo.loadAll(), this.repo.listMenuItemIds()]);
    if (!itemIds.includes(itemId)) throw itemNotFound();
    const option = rows.options.find((o) => o.id === optionId);
    if (!option) throw optionNotFound();
    if (!rows.links.some((l) => l.menuItemId === itemId && l.groupId === option.groupId)) {
      throw new UnprocessableEntityException({
        code: 'OPTION_NOT_ON_ITEM',
        message: "This item doesn't offer that option's group. Add the group to the item first.",
      });
    }
    const value = {
      isExcluded: input.isExcluded ?? false,
      priceDeltaKobo: input.isExcluded ? null : (input.priceDeltaKobo ?? null),
    };
    await this.repo.upsertOverride(itemId, optionId, value);
    await this.record(actor, 'menu_item.option_override_set', correlationId, {
      itemId,
      optionId,
      ...value,
    });
    return { itemId, optionId, ...value };
  }

  async deleteOverride(
    actor: Actor,
    itemId: string,
    optionId: string,
    correlationId: string,
  ): Promise<void> {
    if (!(await this.repo.deleteOverride(itemId, optionId))) {
      throw notFound(
        'OPTION_OVERRIDE_NOT_FOUND',
        'That item has no special setting for this option.',
      );
    }
    await this.record(actor, 'menu_item.option_override_removed', correlationId, {
      itemId,
      optionId,
    });
  }

  private checkChoices(min: number, max: number): void {
    if (max < min) {
      throw fieldError('maxChoices', 'The most choices allowed must be at least the fewest');
    }
  }

  private async group(groupId: string): Promise<AdminOptionGroupView> {
    const view = toViews(await this.repo.loadAll()).find((g) => g.id === groupId);
    if (!view) throw groupNotFound();
    return view;
  }

  private async record(
    actor: Actor,
    event: string,
    correlationId: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.recordAudit({
        event,
        outcome: 'SUCCESS',
        userId: actor.id,
        correlationId,
        details,
      });
    } catch (err) {
      // The change is saved; a missing audit row must not turn it into an error for staff.
      this.logger.error(`Failed to record ${event} audit: ${String(err)}`);
    }
  }
}
