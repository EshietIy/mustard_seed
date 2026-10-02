import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { emailDomain, type AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/guards/roles.decorator';
import { StrictThrottle } from '../throttling/throttling';
import { CreateStaffDto, StaffDto, UpdateStaffDto } from './staff.dto';
import { StaffService } from './staff.service';

function updateEvent(before: StaffDto, after: StaffDto): string {
  if (before.isActive && !after.isActive) return 'staff.deactivated';
  if (!before.isActive && after.isActive) return 'staff.reactivated';
  if (before.role !== after.role) return 'staff.role_changed';
  return 'staff.updated';
}

/** Staff provisioning (AGENT.md §3.4). Super admins only; there is no self-signup. */
@ApiTags('admin')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Not a super admin' })
@Roles('super_admin')
@Controller({ path: 'admin/staff', version: '1' })
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @ApiOkResponse({ type: [StaffDto] })
  list(): Promise<StaffDto[]> {
    return this.staff.list();
  }

  @Post()
  @StrictThrottle()
  @ApiCreatedResponse({ type: StaffDto })
  @ApiConflictResponse({ description: 'Email already provisioned' })
  async create(@Body() body: CreateStaffDto, @Req() req: Request): Promise<StaffDto> {
    const actor = req.user as AuthenticatedUser;
    const created = await this.staff.create(actor, { email: body.email, role: body.role });
    req.log.info(
      {
        event: 'staff.created',
        outcome: 'SUCCESS',
        actorUserId: actor.id,
        staffId: created.id,
        role: created.role,
        emailDomain: emailDomain(created.email),
      },
      'Staff member provisioned',
    );
    return created;
  }

  @Patch(':id')
  @StrictThrottle()
  @ApiOkResponse({ type: StaffDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Would leave no active super admin' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStaffDto,
    @Req() req: Request,
  ): Promise<StaffDto> {
    if (body.role === undefined && body.isActive === undefined) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid.',
        details: [{ field: 'role', messages: ['Provide role and/or isActive'] }],
      });
    }
    const actor = req.user as AuthenticatedUser;
    const { before, after } = await this.staff.update(id, body);
    req.log.info(
      {
        event: updateEvent(before, after),
        outcome: 'SUCCESS',
        actorUserId: actor.id,
        staffId: after.id,
        previousRole: before.role,
        role: after.role,
        isActive: after.isActive,
        emailDomain: emailDomain(after.email),
      },
      'Staff member updated',
    );
    return after;
  }
}
