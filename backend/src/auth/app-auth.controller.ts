import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { StrictThrottle } from '../throttling/throttling';
import { AppAuthService, type AppSession } from './app-auth.service';
import { AppGoogleSignInDto, AppRefreshDto, AppSessionDto } from './auth.dto';
import { emailDomain, type AuthenticatedUser } from './auth.types';
import { Public } from './guards/public.decorator';

interface AppSessionBody {
  user: AuthenticatedUser;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

const body = (s: AppSession): AppSessionBody => ({
  user: s.user,
  accessToken: s.accessToken,
  accessTokenExpiresAt: s.accessTokenExpiresAt.toISOString(),
  refreshToken: s.refreshToken,
  refreshTokenExpiresAt: s.refreshTokenExpiresAt.toISOString(),
});

/**
 * Sign-in for the Android app (AGENT.md section 15). Tokens are returned in the body for the
 * app to keep in encrypted storage; they are never logged. The website uses /auth/google.
 */
@ApiTags('auth')
@Public()
@Controller({ path: 'auth/app', version: '1' })
export class AppAuthController {
  constructor(private readonly app: AppAuthService) {}

  @Post('google')
  @StrictThrottle()
  @HttpCode(200)
  @ApiOkResponse({ type: AppSessionDto })
  @ApiUnauthorizedResponse({ description: 'Invalid Google token or unverified email' })
  @ApiTooManyRequestsResponse()
  async google(@Body() dto: AppGoogleSignInDto, @Req() req: Request): Promise<AppSessionBody> {
    const session = await this.app.signIn(dto.idToken);
    req.log.info(
      {
        event: 'auth.app_sign_in',
        outcome: 'SUCCESS',
        userId: session.user.id,
        role: session.user.role,
        emailDomain: emailDomain(session.user.email),
        isNewUser: session.isNewUser,
      },
      'Signed in to the app with Google',
    );
    return body(session);
  }

  @Post('refresh')
  @StrictThrottle()
  @HttpCode(200)
  @ApiOkResponse({ type: AppSessionDto, description: 'New tokens; the old refresh token is spent' })
  @ApiUnauthorizedResponse({ description: 'SESSION_EXPIRED, or SESSION_REVOKED if reused' })
  async refresh(@Body() dto: AppRefreshDto, @Req() req: Request): Promise<AppSessionBody> {
    const session = await this.app.refresh(dto.refreshToken);
    req.log.info(
      { event: 'auth.app_refresh', outcome: 'SUCCESS', userId: session.user.id },
      'App tokens refreshed',
    );
    return body(session);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Signed out of the app (idempotent)' })
  async logout(@Body() dto: AppRefreshDto, @Req() req: Request): Promise<void> {
    await this.app.signOut(dto.refreshToken);
    req.log.info({ event: 'auth.app_sign_out', outcome: 'SUCCESS' }, 'Signed out of the app');
  }
}
