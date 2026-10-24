import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { MENU_CATEGORIES } from '../menu/menu.types';
import { MenuImageDto } from '../menu/menu.dto';

/** ₦1,000,000: far above any dish, low enough to catch a typo of extra zeros. */
const MAX_PRICE_KOBO = 100_000_000;

export class UpdateMenuItemDto {
  @ApiPropertyOptional({ description: 'Switch the dish on or off (supervisors may change this)' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: MAX_PRICE_KOBO,
    description: 'super_admin only. Price in kobo; null shows [PRICE] and stops orders',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_KOBO)
  priceKobo?: number | null;
}

export class AdminMenuItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: MENU_CATEGORIES.map((c) => c.id) })
  category!: string;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Price in kobo; null until the real price is supplied',
  })
  priceKobo!: number | null;

  @ApiProperty()
  isAvailable!: boolean;
}

export class StorageUsageDto {
  @ApiProperty({ type: 'integer' })
  usedBytes!: number;

  @ApiProperty({ type: 'integer', description: 'IMAGE_STORAGE_ALLOWANCE_MB in bytes' })
  allowanceBytes!: number;

  @ApiProperty({ description: 'Used share of the allowance, one decimal place' })
  percent!: number;

  @ApiProperty({ description: 'True from 70%: tell the owner' })
  nearLimit!: boolean;
}

export class ImageSizesDto {
  @ApiProperty({ type: 'integer' })
  originalBytes!: number;

  @ApiProperty({ type: 'integer' })
  thumbBytes!: number;

  @ApiProperty({ type: 'integer' })
  fullBytes!: number;
}

export class ImageUploadResultDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ type: MenuImageDto })
  image!: MenuImageDto;

  @ApiProperty({ type: ImageSizesDto })
  sizes!: ImageSizesDto;

  @ApiProperty({ description: 'False if the replaced photo’s files are still in storage' })
  oldFilesRemoved!: boolean;

  @ApiProperty({
    type: StorageUsageDto,
    nullable: true,
    description: 'Null if the total could not be read',
  })
  storage!: StorageUsageDto | null;
}
