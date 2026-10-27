import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/guards/roles.decorator';
import { StrictThrottle } from '../throttling/throttling';
import type { SettingsRecord } from './settings.repository';
import { SettingsDto, UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

// pino-http always assigns a string request id (see logging/http-logger.ts).
const requestIdOf = (req: Request): string => (typeof req.id === 'string' ? req.id : '');

/** Delivery fee and opening hours (AGENT.md 3.4: super_admin only). */
@ApiTags('admin')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Not allowed for this role' })
@Roles('super_admin')
@Controller({ path: 'admin/settings', version: '1' })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOkResponse({ type: SettingsDto })
  get(): Promise<SettingsRecord> {
    return this.settings.get();
  }

  @Patch()
  @StrictThrottle()
  @ApiOkResponse({ type: SettingsDto, description: 'The settings after the change' })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED or INVALID_HOURS' })
  async update(@Body() body: UpdateSettingsDto, @Req() req: Request): Promise<SettingsRecord> {
    const actor = req.user as AuthenticatedUser;
    const saved = await this.settings.update(actor, body, requestIdOf(req));
    req.log.info(
      {
        event: 'settings.updated',
        outcome: 'SUCCESS',
        actorUserId: actor.id,
        fields: Object.keys(body),
      },
      'Settings changed',
    );
    return saved;
  }
}
