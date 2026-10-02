import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { StaffModule } from '../staff/staff.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GOOGLE_ID_TOKEN_VERIFIER } from './google/google-id-token.verifier';
import { JoseGoogleIdTokenVerifier } from './google/jose-google-id-token.verifier';
import { AuthGuard } from './guards/auth.guard';
import { OriginGuard } from './guards/origin.guard';
import { SessionTokens } from './session/session-tokens';

@Module({
  imports: [UsersModule, StaffModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionTokens,
    AuthGuard,
    OriginGuard,
    {
      provide: GOOGLE_ID_TOKEN_VERIFIER,
      useFactory: (config: AppConfig) => new JoseGoogleIdTokenVerifier(config),
      inject: [APP_CONFIG],
    },
  ],
  exports: [AuthService, AuthGuard, OriginGuard],
})
export class AuthModule {}
