import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Public } from '../auth/guards/public.decorator';
import { StrictThrottle } from '../throttling/throttling';
import { OrderDto, PlaceOrderDto, QuoteDto, QuoteRequestDto, TrackedOrderDto } from './orders.dto';
import { OrdersService, type OrderView, type TrackedOrderView } from './orders.service';
import type { Quote } from './pricing';

@ApiTags('orders')
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** Server-computed totals and any reasons the order can't be placed yet. */
  @Post('quote')
  @Public()
  @HttpCode(200)
  @ApiOkResponse({ type: QuoteDto })
  quote(@Body() body: QuoteRequestDto): Promise<Quote> {
    return this.orders.quote(body);
  }

  @Post()
  @StrictThrottle()
  @ApiCookieAuth()
  @ApiCreatedResponse({ type: OrderDto, description: 'Order created, awaiting payment' })
  @ApiOkResponse({ type: OrderDto, description: 'Same checkout submitted again: existing order' })
  @ApiUnprocessableEntityResponse({ description: 'Closed, sold out, unpriced, outside Calabar…' })
  @ApiConflictResponse({ description: 'PRICE_CHANGED: totals differ from what the customer saw' })
  async place(
    @Body() body: PlaceOrderDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderView> {
    const user = req.user as AuthenticatedUser;
    // pino-http always assigns a string request id (see logging/http-logger.ts).
    const correlationId = typeof req.id === 'string' ? req.id : '';
    const { order, created } = await this.orders.place(user, body, correlationId);
    if (!created) res.status(200);
    req.log.info(
      {
        event: created ? 'order.created' : 'order.replayed',
        outcome: 'SUCCESS',
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: user.id,
        amountKobo: order.totalKobo,
        fulfilment: order.fulfilment,
        statusTransition: created ? 'none -> awaiting_payment' : null,
      },
      created ? 'Order created' : 'Duplicate checkout submit returned the existing order',
    );
    return order;
  }

  /** Public live-status page; the unguessable token from the email is the only credential. */
  @Get('track/:token')
  @Public()
  @ApiOkResponse({ type: TrackedOrderDto })
  @ApiNotFoundResponse({ description: 'Unknown or malformed tracking token' })
  track(@Param('token') token: string): Promise<TrackedOrderView> {
    return this.orders.track(token);
  }

  @Get(':id')
  @ApiCookieAuth()
  @ApiOkResponse({ type: OrderDto })
  @ApiNotFoundResponse({ description: 'No such order, or not yours' })
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<OrderView> {
    return this.orders.getForUser(req.user as AuthenticatedUser, id);
  }
}
