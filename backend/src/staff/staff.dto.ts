import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, MaxLength } from 'class-validator';
import { STAFF_ROLES, type StaffRole } from '../auth/auth.types';

const lowerTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CreateStaffDto {
  @ApiProperty({ example: 'chef@example.com', description: 'Their Google account email' })
  @Transform(lowerTrim)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: STAFF_ROLES })
  @IsIn(STAFF_ROLES)
  role!: StaffRole;
}

export class UpdateStaffDto {
  @ApiPropertyOptional({ enum: STAFF_ROLES })
  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: StaffRole;

  @ApiPropertyOptional({ description: 'false deactivates, true reactivates' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class StaffDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: STAFF_ROLES })
  role!: StaffRole;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deactivatedAt!: string | null;
}
