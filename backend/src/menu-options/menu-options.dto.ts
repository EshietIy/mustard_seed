import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Price differences are extra costs only, in kobo (₦100,000 at most). */
const MAX_DELTA_KOBO = 10_000_000;

export class CreateOptionGroupDto {
  @ApiProperty({ example: 'Soup protein' })
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  name!: string;

  @ApiProperty({ description: 'Fewest choices; 1 or more makes the choice required', example: 1 })
  @IsInt()
  @Min(0)
  @Max(10)
  minChoices!: number;

  @ApiProperty({ description: 'Most choices; 1 means a single choice', example: 1 })
  @IsInt()
  @Min(1)
  @Max(10)
  maxChoices!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class UpdateOptionGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  minChoices?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxChoices?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'true archives (hidden from the menu), false restores' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class CreateOptionDto {
  @ApiProperty({ example: 'Goat' })
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  name!: string;

  @ApiPropertyOptional({ description: 'Extra cost in kobo; default 0', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DELTA_KOBO)
  priceDeltaKobo?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Items (among those using the group) that offer the new option; the rest exclude it. Default: all.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  itemIds?: string[];
}

export class UpdateOptionDto {
  @ApiPropertyOptional({ description: 'super_admin only' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 40)
  name?: string;

  @ApiPropertyOptional({ description: 'super_admin only' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DELTA_KOBO)
  priceDeltaKobo?: number;

  @ApiPropertyOptional({ description: 'super_admin only' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Supervisors may change this (switch on/off)' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'super_admin only; true archives, false restores' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class SetItemOptionGroupsDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'In display order; [] removes all' })
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  groupIds!: string[];
}

export class SetItemOptionOverrideDto {
  @ApiPropertyOptional({ description: 'true: this item does not offer the option' })
  @IsOptional()
  @IsBoolean()
  isExcluded?: boolean;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: "This item's price difference in kobo; null uses the option's own",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(MAX_DELTA_KOBO)
  priceDeltaKobo?: number | null;
}

class PriceOverrideDto {
  @ApiProperty({ format: 'uuid' }) itemId!: string;
  @ApiProperty() priceDeltaKobo!: number;
}

export class AdminOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() priceDeltaKobo!: number;
  @ApiProperty() isAvailable!: boolean;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() archived!: boolean;
  @ApiProperty({ type: [String], description: 'Items using the group that do not offer it' })
  excludedFromItemIds!: string[];
  @ApiProperty({ type: [PriceOverrideDto] }) priceOverrides!: PriceOverrideDto[];
}

export class AdminOptionGroupDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() minChoices!: number;
  @ApiProperty() maxChoices!: number;
  @ApiProperty() sortOrder!: number;
  @ApiProperty() archived!: boolean;
  @ApiProperty({ type: [String], description: 'Items that offer this group' }) itemIds!: string[];
  @ApiProperty({ type: [AdminOptionDto] }) options!: AdminOptionDto[];
}
