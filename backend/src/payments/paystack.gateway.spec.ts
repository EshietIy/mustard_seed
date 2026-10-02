import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { PaystackGateway } from './paystack.gateway';

const config = {
  PAYSTACK_BASE_URL: 'http://sim.test/simulator/paystack/',
  PAYSTACK_SECRET_KEY: 'sk_sim_0123456789abcdef',
  PAYSTACK_TIMEOUT_MS: 1000,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function gateway(fetchImpl: typeof fetch) {
  return new PaystackGateway(config, fetchImpl);
}

describe('PaystackGateway.initialize', () => {
  it('posts to /transaction/initialize with the bearer key and returns the checkout link', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      json(200, {
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: 'http://sim.test/checkout/ac_1',
          access_code: 'ac_1',
          reference: 'MS0001-x',
        },
      }),
    );
    await expect(
      gateway(fetchMock).initialize({
        email: 'ada@example.com',
        amountKobo: 1130000,
        reference: 'MS0001-x',
        callbackUrl: 'http://localhost:5173/orders/o-1',
        metadata: { orderId: 'o-1' },
      }),
    ).resolves.toEqual({
      authorizationUrl: 'http://sim.test/checkout/ac_1',
      accessCode: 'ac_1',
      reference: 'MS0001-x',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://sim.test/simulator/paystack/transaction/initialize');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk_sim_0123456789abcdef',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'ada@example.com',
      amount: 1130000,
      currency: 'NGN',
      reference: 'MS0001-x',
      callback_url: 'http://localhost:5173/orders/o-1',
      metadata: { orderId: 'o-1' },
    });
  });

  it.each([
    ['a 5xx', () => Promise.resolve(json(503, { status: false, message: 'down' }))],
    [
      'a 4xx',
      () =>
        Promise.resolve(json(400, { status: false, message: 'Duplicate Transaction Reference' })),
    ],
    ['status false', () => Promise.resolve(json(200, { status: false, message: 'nope' }))],
    ['a malformed body', () => Promise.resolve(new Response('<html>', { status: 200 }))],
    ['a network error', () => Promise.reject(new TypeError('fetch failed'))],
  ])('maps %s to a 503 upstream error', async (_label, impl) => {
    const err = await gateway(jest.fn().mockImplementation(impl))
      .initialize({
        email: 'a@b.co',
        amountKobo: 1,
        reference: 'r',
        callbackUrl: 'http://x',
        metadata: {},
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UpstreamUnavailableException);
    expect((err as UpstreamUnavailableException).upstream).toBe('paystack');
  });

  it('times out a slow gateway', async () => {
    const slow: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expect(
      new PaystackGateway({ ...config, PAYSTACK_TIMEOUT_MS: 20 }, slow).initialize({
        email: 'a@b.co',
        amountKobo: 1,
        reference: 'r',
        callbackUrl: 'http://x',
        metadata: {},
      }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableException);
  });
});

describe('PaystackGateway.verify', () => {
  const data = {
    id: 1,
    reference: 'MS0001-x',
    amount: 1130000,
    currency: 'NGN',
    status: 'success',
    channel: 'card',
    paid_at: '2026-10-05T11:05:00.000Z',
    customer: { email: 'ada@example.com' },
  };

  it('returns the normalised transaction', async () => {
    const fetchMock = jest.fn().mockResolvedValue(json(200, { status: true, data }));
    await expect(gateway(fetchMock).verify('MS0001-x')).resolves.toEqual({
      found: true,
      reference: 'MS0001-x',
      status: 'success',
      amountKobo: 1130000,
      currency: 'NGN',
      channel: 'card',
      paidAt: '2026-10-05T11:05:00.000Z',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://sim.test/simulator/paystack/transaction/verify/MS0001-x',
    );
  });

  it.each([
    ['abandoned', 'abandoned'],
    ['failed', 'failed'],
    ['ongoing', 'ongoing'],
    ['pending', 'ongoing'],
    ['processing', 'ongoing'],
    ['queued', 'ongoing'],
    ['reversed', 'failed'],
  ])('maps gateway status %s to %s', async (gatewayStatus, expected) => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(json(200, { status: true, data: { ...data, status: gatewayStatus } }));
    expect(await gateway(fetchMock).verify('r')).toMatchObject({ found: true, status: expected });
  });

  it('reports an unknown reference as not found', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(json(404, { status: false, message: 'Transaction reference not found' }));
    await expect(gateway(fetchMock).verify('nope')).resolves.toEqual({
      found: false,
      reference: 'nope',
    });
  });

  it('url-encodes the reference', async () => {
    const fetchMock = jest.fn().mockResolvedValue(json(404, { status: false }));
    await gateway(fetchMock).verify('a/b?c');
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/verify\/a%2Fb%3Fc$/);
  });

  it('maps a 5xx to a 503 upstream error', async () => {
    await expect(
      gateway(jest.fn().mockResolvedValue(json(502, {}))).verify('r'),
    ).rejects.toBeInstanceOf(UpstreamUnavailableException);
  });
});
