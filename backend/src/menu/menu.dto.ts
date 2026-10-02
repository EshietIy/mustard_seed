import { ApiProperty } from '@nestjs/swagger';
import { MENU_CATEGORIES, type MenuCategoryId } from './menu.types';

export class MenuImageDto {
  @ApiProperty({ description: 'Small WebP for lists' })
  thumbnailUrl!: string;

  @ApiProperty({ description: 'Large WebP for detail views' })
  fullUrl!: string;
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
