import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { Role } from './auth.types';

export class GoogleSignInDto {
  @ApiProperty({ description: 'The ID token (credential) returned by Google Identity Services' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  credential!: string;
}

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ enum: ['customer', 'supervisor', 'super_admin'] })
  role!: Role;
}

export class AuthUserResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class AppGoogleSignInDto {
  @ApiProperty({ description: "Google ID token from Android's Credential Manager" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  idToken!: string;
}

export class AppRefreshDto {
  @ApiProperty({ description: 'The refresh token from sign-in or the last refresh' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refreshToken!: string;
}

export class AppSessionDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ description: 'Send as "Authorization: Bearer <token>"' })
  accessToken!: string;

  @ApiProperty({ format: 'date-time' })
  accessTokenExpiresAt!: string;

  @ApiProperty({ description: 'Single use: each refresh returns a new one. Keep it secret.' })
  refreshToken!: string;

  @ApiProperty({ format: 'date-time' })
  refreshTokenExpiresAt!: string;
}
