import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { MenuCategoryId } from '../menu/menu.types';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders/orders.repository';
import {
  DishNameTakenError,
  MENU_ADMIN_REPOSITORY,
  type AdminMenuItem,
  type MenuAdminRepository,
  type MenuItemPatch,
  type MoveDirection,
} from './menu-admin.repository';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

/** What staff may send to change a dish. */
export interface DishChanges {
  isAvailable?: boolean;
  priceKobo?: number | null;
  name?: string;
  description?: string;
  category?: MenuCategoryId;
  isHouseSignature?: boolean;
  /** Retire (true) or bring back (false); sent on its own. */
  isArchived?: boolean;
}

export interface NewDish {
  name: string;
  description?: string;
  category: MenuCategoryId;
  priceKobo?: number | null;
  isHouseSignature?: boolean;
}

/** What a supervisor may change on a dish; everything else is super_admin only. */
const SUPERVISOR_ITEM_FIELDS = new Set<string>(['isAvailable']);
const SORT_STEP = 10;

const notFound = () =>
  new NotFoundException({
    code: 'MENU_ITEM_NOT_FOUND',
    message: 'We could not find that menu item.',
  });

const nameTaken = (name: string) =>
  new ConflictException({
    code: 'DISH_NAME_TAKEN',
    message: `A dish called “${name}” is already on the menu. Choose another name.`,
  });

const archived = () =>
  new ConflictException({
    code: 'MENU_ITEM_ARCHIVED',
    message: 'This dish has been retired. Bring it back before changing it.',
  });

const superAdminOnly = (message: string) =>
  new ForbiddenException({ code: 'SUPER_ADMIN_ONLY', message });

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** "Ẹ̀dí Kàng!" -> "edi-kang"; "Rice & Stew" -> "rice-and-stew". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'dish';
}

/** The slug, or slug-2, slug-3... when an existing dish (retired or not) already uses it. */
function freeSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Just after the last dish on the menu in that category. */
function nextSortOrder(items: AdminMenuItem[], category: MenuCategoryId, except?: string) {
  const orders = items
    .filter((i) => i.category === category && !i.archivedAt && i.id !== except)
    .map((i) => i.sortOrder);
  return orders.length ? Math.max(...orders) + SORT_STEP : SORT_STEP;
}

/**
 * Staff changes to dishes (AGENT.md sections 3.4 and 11, slice 8). Supervisors and super
 * admins switch dishes on and off; only a super admin adds dishes, sets prices, edits details,
 * reorders and retires them. Retired dishes are archived, never deleted. Every change is
 * audited.
 */
@Injectable()
export class MenuAdminService {
  private readonly logger = new Logger(MenuAdminService.name);

  constructor(
    @Inject(MENU_ADMIN_REPOSITORY) private readonly repo: MenuAdminRepository,
    @Inject(ORDERS_REPOSITORY) private readonly audit: Pick<OrdersRepository, 'recordAudit'>,
  ) {}

  listItems(): Promise<AdminMenuItem[]> {
    return this.repo.listItems();
  }

  async createItem(actor: Actor, dish: NewDish, correlationId: string): Promise<AdminMenuItem> {
    if (actor.role !== 'super_admin') throw superAdminOnly('Only a super admin can add dishes.');
    const items = await this.repo.listItems();
    if (items.some((i) => !i.archivedAt && sameName(i.name, dish.name))) {
      throw nameTaken(dish.name);
    }
    let item: AdminMenuItem;
    try {
      item = await this.repo.createItem({
        slug: freeSlug(slugify(dish.name), new Set(items.map((i) => i.slug))),
        name: dish.name,
        description: dish.description ?? '',
        category: dish.category,
        priceKobo: dish.priceKobo ?? null,
        isHouseSignature: dish.isHouseSignature ?? false,
        isFreshJuice: dish.category === 'fresh_juices',
        sortOrder: nextSortOrder(items, dish.category),
      });
    } catch (err) {
      if (err instanceof DishNameTakenError) throw nameTaken(dish.name);
      throw err;
    }
    await this.record(actor, 'menu_item.created', correlationId, {
      itemId: item.id,
      name: item.name,
      category: item.category,
    });
    return item;
  }

  async updateItem(
    actor: Actor,
    itemId: string,
    changes: DishChanges,
    correlationId: string,
  ): Promise<AdminMenuItem> {
    if (
      actor.role !== 'super_admin' &&
      Object.keys(changes).some((k) => !SUPERVISOR_ITEM_FIELDS.has(k))
    ) {
      throw superAdminOnly(
        'Only a super admin can change prices and dish details. Supervisors can switch dishes on or off.',
      );
    }
    if (changes.isArchived !== undefined && Object.keys(changes).length > 1) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Retire or bring back a dish on its own, without other changes.',
      });
    }

    const items = await this.repo.listItems();
    const current = items.find((i) => i.id === itemId);
    if (!current) throw notFound();
    const restoring = changes.isArchived === false;
    if (current.archivedAt && !restoring) throw archived();

    const name = changes.name ?? current.name;
    const willBeOnMenu = current.archivedAt ? restoring : changes.isArchived !== true;
    if (
      willBeOnMenu &&
      (changes.name !== undefined || restoring) &&
      items.some((i) => i.id !== itemId && !i.archivedAt && sameName(i.name, name))
    ) {
      throw nameTaken(name);
    }

    const { isArchived, ...fields } = changes;
    const patch: MenuItemPatch = { ...fields };
    if (isArchived !== undefined) patch.archived = isArchived;
    // A dish that comes back starts switched off, like a new one, so staff check it first.
    if (restoring && current.archivedAt) patch.isAvailable = false;
    if (changes.category !== undefined && changes.category !== current.category) {
      patch.sortOrder = nextSortOrder(items, changes.category, itemId);
      patch.isFreshJuice = changes.category === 'fresh_juices';
    }

    let item: AdminMenuItem | null;
    try {
      item = await this.repo.updateItem(itemId, patch);
    } catch (err) {
      if (err instanceof DishNameTakenError) throw nameTaken(name);
      throw err;
    }
    if (!item) throw notFound();
    const event =
      isArchived === true
        ? 'menu_item.archived'
        : isArchived === false
          ? 'menu_item.restored'
          : 'menu_item.updated';
    await this.record(actor, event, correlationId, { itemId, changes });
    return item;
  }

  async moveItem(
    actor: Actor,
    itemId: string,
    direction: MoveDirection,
    correlationId: string,
  ): Promise<AdminMenuItem[]> {
    if (actor.role !== 'super_admin') {
      throw superAdminOnly('Only a super admin can change the order of dishes.');
    }
    const current = (await this.repo.listItems()).find((i) => i.id === itemId);
    if (!current) throw notFound();
    if (current.archivedAt) throw archived();
    await this.repo.moveItem(itemId, direction);
    await this.record(actor, 'menu_item.moved', correlationId, { itemId, direction });
    return this.repo.listItems();
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
