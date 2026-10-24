import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders/orders.repository';
import {
  MENU_ADMIN_REPOSITORY,
  type AdminMenuItem,
  type MenuAdminRepository,
  type MenuItemPatch,
} from './menu-admin.repository';

type Actor = Pick<AuthenticatedUser, 'id' | 'role'>;

/**
 * Staff changes to dishes (AGENT.md sections 3.4 and 11, slice 8). Supervisors and super
 * admins switch dishes on and off. Every change is audited.
 */
@Injectable()
export class MenuAdminService {
  private readonly logger = new Logger(MenuAdminService.name);

  constructor(
    @Inject(MENU_ADMIN_REPOSITORY) private readonly repo: MenuAdminRepository,
    @Inject(ORDERS_REPOSITORY) private readonly audit: Pick<OrdersRepository, 'recordAudit'>,
  ) {}

  async updateItem(
    actor: Actor,
    itemId: string,
    patch: MenuItemPatch,
    correlationId: string,
  ): Promise<AdminMenuItem> {
    const item = await this.repo.updateItem(itemId, patch);
    if (!item) {
      throw new NotFoundException({
        code: 'MENU_ITEM_NOT_FOUND',
        message: 'We could not find that menu item.',
      });
    }
    try {
      await this.audit.recordAudit({
        event: 'menu_item.updated',
        outcome: 'SUCCESS',
        userId: actor.id,
        correlationId,
        details: { itemId, changes: patch },
      });
    } catch (err) {
      // The change is saved; a missing audit row must not turn it into an error for staff.
      this.logger.error(`Failed to record menu_item.updated audit: ${String(err)}`);
    }
    return item;
  }
}
