import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { randomBytes } from 'node:crypto';
import { Public } from '../../auth/guards/public.decorator';
import { APP_CONFIG } from '../../config/app-config.token';
import type { AppConfig } from '../../config/env.validation';
import { checkoutCsp, renderCheckoutPage, renderNotFoundPage } from './checkout-page';
import { FailNextDto, ForceOutcomeDto, SendWebhookDto, SIM_OUTCOMES } from './simulator.dto';
import { SimulatorService, type SimResponse } from './simulator.service';

const send = (res: Response, r: SimResponse): void => {
  res.status(r.httpStatus).json(r.body);
};

/** Paystack-compatible REST API (same paths and JSON shapes). */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller({ path: 'simulator/paystack/transaction', version: VERSION_NEUTRAL })
export class SimulatorApiController {
  constructor(private readonly sim: SimulatorService) {}

  @Post('initialize')
  async initialize(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.sim.initialize(authorization, body));
  }

  @Get('verify/:reference')
  async verify(
    @Headers('authorization') authorization: string | undefined,
    @Param('reference') reference: string,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.sim.verify(authorization, reference));
  }
}

/** Hosted TEST PAYMENT page. Open (no key) so testers can use it from a browser. */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller({ path: 'simulator/paystack/checkout', version: VERSION_NEUTRAL })
export class SimulatorCheckoutController {
  constructor(private readonly sim: SimulatorService) {}

  @Get(':accessCode')
  async page(@Param('accessCode') accessCode: string, @Res() res: Response): Promise<void> {
    const nonce = randomBytes(16).toString('base64');
    const tx = await this.sim.findCheckout(accessCode);
    res.setHeader('Content-Security-Policy', checkoutCsp(nonce, tx?.callbackUrl ?? null));
    res.setHeader('Cache-Control', 'no-store');
    res
      .status(tx ? 200 : 404)
      .type('html')
      .send(tx ? renderCheckoutPage(tx, nonce) : renderNotFoundPage(nonce));
  }

  @Post(':accessCode')
  async decide(
    @Param('accessCode') accessCode: string,
    @Body() body: { outcome?: unknown },
    @Res() res: Response,
  ): Promise<void> {
    const outcome = SIM_OUTCOMES.find((o) => o === body.outcome);
    if (!outcome) {
      res.status(400).type('text').send('Choose an outcome');
      return;
    }
    const result = await this.sim.decide(accessCode, outcome);
    if (!result) {
      res.status(404).type('text').send('Unknown checkout');
      return;
    }
    if (result.redirectTo) {
      res.redirect(303, result.redirectTo);
      return;
    }
    await this.page(accessCode, res);
  }
}

/**
 * Test controls. Every route answers 404 unless the x-simulator-control-key header matches
 * SIMULATOR_CONTROL_KEY, so on a public staging server they look like they don't exist.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller({ path: 'simulator/paystack/_control', version: VERSION_NEUTRAL })
export class SimulatorControlController {
  constructor(
    private readonly sim: SimulatorService,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'SIMULATOR_CONTROL_KEY'>,
  ) {}

  @Post('transactions/:reference/outcome')
  @HttpCode(200)
  async outcome(
    @Headers('x-simulator-control-key') key: string | undefined,
    @Param('reference') reference: string,
    @Body() body: ForceOutcomeDto,
  ): Promise<{ reference: string; status: string }> {
    this.authorize(key);
    const tx = await this.sim.forceOutcome(reference, body.status, body.webhook ?? true);
    if (!tx) throw new NotFoundException();
    return { reference: tx.reference, status: tx.status };
  }

  @Post('transactions/:reference/webhook')
  @HttpCode(200)
  async webhook(
    @Headers('x-simulator-control-key') key: string | undefined,
    @Param('reference') reference: string,
    @Body() body: SendWebhookDto,
  ): Promise<{ deliveries: number[] }> {
    this.authorize(key);
    const deliveries = await this.sim.sendWebhooks(reference, body);
    if (!deliveries) throw new NotFoundException();
    return { deliveries };
  }

  @Post('fail-next')
  @HttpCode(200)
  failNext(
    @Headers('x-simulator-control-key') key: string | undefined,
    @Body() body: FailNextDto,
  ): { ok: true } {
    this.authorize(key);
    this.sim.failNext({
      status: body.status ?? 503,
      count: body.count ?? 1,
      delayMs: body.delayMs ?? 0,
    });
    return { ok: true };
  }

  @Post('reset')
  @HttpCode(200)
  async reset(@Headers('x-simulator-control-key') key: string | undefined): Promise<{ ok: true }> {
    this.authorize(key);
    await this.sim.reset();
    return { ok: true };
  }

  private authorize(key: string | undefined): void {
    if (!this.sim.isControlKey(this.config.SIMULATOR_CONTROL_KEY, key))
      throw new NotFoundException();
  }
}
