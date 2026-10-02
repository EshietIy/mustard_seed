import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { StrictThrottle } from '../throttling/throttling';
import { AuthUserResponseDto, GoogleSignInDto } from './auth.dto';
import { AuthService } from './auth.service';
import { emailDomain, type AuthenticatedUser } from './auth.types';
import { Public } from './guards/public.decorator';
import { SESSION_COOKIE, sessionCookieOptions } from './session/cookies';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('google')
  @Public()
  @StrictThrottle()
  @HttpCode(200)
  @ApiOkResponse({ type: AuthUserResponseDto, description: 'Signed in; session cookie set' })
  @ApiUnauthorizedResponse({ description: 'Invalid Google token or unverified email' })
  @ApiTooManyRequestsResponse()
  async google(
    @Body() body: GoogleSignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const { user, session, isNewUser } = await this.auth.signInWithGoogle(body.credential);
    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    req.log.info(
      {
        event: 'auth.sign_in',
        outcome: 'SUCCESS',
        userId: user.id,
        role: user.role,
        emailDomain: emailDomain(user.email),
        isNewUser,
      },
      'Signed in with Google',
    );
    return { user };
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOkResponse({ type: AuthUserResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not signed in or the session expired' })
  me(@Req() req: Request): { user: AuthenticatedUser } {
    // AuthGuard guarantees a user on non-public routes.
    return { user: req.user as AuthenticatedUser };
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Session cookie cleared (idempotent)' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    // clearCookie sets its own past expiry; the other attributes must match the original cookie.
    const options = sessionCookieOptions(new Date(0));
    delete options.expires;
    res.clearCookie(SESSION_COOKIE, options);
    req.log.info(
      { event: 'auth.sign_out', outcome: 'SUCCESS', userId: req.user?.id ?? null },
      'Signed out',
    );
  }
}
