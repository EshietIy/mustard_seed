import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

/** ₦1,000,000: far above any real delivery fee, so a typo in kobo is caught. */
const MAX_FEE_KOBO = 100_000_000;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIME_MESSAGE = '$property must be a 24-hour time like 08:00';

export class SettingsDto {
  @ApiProperty({ type: 'integer', example: 150000, description: 'Flat delivery fee in kobo' })
  deliveryFeeKobo!: number;

  @ApiProperty({ example: 'Calabar', description: 'Where delivery is offered (read-only)' })
  deliveryArea!: string;

  @ApiProperty({ example: '08:00' }) opensAt!: string;
  @ApiProperty({ example: '23:00' }) closesAt!: string;
  @ApiProperty({ example: '22:30', description: 'Online orders close at this time' })
  onlineOrdersCloseAt!: string;

  @ApiProperty({ example: 'Africa/Lagos', description: 'Hours are in this zone (read-only)' })
  timezone!: string;
}

/** Any of these; at least one. Times are "HH:MM" (24-hour, WAT). */
export class UpdateSettingsDto {
  @ApiPropertyOptional({ type: 'integer', minimum: 0, maximum: MAX_FEE_KOBO, example: 150000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_FEE_KOBO)
  deliveryFeeKobo?: number;

  @ApiPropertyOptional({ example: '08:00', pattern: TIME.source })
  @IsOptional()
  @IsString()
  @Matches(TIME, { message: TIME_MESSAGE })
  opensAt?: string;

  @ApiPropertyOptional({ example: '23:00', pattern: TIME.source })
  @IsOptional()
  @IsString()
  @Matches(TIME, { message: TIME_MESSAGE })
  closesAt?: string;

  @ApiPropertyOptional({ example: '22:30', pattern: TIME.source })
  @IsOptional()
  @IsString()
  @Matches(TIME, { message: TIME_MESSAGE })
  onlineOrdersCloseAt?: string;
}
