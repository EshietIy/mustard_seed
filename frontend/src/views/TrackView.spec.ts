import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { routeFetch } from '@/test-utils/fetch';
import { routes } from '@/router';
import TrackView from './TrackView.vue';

enableAutoUnmount(afterEach);

const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
const URL_KEY = `GET /orders/track/${TOKEN}`;

const order = {
  orderNumber: '#MS-0007',
  status: 'paid',
  fulfilment: 'delivery',
  branch: { id: 'calabar', city: 'Calabar' },
  items: [
    {
      menuItemId: 'i-edikang',
      name: 'Edikang Ikong',
      unitPriceKobo: 450000,
      quantity: 2,
      lineTotalKobo: 900000,
    },
  ],
  subtotalKobo: 900000,
  deliveryFeeKobo: 150000,
  totalKobo: 1050000,
  currency: 'NGN',
  contact: { fullName: 'Ekaette Bassey', phone: '+2348031234567' },
  delivery: { streetAddress: '12 Marian Road', city: 'Calabar' },
  createdAt: '2026-10-05T11:00:00Z',
  paymentExpiresAt: '2026-10-05T11:15:00.000Z',
  estimatedReadyAt: '2026-10-05T18:45:00.000Z',
  payment: { status: 'success', channel: 'card', paidAt: '2026-10-05T11:05:00Z' },
};

const pickup = {
  ...order,
  fulfilment: 'pickup',
  delivery: null,
  deliveryFeeKobo: 0,
  totalKobo: 900000,
  estimatedReadyAt: '2026-10-05T18:25:00.000Z',
};

async function mountTrack(token = TOKEN) {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(`/track/${token}`);
  const wrapper = mount(TrackView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper };
}

describe('TrackView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // The link is the credential: no sign-in needed.
    useAuthStore().status = 'signed-out';
  });
  afterEach(() => vi.useRealTimers());

  it('shows a paid delivery order with its progress, arrival time and details', async () => {
    routeFetch({ [URL_KEY]: () => Response.json(order) });
    const { wrapper } = await mountTrack();
    expect(wrapper.get('h1').text()).toContain('#MS-0007');
    expect(wrapper.text()).toContain('Paid — in the kitchen');
    expect(wrapper.get('[aria-current="step"]').text()).toBe('Confirmed');
    expect(wrapper.text()).toContain('Estimated arrival: 7:45pm');
    expect(wrapper.text()).toContain('2 × Edikang Ikong');
    expect(wrapper.text()).toContain('Total paid');
    expect(wrapper.text()).toContain('Delivering to');
    expect(wrapper.text()).toContain('12 Marian Road');
    expect(wrapper.text()).toContain('+2348031234567');
    expect(wrapper.text()).not.toContain('Sign in');
  });

  it('shows the pickup variant', async () => {
    routeFetch({ [URL_KEY]: () => Response.json({ ...pickup, status: 'ready' }) });
    const { wrapper } = await mountTrack();
    expect(wrapper.text()).toContain('Ready for pickup by: 7:25pm');
    expect(wrapper.text()).toContain('Pick up at');
    expect(wrapper.text()).toContain('Collected');
    expect(wrapper.get('[aria-current="step"]').text()).toBe('Ready');
  });

  it('refreshes every 20 seconds and stops once the order is delivered', async () => {
    vi.useFakeTimers();
    const statuses = ['paid', 'preparing', 'delivered'];
    let calls = 0;
    const fetchMock = routeFetch({
      [URL_KEY]: () => Response.json({ ...order, status: statuses[Math.min(calls++, 2)] }),
    });
    const { wrapper } = await mountTrack();
    expect(wrapper.text()).toContain('Paid — in the kitchen');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(wrapper.text()).toContain('Preparing');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(wrapper.text()).toContain('Delivered');
    expect(wrapper.text()).not.toContain('Estimated arrival');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('keeps the order on screen and keeps trying when a refresh fails', async () => {
    vi.useFakeTimers();
    let calls = 0;
    routeFetch({
      [URL_KEY]: () => {
        calls += 1;
        if (calls === 2) return Promise.reject(new TypeError('Failed to fetch'));
        return Response.json({ ...order, status: calls === 1 ? 'paid' : 'preparing' });
      },
    });
    const { wrapper } = await mountTrack();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(wrapper.text()).toContain('#MS-0007');
    expect(wrapper.text()).toContain('We couldn’t refresh this page. We’ll keep trying.');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(wrapper.text()).toContain('Preparing');
    expect(wrapper.text()).not.toContain('We couldn’t refresh');
  });

  it('waits as long as the server asks when rate limited', async () => {
    vi.useFakeTimers();
    let calls = 0;
    routeFetch({
      [URL_KEY]: () =>
        ++calls === 2
          ? Response.json(
              { error: { code: 'RATE_LIMITED' } },
              { status: 429, headers: { 'Retry-After': '60' } },
            )
          : Response.json(order),
    });
    await mountTrack();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toBe(3);
  });

  it('explains an unknown or mistyped link without offering a retry', async () => {
    routeFetch({
      [URL_KEY]: () =>
        Response.json(
          { error: { code: 'ORDER_NOT_FOUND', message: 'We could not find that order.' } },
          { status: 404 },
        ),
    });
    const { wrapper } = await mountTrack();
    expect(wrapper.get('h1').text()).toBe('We couldn’t find this order.');
    expect(wrapper.text()).toContain('Check the link in your confirmation email');
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.get('[data-test="home"]').attributes('href')).toBe('/');
  });

  it('shows a retry with a reference when the server fails, and recovers', async () => {
    let calls = 0;
    routeFetch({
      [URL_KEY]: () =>
        ++calls === 1
          ? Response.json({ error: { code: 'INTERNAL', requestId: 'ref-9' } }, { status: 500 })
          : Response.json(order),
    });
    const { wrapper } = await mountTrack();
    expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t load this order.');
    expect(wrapper.text()).toContain('Reference: ref-9');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('h1').text()).toContain('#MS-0007');
  });

  it('shows a loading state first', async () => {
    routeFetch({ [URL_KEY]: () => new Promise<Response>(() => {}) });
    const { wrapper } = await mountTrack();
    expect(wrapper.get('[aria-busy="true"]').text()).toContain('Loading your order…');
  });

  it.each([
    ['payment_failed', 'This order wasn’t paid, so it didn’t go to the kitchen.'],
    ['expired', 'This order wasn’t paid, so it didn’t go to the kitchen.'],
    ['awaiting_payment', 'We’re waiting for payment. The kitchen starts once it’s confirmed.'],
    ['cancelled', 'This order was cancelled.'],
  ])('a %s order shows no progress bar and says what happened', async (status, text) => {
    routeFetch({
      [URL_KEY]: () => Response.json({ ...order, status, estimatedReadyAt: null, payment: null }),
    });
    const { wrapper } = await mountTrack();
    expect(wrapper.text()).toContain(text);
    expect(wrapper.find('ol[aria-label="Order progress"]').exists()).toBe(false);
  });

  it('is routed at /track/:token', () => {
    expect(routes.find((r) => r.path === '/track/:token')?.name).toBe('track');
  });
});
