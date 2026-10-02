import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from '../auth/guards/public.decorator';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('health')
@SkipThrottle()
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
