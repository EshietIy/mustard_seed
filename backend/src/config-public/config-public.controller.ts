import { Controller, Get, Inject } from '@nestjs/common';
import { Public } from '../auth/guards/public.decorator';
import { ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';

export class PublicConfigDto {
  @ApiProperty({ enum: ['simulated', 'live'] })
  paymentMode!: 'simulated' | 'live';

  @ApiProperty({ description: 'Google OAuth client ID for the sign-in button (public)' })
  googleClientId!: string;
}

@ApiTags('config')
@Public()
@Controller({ path: 'config/public', version: '1' })
export class ConfigPublicController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  @ApiOkResponse({ type: PublicConfigDto })
  get(): PublicConfigDto {
    return {
      paymentMode: this.config.PAYSTACK_SIMULATOR_ENABLED ? 'simulated' : 'live',
      googleClientId: this.config.GOOGLE_CLIENT_ID,
    };
  }
}
