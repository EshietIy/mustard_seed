import { ApiProperty } from '@nestjs/swagger';
import { MENU_CATEGORIES, type MenuCategoryId } from './menu.types';

export class MenuImageDto {
  @ApiProperty({ description: 'Small WebP for lists' })
  thumbnailUrl!: string;

  @ApiProperty({ description: 'Large WebP for detail views' })
  fullUrl!: string;
}

export class MenuOptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Chicken' })
  name!: string;

  @ApiProperty({ description: "Added to the item's price, in kobo (0 = no extra cost)" })
  priceDeltaKobo!: number;

  @ApiProperty({ description: 'False when staff have switched it off: show it, but not choosable' })
  isAvailable!: boolean;
}

export class MenuOptionGroupDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Soup protein' })
  name!: string;

  @ApiProperty({ description: 'Fewest choices allowed; 1 or more means a choice is required' })
  minChoices!: number;

  @ApiProperty({ description: 'Most choices allowed; 1 means a single choice (radio buttons)' })
  maxChoices!: number;

  @ApiProperty({ type: [MenuOptionDto] })
  options!: MenuOptionDto[];
}

export class MenuItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Price in kobo; null until the real price is supplied ([PRICE] placeholder)',
  })
  priceKobo!: number | null;

  @ApiProperty()
  isHouseSignature!: boolean;

  @ApiProperty({ description: 'Shown in the Fresh juices band' })
  isFreshJuice!: boolean;

  @ApiProperty({ description: 'False when staff have marked it sold out' })
  isAvailable!: boolean;

  @ApiProperty({ type: MenuImageDto, nullable: true })
  image!: MenuImageDto | null;

  @ApiProperty({
    type: [MenuOptionGroupDto],
    description: 'Choices offered on this item (empty if none); see AGENT.md section 14',
  })
  optionGroups!: MenuOptionGroupDto[];
}

export class MenuCategoryDto {
  @ApiProperty({ enum: MENU_CATEGORIES.map((c) => c.id) })
  id!: MenuCategoryId;

  @ApiProperty()
  label!: string;

  @ApiProperty({ type: [MenuItemDto] })
  items!: MenuItemDto[];
}

export class MenuDto {
  @ApiProperty({ type: [MenuCategoryDto] })
  categories!: MenuCategoryDto[];
}
