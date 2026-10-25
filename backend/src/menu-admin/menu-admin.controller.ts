import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/guards/roles.decorator';
import { StrictThrottle } from '../throttling/throttling';
import {
  AdminMenuItemDto,
  CreateMenuItemDto,
  MoveMenuItemDto,
  UpdateMenuItemDto,
} from './menu-admin.dto';
import type { AdminMenuItem } from './menu-admin.repository';
import { MenuAdminService } from './menu-admin.service';

// pino-http always assigns a string request id (see logging/http-logger.ts).
const requestIdOf = (req: Request): string => (typeof req.id === 'string' ? req.id : '');

/**
 * Staff changes to dishes (AGENT.md sections 3.4 and 11, slice 8). Deny by default: only
 * switching a dish on or off is open to supervisors.
 */
@ApiTags('admin')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Not allowed for this role' })
@Roles('super_admin')
@Controller({ path: 'admin/menu-items', version: '1' })
export class MenuAdminController {
  constructor(private readonly menu: MenuAdminService) {}

  @Get()
  @ApiOkResponse({
    type: AdminMenuItemDto,
    isArray: true,
    description: 'Every dish, retired ones included, by category and position',
  })
  listItems(): Promise<AdminMenuItem[]> {
    return this.menu.listItems();
  }

  @Post()
  @StrictThrottle()
  @ApiCreatedResponse({ type: AdminMenuItemDto, description: 'Added switched off' })
  @ApiConflictResponse({ description: 'DISH_NAME_TAKEN' })
  async createItem(@Body() body: CreateMenuItemDto, @Req() req: Request): Promise<AdminMenuItem> {
    const actor = req.user as AuthenticatedUser;
    const item = await this.menu.createItem(actor, body, requestIdOf(req));
    req.log.info(
      {
        event: 'menu_item.created',
        outcome: 'SUCCESS',
        actorUserId: actor.id,
        itemId: item.id,
        category: item.category,
      },
      'Dish added',
    );
    return item;
  }

  @Patch(':itemId')
  @Roles('supervisor', 'super_admin')
  @StrictThrottle()
  @ApiOkResponse({ type: AdminMenuItemDto })
  @ApiNotFoundResponse({ description: 'MENU_ITEM_NOT_FOUND' })
  @ApiConflictResponse({ description: 'DISH_NAME_TAKEN or MENU_ITEM_ARCHIVED' })
  async updateItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: UpdateMenuItemDto,
    @Req() req: Request,
  ): Promise<AdminMenuItem> {
    // class-transformer leaves unsent fields as undefined keys.
    const changes = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined),
    ) as UpdateMenuItemDto;
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'There is nothing to change.',
      });
    }
    const actor = req.user as AuthenticatedUser;
    const item = await this.menu.updateItem(actor, itemId, changes, requestIdOf(req));
    const event =
      changes.isArchived === true
        ? 'menu_item.archived'
        : changes.isArchived === false
          ? 'menu_item.restored'
          : 'menu_item.updated';
    req.log.info(
      { event, outcome: 'SUCCESS', actorUserId: actor.id, itemId, fields: Object.keys(changes) },
      'Menu item changed',
    );
    return item;
  }

  @Post(':itemId/move')
  @HttpCode(200)
  @StrictThrottle()
  @ApiOkResponse({
    type: AdminMenuItemDto,
    isArray: true,
    description: 'Every dish after the move, as GET returns them',
  })
  @ApiNotFoundResponse({ description: 'MENU_ITEM_NOT_FOUND' })
  @ApiConflictResponse({ description: 'MENU_ITEM_ARCHIVED' })
  async moveItem(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: MoveMenuItemDto,
    @Req() req: Request,
  ): Promise<AdminMenuItem[]> {
    const actor = req.user as AuthenticatedUser;
    const items = await this.menu.moveItem(actor, itemId, body.direction, requestIdOf(req));
    req.log.info(
      {
        event: 'menu_item.moved',
        outcome: 'SUCCESS',
        actorUserId: actor.id,
        itemId,
        direction: body.direction,
      },
      'Dish moved',
    );
    return items;
  }
}
