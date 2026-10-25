import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MENU_CATEGORIES, type MenuCategoryId } from '../menu/menu.types';
import { MenuImageDto } from '../menu/menu.dto';

/** ₦1,000,000: far above any dish, low enough to catch a typo of extra zeros. */
const MAX_PRICE_KOBO = 100_000_000;
/** Matches the menu_items column checks. */
const MAX_NAME = 120;
const MAX_DESCRIPTION = 500;
const CATEGORY_IDS = MENU_CATEGORIES.map((c) => c.id);

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMenuItemDto {
  @ApiProperty({ minLength: 1, maxLength: MAX_NAME, example: 'Atama Soup' })
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME)
  name!: string;

  @ApiPropertyOptional({ maxLength: MAX_DESCRIPTION, default: '' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_DESCRIPTION)
  description?: string;

  @ApiProperty({ enum: CATEGORY_IDS })
  @IsIn(CATEGORY_IDS)
  category!: MenuCategoryId;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    minimum: 1,
    maximum: MAX_PRICE_KOBO,
    description: 'Price in kobo; leave out or null to show [PRICE] until it is known',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(MAX_PRICE_KOBO)
  priceKobo?: number | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isHouseSignature?: boolean;
}

export class MoveMenuItemDto {
  @ApiProperty({ enum: ['up', 'down'], description: 'One place, within the dish’s category' })
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}

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

  @ApiPropertyOptional({ minLength: 1, maxLength: MAX_NAME, description: 'super_admin only' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, MAX_NAME)
  name?: string;

  @ApiPropertyOptional({ maxLength: MAX_DESCRIPTION, description: 'super_admin only' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_DESCRIPTION)
  description?: string;

  @ApiPropertyOptional({
    enum: CATEGORY_IDS,
    description: 'super_admin only. The dish goes last in its new category',
  })
  @IsOptional()
  @IsIn(CATEGORY_IDS)
  category?: MenuCategoryId;

  @ApiPropertyOptional({ description: 'super_admin only' })
  @IsOptional()
  @IsBoolean()
  isHouseSignature?: boolean;

  @ApiPropertyOptional({
    description:
      'super_admin only, sent on its own. True retires the dish (off the menu, kept for past orders); false brings it back switched off',
  })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class AdminMenuItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Web-address name, made from the dish name when it was added' })
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: CATEGORY_IDS })
  category!: string;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Price in kobo; null until the real price is supplied',
  })
  priceKobo!: number | null;

  @ApiProperty()
  isAvailable!: boolean;

  @ApiProperty()
  isHouseSignature!: boolean;

  @ApiProperty({ type: 'integer', description: 'Position within the category, lowest first' })
  sortOrder!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When the dish was retired; null while it is on the menu',
  })
  archivedAt!: string | null;
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
