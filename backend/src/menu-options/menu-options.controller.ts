import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/guards/roles.decorator';
import { StrictThrottle } from '../throttling/throttling';
import {
  AdminOptionGroupDto,
  CreateOptionDto,
  CreateOptionGroupDto,
  SetItemOptionGroupsDto,
  SetItemOptionOverrideDto,
  UpdateOptionDto,
  UpdateOptionGroupDto,
} from './menu-options.dto';
import { MenuOptionsService, type AdminOptionGroupView } from './menu-options.service';

/** The validated body as sent: class-transformer leaves unsent fields as undefined keys. */
const sent = <T extends object>(body: T): Partial<T> =>
  Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as Partial<T>;

const nothingToChange = () =>
  new BadRequestException({ code: 'VALIDATION_FAILED', message: 'There is nothing to change.' });

/**
 * Staff management of menu options (AGENT.md sections 3.4 and 14). Deny by default:
 * super_admin only, except reading and switching an option on/off, which supervisors may do.
 */
@ApiTags('admin')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Not allowed for this role' })
@Roles('super_admin')
@Controller({ path: 'admin', version: '1' })
export class MenuOptionsController {
  constructor(private readonly options: MenuOptionsService) {}

  @Get('option-groups')
  @Roles('supervisor', 'super_admin')
  @ApiOkResponse({ type: [AdminOptionGroupDto] })
  list(): Promise<AdminOptionGroupView[]> {
    return this.options.list();
  }

  @Post('option-groups')
  @StrictThrottle()
  @ApiCreatedResponse({ type: AdminOptionGroupDto })
  @ApiConflictResponse({ description: 'OPTION_NAME_TAKEN' })
  async createGroup(
    @Body() body: CreateOptionGroupDto,
    @Req() req: Request,
  ): Promise<AdminOptionGroupView> {
    const group = await this.options.createGroup(
      actor(req),
      sent(body) as CreateOptionGroupDto,
      requestId(req),
    );
    log(req, 'option_group.created', { groupId: group.id });
    return group;
  }

  @Patch('option-groups/:groupId')
  @StrictThrottle()
  @ApiOkResponse({ type: AdminOptionGroupDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'OPTION_NAME_TAKEN' })
  async updateGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: UpdateOptionGroupDto,
    @Req() req: Request,
  ): Promise<AdminOptionGroupView> {
    const changes = sent(body);
    if (Object.keys(changes).length === 0) throw nothingToChange();
    const group = await this.options.updateGroup(actor(req), groupId, changes, requestId(req));
    log(req, 'option_group.updated', { groupId, fields: Object.keys(changes) });
    return group;
  }

  @Post('option-groups/:groupId/options')
  @StrictThrottle()
  @ApiCreatedResponse({ type: AdminOptionGroupDto, description: 'The group, with the new option' })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'OPTION_NAME_TAKEN or OPTION_GROUP_ARCHIVED' })
  async createOption(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Body() body: CreateOptionDto,
    @Req() req: Request,
  ): Promise<AdminOptionGroupView> {
    const group = await this.options.createOption(
      actor(req),
      groupId,
      sent(body) as CreateOptionDto,
      requestId(req),
    );
    log(req, 'option.created', { groupId });
    return group;
  }

  @Patch('options/:optionId')
  @Roles('supervisor', 'super_admin')
  @StrictThrottle()
  @ApiOkResponse({ type: AdminOptionGroupDto, description: "The option's group" })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'OPTION_NAME_TAKEN' })
  async updateOption(
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() body: UpdateOptionDto,
    @Req() req: Request,
  ): Promise<AdminOptionGroupView> {
    const changes = sent(body);
    if (Object.keys(changes).length === 0) throw nothingToChange();
    const group = await this.options.updateOption(actor(req), optionId, changes, requestId(req));
    log(req, 'option.updated', { optionId, fields: Object.keys(changes) });
    return group;
  }

  @Put('menu-items/:itemId/option-groups')
  @StrictThrottle()
  @ApiOkResponse({ description: 'The groups the item now offers' })
  @ApiNotFoundResponse()
  async setItemGroups(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() body: SetItemOptionGroupsDto,
    @Req() req: Request,
  ): Promise<{ itemId: string; groupIds: string[] }> {
    const result = await this.options.setItemGroups(
      actor(req),
      itemId,
      body.groupIds,
      requestId(req),
    );
    log(req, 'menu_item.option_groups_set', { itemId, groupCount: body.groupIds.length });
    return result;
  }

  @Put('menu-items/:itemId/options/:optionId')
  @StrictThrottle()
  @ApiOkResponse({ description: 'The item’s special setting for the option' })
  @ApiNotFoundResponse()
  @ApiUnprocessableEntityResponse({
    description: "OPTION_NOT_ON_ITEM: the item doesn't use the group",
  })
  async setOverride(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() body: SetItemOptionOverrideDto,
    @Req() req: Request,
  ): Promise<unknown> {
    const setting = sent(body);
    if (Object.keys(setting).length === 0) throw nothingToChange();
    const result = await this.options.setOverride(
      actor(req),
      itemId,
      optionId,
      setting,
      requestId(req),
    );
    log(req, 'menu_item.option_override_set', { itemId, optionId });
    return result;
  }

  @Delete('menu-items/:itemId/options/:optionId')
  @StrictThrottle()
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'The item uses the option’s normal settings again' })
  @ApiNotFoundResponse()
  async deleteOverride(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.options.deleteOverride(actor(req), itemId, optionId, requestId(req));
    log(req, 'menu_item.option_override_removed', { itemId, optionId });
  }
}

const actor = (req: Request) => req.user as AuthenticatedUser;
// pino-http always assigns a string request id (see logging/http-logger.ts).
const requestId = (req: Request) => (typeof req.id === 'string' ? req.id : '');

function log(req: Request, event: string, fields: Record<string, unknown>): void {
  req.log.info(
    { event, outcome: 'SUCCESS', actorUserId: actor(req).id, ...fields },
    'Menu options changed',
  );
}
