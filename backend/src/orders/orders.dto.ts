import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_QUANTITY, type Fulfilment } from './pricing';
import { normalizeNigerianPhone } from './phone';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class OrderItemInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  menuItemId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Chosen option ids (see the menu item’s optionGroups); omit for none',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  optionIds?: string[];
}

export class QuoteRequestDto {
  @ApiProperty({ enum: ['delivery', 'pickup'] })
  @IsIn(['delivery', 'pickup'])
  fulfilment!: Fulfilment;

  @ApiProperty({ example: 'calabar' })
  @IsString()
  @Matches(/^[a-z]{1,40}$/)
  branchId!: string;

  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items!: OrderItemInputDto[];
}

export class ContactDto {
  @ApiProperty({ example: 'Ekaette Bassey' })
  @Transform(trim)
  @IsString()
  @Length(2, 120, { message: 'Enter the name for this order' })
  fullName!: string;

  @ApiProperty({ example: '0803 123 4567', description: 'Nigerian number; stored as +234…' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (normalizeNigerianPhone(value) ?? value) : value,
  )
  @IsString()
  @Matches(/^\+234[1-9]\d{9}$/, {
    message: 'Enter a valid Nigerian phone number, e.g. 0803 123 4567',
  })
  phone!: string;
}

export class DeliveryAddressDto {
  @ApiProperty({ example: '12 Marian Road, near the roundabout' })
  @Transform(trim)
  @IsString()
  @Length(5, 300, { message: 'Enter your street address' })
  streetAddress!: string;

  @ApiPropertyOptional({ example: 'Calabar', description: 'Delivery is Calabar only' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;
}

export class PlaceOrderDto extends QuoteRequestDto {
  @ApiProperty({ type: ContactDto })
  @ValidateNested()
  @Type(() => ContactDto)
  contact!: ContactDto;

  @ApiPropertyOptional({ type: DeliveryAddressDto, description: 'Required for delivery only' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  delivery?: DeliveryAddressDto;

  @ApiProperty({ description: 'The total (kobo) the customer was shown' })
  @IsInt()
  @Min(1)
  expectedTotalKobo!: number;

  @ApiProperty({ format: 'uuid', description: 'One per checkout attempt (idempotency)' })
  @IsUUID()
  clientRequestId!: string;
}

class QuoteLineOptionDto {
  @ApiProperty() id!: string;
  @ApiProperty() groupId!: string;
  @ApiProperty({ example: 'Soup protein' }) groupName!: string;
  @ApiProperty({ example: 'Chicken' }) name!: string;
  @ApiProperty() priceDeltaKobo!: number;
}

class QuoteLineDto {
  @ApiProperty() menuItemId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: Number, nullable: true }) unitPriceKobo!: number | null;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: Number, nullable: true }) lineTotalKobo!: number | null;
  @ApiProperty() isAvailable!: boolean;
  @ApiProperty({ type: [QuoteLineOptionDto], description: 'Included in unitPriceKobo' })
  options!: QuoteLineOptionDto[];
}

class QuoteProblemDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional() menuItemId?: string;
  @ApiPropertyOptional({ description: 'Option problems: index of the line in the request' })
  lineIndex?: number;
  @ApiPropertyOptional({ description: 'Option problems: the group to show the error next to' })
  groupId?: string;
  @ApiPropertyOptional() optionId?: string;
}

class OrderingWindowDto {
  @ApiProperty() open!: boolean;
  @ApiProperty({ example: '08:00' }) opensAt!: string;
  @ApiProperty({ example: '22:30' }) onlineOrdersCloseAt!: string;
  @ApiProperty({ example: 'Africa/Lagos' }) timezone!: string;
}

export class QuoteDto {
  @ApiProperty({ type: [QuoteLineDto] }) lines!: QuoteLineDto[];
  @ApiProperty({ type: Number, nullable: true }) subtotalKobo!: number | null;
  @ApiProperty() deliveryFeeKobo!: number;
  @ApiProperty({ type: Number, nullable: true }) totalKobo!: number | null;
  @ApiProperty({ type: OrderingWindowDto }) ordering!: OrderingWindowDto;
  @ApiProperty({ type: [QuoteProblemDto] }) problems!: QuoteProblemDto[];
  @ApiProperty() canPlaceOrder!: boolean;
}

class OrderLineOptionDto {
  @ApiProperty() optionId!: string;
  @ApiProperty({ example: 'Soup protein' }) groupName!: string;
  @ApiProperty({ example: 'Chicken' }) name!: string;
  @ApiProperty() priceDeltaKobo!: number;
}

class OrderLineDto {
  @ApiProperty() menuItemId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: 'Includes the chosen options' }) unitPriceKobo!: number;
  @ApiProperty() quantity!: number;
  @ApiProperty() lineTotalKobo!: number;
  @ApiProperty({ type: [OrderLineOptionDto], description: 'Snapshot taken when ordering' })
  options!: OrderLineOptionDto[];
}

/** The public tracking view: everything the customer sees except internal ids. */
export class TrackedOrderDto {
  @ApiProperty({ example: '#MS-0001' }) orderNumber!: string;
  @ApiProperty({ example: 'awaiting_payment' }) status!: string;
  @ApiProperty({ enum: ['delivery', 'pickup'] }) fulfilment!: Fulfilment;
  @ApiProperty() branch!: { id: string; city: string };
  @ApiProperty({ type: [OrderLineDto] }) items!: OrderLineDto[];
  @ApiProperty() subtotalKobo!: number;
  @ApiProperty() deliveryFeeKobo!: number;
  @ApiProperty() totalKobo!: number;
  @ApiProperty({ example: 'NGN' }) currency!: 'NGN';
  @ApiProperty() contact!: { fullName: string; phone: string };
  @ApiProperty({ nullable: true }) delivery!: { streetAddress: string; city: string } | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class OrderDto extends TrackedOrderDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
}
