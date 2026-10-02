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
