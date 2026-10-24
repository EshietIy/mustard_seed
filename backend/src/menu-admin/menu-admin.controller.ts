import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/guards/roles.decorator';
import { StrictThrottle } from '../throttling/throttling';
import { AdminMenuItemDto, UpdateMenuItemDto } from './menu-admin.dto';
import type { AdminMenuItem } from './menu-admin.repository';
import { MenuAdminService } from './menu-admin.service';

/** Staff changes to dishes (AGENT.md sections 3.4 and 11, slice 8). Deny by default. */
@ApiTags('admin')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Not allowed for this role' })
@Roles('super_admin')
@Controller({ path: 'admin/menu-items', version: '1' })
export class MenuAdminController {
  constructor(private readonly menu: MenuAdminService) {}

  @Patch(':itemId')
  @Roles('supervisor', 'super_admin')
  @StrictThrottle()
  @ApiOkResponse({ type: AdminMenuItemDto })
  @ApiNotFoundResponse({ description: 'MENU_ITEM_NOT_FOUND' })
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
    // pino-http always assigns a string request id (see logging/http-logger.ts).
    const requestId = typeof req.id === 'string' ? req.id : '';
    const item = await this.menu.updateItem(actor, itemId, changes, requestId);
    req.log.info(
      {
        event: 'menu_item.updated',
        outcome: 'SUCCESS',
        actorUserId: actor.id,
        itemId,
        fields: Object.keys(changes),
      },
      'Menu item changed',
    );
    return item;
  }
}
