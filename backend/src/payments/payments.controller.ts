import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Public } from '../auth/guards/public.decorator';
import { OrderDto } from '../orders/orders.dto';
import type { OrderView } from '../orders/orders.service';
import { StrictThrottle } from '../throttling/throttling';
import { PaymentStartedDto, VerifyPaymentDto } from './payments.dto';
import { PaymentsService, type PaymentContext, type WebhookResult } from './payments.service';

const contextOf = (req: Request): PaymentContext => ({
  correlationId: typeof req.id === 'string' ? req.id : '',
  log: req.log,
});

@ApiTags('payments')
@Controller({ version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** "Pay now": returns the Paystack checkout link for the customer's order. */
  @Post('orders/:id/payments')
  @StrictThrottle()
  @ApiCookieAuth()
  @ApiCreatedResponse({ type: PaymentStartedDto })
  @ApiConflictResponse({ description: 'Order already paid, expired or failed' })
  @ApiServiceUnavailableResponse({ description: 'Paystack unreachable; order unchanged' })
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<{ reference: string; authorizationUrl: string }> {
    const { reference, authorizationUrl } = await this.payments.initialize(
      req.user as AuthenticatedUser,
      id,
      contextOf(req),
    );
    return { reference, authorizationUrl };
  }

  /** Customer came back from the payment page: confirm with Paystack, return the order. */
  @Post('payments/verify')
  @HttpCode(200)
  @ApiCookieAuth()
  @ApiOkResponse({ type: OrderDto })
  verify(@Body() body: VerifyPaymentDto, @Req() req: Request): Promise<OrderView> {
    return this.payments.verifyForUser(
      req.user as AuthenticatedUser,
      body.reference,
      contextOf(req),
    );
  }

  /** Server-to-server from Paystack; protected by the HMAC signature, not CORS or cookies. */
  @Post('payments/webhook')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string | undefined,
  ): Promise<{ result: WebhookResult }> {
    return this.payments.handleWebhook(req.rawBody, signature, req.body, contextOf(req));
  }
}
