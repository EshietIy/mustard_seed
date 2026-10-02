import type { Logger } from 'pino';
import { PaymentExpirySweeper } from './payment-expiry.sweeper';
import type { PaymentsService } from './payments.service';

function setup(
  interval: number,
  sweep = jest.fn().mockResolvedValue({ checked: 1, expired: 1, paid: 0, skipped: 0 }),
) {
  const log = { info: jest.fn(), error: jest.fn() };
  const logger = { child: () => log } as unknown as Logger;
  const sweeper = new PaymentExpirySweeper(
    { sweepExpired: sweep } as unknown as PaymentsService,
    { PAYMENT_SWEEP_INTERVAL_MS: interval },
    logger,
  );
  return { sweeper, sweep, log };
}

describe('PaymentExpirySweeper', () => {
  afterEach(() => jest.useRealTimers());

  it('runs the sweep on the configured interval and stops on shutdown', async () => {
    jest.useFakeTimers();
    const { sweeper, sweep } = setup(1000);
    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(3000);
    expect(sweep).toHaveBeenCalledTimes(3);
    sweeper.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(3000);
    expect(sweep).toHaveBeenCalledTimes(3);
  });

  it('does nothing when switched off (0)', async () => {
    jest.useFakeTimers();
    const { sweeper, sweep } = setup(0);
    sweeper.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(sweep).not.toHaveBeenCalled();
  });

  it('logs results and never overlaps runs', async () => {
    let release!: () => void;
    const sweep = jest
      .fn()
      .mockImplementation(
        () =>
          new Promise(
            (resolve) => (release = () => resolve({ checked: 2, expired: 2, paid: 0, skipped: 0 })),
          ),
      );
    const { sweeper, log } = setup(1000, sweep);
    const first = sweeper.runOnce();
    await sweeper.runOnce();
    expect(sweep).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'payment.sweep', expired: 2 }),
      expect.any(String),
    );
  });

  it('logs and survives a failing sweep', async () => {
    const { sweeper, log } = setup(1000, jest.fn().mockRejectedValue(new Error('db down')));
    await sweeper.runOnce();
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'FAILED', reason: 'db down' }),
      expect.any(String),
    );
  });
});
