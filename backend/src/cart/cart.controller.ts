import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CartDto, CartLineInputDto, MergeCartDto, MergedCartDto } from './cart.dto';
import { CartService, type CartView } from './cart.service';

/**
 * The signed-in user's cart (AGENT.md section 13). There is no cart id: every route works on
 * the caller's own cart, so one user can never reach another's.
 */
@ApiTags('cart')
@ApiCookieAuth()
@Controller({ path: 'cart', version: '1' })
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOkResponse({ type: CartDto })
  get(@Req() req: Request): Promise<CartView> {
    return this.cart.view(userId(req));
  }

  @Put('lines')
  @ApiOkResponse({ type: CartDto, description: 'Line created or its quantity set' })
  @ApiNotFoundResponse({ description: 'MENU_ITEM_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({ description: 'Sold out, unpriced, or the choices are invalid' })
  setLine(@Body() body: CartLineInputDto, @Req() req: Request): Promise<CartView> {
    return this.cart.setLine(userId(req), body);
  }

  @Delete('lines/:lineId')
  @ApiOkResponse({ type: CartDto })
  @ApiNotFoundResponse({ description: 'CART_LINE_NOT_FOUND' })
  deleteLine(
    @Param('lineId', ParseUUIDPipe) lineId: string,
    @Req() req: Request,
  ): Promise<CartView> {
    return this.cart.deleteLine(userId(req), lineId);
  }

  @Delete()
  @ApiOkResponse({ type: CartDto })
  clear(@Req() req: Request): Promise<CartView> {
    return this.cart.clear(userId(req));
  }

  @Post('merge')
  @HttpCode(200)
  @ApiOkResponse({ type: MergedCartDto })
  async merge(
    @Body() body: MergeCartDto,
    @Req() req: Request,
  ): Promise<{ cart: CartView; skipped: number }> {
    const result = await this.cart.merge(userId(req), body.lines);
    req.log.info(
      {
        event: 'cart.merged',
        outcome: 'SUCCESS',
        userId: userId(req),
        lineCount: body.lines.length,
        skipped: result.skipped,
      },
      'Guest cart merged into the saved cart',
    );
    return result;
  }
}

const userId = (req: Request) => (req.user as AuthenticatedUser).id;
