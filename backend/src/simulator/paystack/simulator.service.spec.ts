import { createHmac } from 'node:crypto';
import { InMemorySimulatorStore } from './in-memory-simulator.store';
import { SimulatorService } from './simulator.service';

const KEY = 'sk_sim_0123456789abcdef';
const config = {
  PAYSTACK_SECRET_KEY: KEY,
  PAYSTACK_BASE_URL: 'http://localhost:3000/simulator/paystack',
  PAYSTACK_WEBHOOK_URL: 'http://localhost:3000/api/v1/payments/webhook',
};
const auth = `Bearer ${KEY}`;
const init = {
  email: 'ada@example.com',
  amount: 160000,
  reference: 'MS0001-abc',
  callback_url: 'http://localhost:5173/orders/o-1',
  metadata: { orderId: 'o-1' },
};

function setup() {
  const store = new InMemorySimulatorStore();
  const fetchMock = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  const log = { info: jest.fn(), warn: jest.fn() };
  const service = new SimulatorService(store, config, fetchMock, log);
  return { service, store, fetchMock, log };
}

describe('SimulatorService: transaction/initialize', () => {
  it('creates a transaction and returns a checkout link, like Paystack', async () => {
    const { service } = setup();
    const res = await service.initialize(auth, init);
    expect(res.httpStatus).toBe(200);
    expect(res.body).toMatchObject({
      status: true,
      message: 'Authorization URL created',
      data: { reference: 'MS0001-abc' },
    });
    const data = (res.body as { data: { authorization_url: string; access_code: string } }).data;
    expect(data.authorization_url).toBe(
      `http://localhost:3000/simulator/paystack/checkout/${data.access_code}`,
    );
  });

  it('generates a reference when none is given', async () => {
    const { service } = setup();
    const res = await service.initialize(auth, { ...init, reference: undefined });
    expect((res.body as { data: { reference: string } }).data.reference).toMatch(/^sim_/);
  });

  it.each([
    ['a missing key', undefined],
    ['a wrong key', 'Bearer sk_sim_wrong_key_value'],
    ['a non-bearer header', KEY],
  ])('answers 401 for %s', async (_label, header) => {
    const { service } = setup();
    expect(await service.initialize(header, init)).toEqual({
      httpStatus: 401,
      body: { status: false, message: 'Invalid key' },
    });
  });

  it.each([
    ['an invalid email', { email: 'nope' }],
    ['a zero amount', { amount: 0 }],
    ['a non-integer amount', { amount: 10.5 }],
    ['a string amount', { amount: '100' }],
  ])('answers 400 for %s', async (_label, patch) => {
    const { service } = setup();
    const res = await service.initialize(auth, { ...init, ...patch });
    expect(res.httpStatus).toBe(400);
    expect(res.body).toMatchObject({ status: false });
  });

  it('answers 400 for a duplicate reference', async () => {
    const { service } = setup();
    await service.initialize(auth, init);
    expect(await service.initialize(auth, init)).toEqual({
      httpStatus: 400,
      body: { status: false, message: 'Duplicate Transaction Reference' },
    });
  });
});

describe('SimulatorService: transaction/verify', () => {
  it('reports a new transaction as abandoned, then the chosen outcome', async () => {
    const { service } = setup();
    await service.initialize(auth, init);
    expect((await service.verify(auth, 'MS0001-abc')).body).toMatchObject({
      status: true,
      data: {
        status: 'abandoned',
        amount: 160000,
        currency: 'NGN',
        customer: { email: 'ada@example.com' },
      },
    });
    await service.forceOutcome('MS0001-abc', 'success', false);
    expect((await service.verify(auth, 'MS0001-abc')).body).toMatchObject({
      data: { status: 'success', channel: 'card' },
    });
  });

  it('404s an unknown reference and 401s a bad key', async () => {
    const { service } = setup();
    expect(await service.verify(auth, 'nope')).toEqual({
      httpStatus: 404,
      body: { status: false, message: 'Transaction reference not found' },
    });
    expect((await service.verify('Bearer bad', 'x')).httpStatus).toBe(401);
  });
});

describe('SimulatorService: checkout decisions and webhooks', () => {
  it('paying successfully redirects to the callback with the reference and sends a signed webhook', async () => {
    const { service, fetchMock } = setup();
    const { body } = await service.initialize(auth, init);
    const accessCode = (body as { data: { access_code: string } }).data.access_code;
    const result = await service.decide(accessCode, 'success');
    expect(result).toEqual({
      redirectTo: 'http://localhost:5173/orders/o-1?reference=MS0001-abc&trxref=MS0001-abc',
    });
    const [url, req] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(config.PAYSTACK_WEBHOOK_URL);
    const raw = req.body as string;
    expect(JSON.parse(raw)).toMatchObject({
      event: 'charge.success',
      data: {
        reference: 'MS0001-abc',
        amount: 160000,
        status: 'success',
        customer: { email: 'ada@example.com' },
        metadata: { orderId: 'o-1' },
      },
    });
    expect((req.headers as Record<string, string>)['x-paystack-signature']).toBe(
      createHmac('sha512', KEY).update(raw).digest('hex'),
    );
  });

  it.each(['failed', 'abandoned', 'ongoing'] as const)(
    'choosing %s redirects without a success webhook',
    async (outcome) => {
      const { service, fetchMock, store } = setup();
      const { body } = await service.initialize(auth, init);
      const accessCode = (body as { data: { access_code: string } }).data.access_code;
      await service.decide(accessCode, outcome);
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await store.findByReference('MS0001-abc'))?.status).toBe(outcome);
    },
  );

  it('appends to a callback that already has a query string', async () => {
    const { service } = setup();
    const { body } = await service.initialize(auth, {
      ...init,
      callback_url: 'http://x/return?a=1',
    });
    const accessCode = (body as { data: { access_code: string } }).data.access_code;
    expect(await service.decide(accessCode, 'failed')).toEqual({
      redirectTo: 'http://x/return?a=1&reference=MS0001-abc&trxref=MS0001-abc',
    });
  });

  it('returns null for an unknown access code', async () => {
    expect(await setup().service.decide('nope', 'success')).toBeNull();
  });

  it('replays webhooks, with bad or missing signatures and wrong amounts on request', async () => {
    const { service, fetchMock } = setup();
    await service.initialize(auth, init);
    await service.forceOutcome('MS0001-abc', 'success', false);
    const statuses = await service.sendWebhooks('MS0001-abc', {
      times: 2,
      signature: 'invalid',
      amountKobo: 1,
    });
    expect(statuses).toEqual([200, 200]);
    const [, req] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(req.body as string).data.amount).toBe(1);
    expect((req.headers as Record<string, string>)['x-paystack-signature']).not.toBe(
      createHmac('sha512', KEY)
        .update(req.body as string)
        .digest('hex'),
    );
    await service.sendWebhooks('MS0001-abc', { signature: 'missing' });
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).headers).not.toHaveProperty(
      'x-paystack-signature',
    );
    expect(await service.sendWebhooks('nope', {})).toBeNull();
  });

  it('records a webhook delivery failure as status 0', async () => {
    const { service, fetchMock } = setup();
    await service.initialize(auth, init);
    fetchMock.mockRejectedValue(new Error('connection refused'));
    expect(await service.sendWebhooks('MS0001-abc', {})).toEqual([0]);
  });
});

describe('SimulatorService: control', () => {
  it('fails the next API calls with the chosen status, then recovers', async () => {
    const { service } = setup();
    service.failNext({ status: 502, count: 2, delayMs: 0 });
    expect((await service.initialize(auth, init)).httpStatus).toBe(502);
    expect((await service.verify(auth, 'x')).httpStatus).toBe(502);
    expect((await service.initialize(auth, init)).httpStatus).toBe(200);
  });

  it('can delay the next call (to test timeouts)', async () => {
    jest.useFakeTimers();
    const { service } = setup();
    service.failNext({ status: 0, count: 1, delayMs: 5000 });
    const pending = service.initialize(auth, init);
    await jest.advanceTimersByTimeAsync(5000);
    expect((await pending).httpStatus).toBe(200);
    jest.useRealTimers();
  });

  it('reset clears transactions and pending failures', async () => {
    const { service } = setup();
    await service.initialize(auth, init);
    service.failNext({ status: 503, count: 5, delayMs: 0 });
    await service.reset();
    expect((await service.verify(auth, 'MS0001-abc')).httpStatus).toBe(404);
  });

  it('forceOutcome on an unknown reference returns null', async () => {
    expect(await setup().service.forceOutcome('nope', 'success', true)).toBeNull();
  });

  it('checks the control key in constant time', () => {
    const { service } = setup();
    expect(service.isControlKey('control-key-0123456789', 'control-key-0123456789')).toBe(true);
    expect(service.isControlKey('control-key-0123456789', 'wrong')).toBe(false);
    expect(service.isControlKey('control-key-0123456789', undefined)).toBe(false);
  });
});
