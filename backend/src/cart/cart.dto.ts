import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CartLineInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  menuItemId!: string;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Chosen options; omit for none',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  optionIds?: string[];

  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: 20,
    description: 'Sets (never adds to) the quantity',
  })
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class MergeCartDto {
  @ApiProperty({ type: [CartLineInputDto], description: "The guest's device cart" })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CartLineInputDto)
  lines!: CartLineInputDto[];
}

export class CartLineOptionDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Soup protein' }) groupName!: string;
  @ApiProperty({ example: 'Chicken' }) name!: string;
  @ApiProperty({ type: 'integer' }) priceDeltaKobo!: number;
}

export class CartLineProblemDto {
  @ApiProperty({ example: 'ITEM_UNAVAILABLE' }) code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ description: 'Option problems: the group to show it next to' })
  groupId?: string;
  @ApiPropertyOptional() optionId?: string;
}

export class PriceChangeDto {
  @ApiProperty({ type: 'integer' }) fromKobo!: number;
  @ApiProperty({ type: 'integer' }) toKobo!: number;
}

export class CartLineDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) menuItemId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: [String] }) optionIds!: string[];
  @ApiProperty({ type: [CartLineOptionDto] }) options!: CartLineOptionDto[];
  @ApiProperty({ type: 'integer' }) quantity!: number;
  @ApiProperty({ type: 'integer', nullable: true }) unitPriceKobo!: number | null;
  @ApiProperty({ type: 'integer', nullable: true }) lineTotalKobo!: number | null;
  @ApiProperty() isAvailable!: boolean;
  @ApiProperty({ type: [CartLineProblemDto], description: 'Must be fixed before checkout' })
  problems!: CartLineProblemDto[];
  @ApiProperty({
    type: PriceChangeDto,
    nullable: true,
    description: 'Set the line again to accept the new price',
  })
  priceChange!: PriceChangeDto | null;
}

export class CartDto {
  @ApiProperty({ type: [CartLineDto] }) lines!: CartLineDto[];
  @ApiProperty({ type: 'integer' }) itemCount!: number;
  @ApiProperty({ type: 'integer', nullable: true }) subtotalKobo!: number | null;
  @ApiProperty({ description: 'Something to order and nothing to fix' }) canCheckout!: boolean;
}

export class MergedCartDto {
  @ApiProperty({ type: CartDto }) cart!: CartDto;
  @ApiProperty({
    type: 'integer',
    description: 'Lines left out because they can no longer be ordered',
  })
  skipped!: number;
}
