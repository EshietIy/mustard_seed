import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { StaffModule } from '../staff/staff.module';
import { UsersModule } from '../users/users.module';
import { AppAuthController } from './app-auth.controller';
import { AppAuthService } from './app-auth.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GOOGLE_ID_TOKEN_VERIFIER } from './google/google-id-token.verifier';
import { JoseGoogleIdTokenVerifier } from './google/jose-google-id-token.verifier';
import { AppVersionGuard } from './guards/app-version.guard';
import { AuthGuard } from './guards/auth.guard';
import { OriginGuard } from './guards/origin.guard';
import { APP_SESSIONS_REPOSITORY } from './session/app-sessions.repository';
import { AppTokens } from './session/app-tokens';
import { SessionTokens } from './session/session-tokens';
import { SupabaseAppSessionsRepository } from './session/supabase-app-sessions.repository';

@Module({
  imports: [UsersModule, StaffModule],
  controllers: [AuthController, AppAuthController],
  providers: [
    AuthService,
    AppAuthService,
    SessionTokens,
    AppTokens,
    AuthGuard,
    OriginGuard,
    AppVersionGuard,
    { provide: APP_SESSIONS_REPOSITORY, useClass: SupabaseAppSessionsRepository },
    {
      provide: GOOGLE_ID_TOKEN_VERIFIER,
      useFactory: (config: AppConfig) => new JoseGoogleIdTokenVerifier(config),
      inject: [APP_CONFIG],
    },
  ],
  exports: [AuthService, AuthGuard, OriginGuard, AppVersionGuard],
})
export class AuthModule {}
