import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyPaymentDto {
  @ApiProperty({ example: 'MS0001-Ab3dEf9h', description: 'The reference Paystack returned with' })
  @IsString()
  @Matches(/^[\w-]{8,100}$/, { message: 'reference is not valid' })
  reference!: string;
}

export class PaymentStartedDto {
  @ApiProperty() reference!: string;
  @ApiProperty({ description: 'Send the customer here to pay' }) authorizationUrl!: string;
}
