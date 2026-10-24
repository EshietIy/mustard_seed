import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { MENU_CATEGORIES } from '../menu/menu.types';

export class UpdateMenuItemDto {
  @ApiPropertyOptional({ description: 'Switch the dish on or off (supervisors may change this)' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
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
