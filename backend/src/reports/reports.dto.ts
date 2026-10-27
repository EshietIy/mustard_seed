import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { MENU_CATEGORIES } from '../menu/menu.types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORY_IDS = MENU_CATEGORIES.map((c) => c.id);

export class SalesReportQueryDto {
  @ApiProperty({ example: '2026-10-01', description: 'First day, WAT (YYYY-MM-DD)' })
  @Matches(DATE, { message: 'from must be a date written as YYYY-MM-DD' })
  from!: string;

  @ApiProperty({
    example: '2026-10-31',
    description: 'Last day, WAT (YYYY-MM-DD), included. At most 366 days after from',
  })
  @Matches(DATE, { message: 'to must be a date written as YYYY-MM-DD' })
  to!: string;
}

class UnpaidCountsDto {
  @ApiProperty({ type: 'integer', description: 'Payment declined or failed' })
  paymentFailed!: number;

  @ApiProperty({ type: 'integer', description: 'Not paid within the payment window' })
  expired!: number;
}

class SalesSummaryDto {
  @ApiProperty({ type: 'integer', description: 'Paid orders' })
  orders!: number;

  @ApiProperty({ type: 'integer', description: 'What customers paid in kobo, delivery included' })
  salesKobo!: number;

  @ApiProperty({ type: 'integer' })
  foodSalesKobo!: number;

  @ApiProperty({ type: 'integer' })
  deliveryFeesKobo!: number;

  @ApiProperty({ type: 'integer', description: 'Rounded to the nearest kobo; 0 with no orders' })
  averageOrderKobo!: number;

  @ApiProperty({ type: 'integer' })
  itemsSold!: number;

  @ApiProperty({ type: 'integer' })
  deliveryOrders!: number;

  @ApiProperty({ type: 'integer' })
  pickupOrders!: number;

  @ApiProperty({ type: UnpaidCountsDto, description: 'Orders placed in the period, never paid' })
  unpaid!: UnpaidCountsDto;
}

class DishSalesDto {
  @ApiProperty({ format: 'uuid' })
  menuItemId!: string;

  @ApiProperty({ description: 'Current name (the name sold under if the dish is gone)' })
  name!: string;

  @ApiProperty({ enum: CATEGORY_IDS, nullable: true })
  category!: string | null;

  @ApiProperty()
  retired!: boolean;

  @ApiProperty({ type: 'integer' })
  quantity!: number;

  @ApiProperty({ type: 'integer' })
  salesKobo!: number;

  @ApiProperty({ type: 'integer', description: 'Paid orders that included the dish' })
  orders!: number;
}

class UnsoldDishDto {
  @ApiProperty({ format: 'uuid' })
  menuItemId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: CATEGORY_IDS })
  category!: string;
}

class OptionSalesDto {
  @ApiProperty({ example: 'Soup protein' })
  groupName!: string;

  @ApiProperty({ example: 'Beef' })
  name!: string;

  @ApiProperty({ type: 'integer' })
  quantity!: number;

  @ApiProperty({ type: 'integer', description: 'Price differences paid for this option, kobo' })
  extraSalesKobo!: number;
}

class DaySalesDto {
  @ApiProperty({ example: '2026-10-20' })
  date!: string;

  @ApiProperty({ type: 'integer' })
  orders!: number;

  @ApiProperty({ type: 'integer' })
  salesKobo!: number;
}

class HourSalesDto {
  @ApiProperty({ type: 'integer', minimum: 0, maximum: 23, description: 'WAT hour paid' })
  hour!: number;

  @ApiProperty({ type: 'integer' })
  orders!: number;

  @ApiProperty({ type: 'integer' })
  salesKobo!: number;
}

class WeekdaySalesDto {
  @ApiProperty({
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  })
  weekday!: string;

  @ApiProperty({ type: 'integer' })
  orders!: number;

  @ApiProperty({ type: 'integer' })
  salesKobo!: number;
}

export class SalesReportDto {
  @ApiProperty({ example: '2026-10-01' })
  from!: string;

  @ApiProperty({ example: '2026-10-31' })
  to!: string;

  @ApiProperty({ enum: ['Africa/Lagos'] })
  timezone!: string;

  @ApiProperty({ type: SalesSummaryDto })
  summary!: SalesSummaryDto;

  @ApiProperty({ type: DishSalesDto, isArray: true, description: 'Best sellers first' })
  dishes!: DishSalesDto[];

  @ApiProperty({ type: UnsoldDishDto, isArray: true, description: 'On the menu, sold nothing' })
  unsoldDishes!: UnsoldDishDto[];

  @ApiProperty({ type: OptionSalesDto, isArray: true })
  options!: OptionSalesDto[];

  @ApiProperty({ type: DaySalesDto, isArray: true, description: 'Every day, empty ones included' })
  days!: DaySalesDto[];

  @ApiProperty({ type: HourSalesDto, isArray: true })
  hours!: HourSalesDto[];

  @ApiProperty({ type: WeekdaySalesDto, isArray: true, description: 'Monday first' })
  weekdays!: WeekdaySalesDto[];
}
