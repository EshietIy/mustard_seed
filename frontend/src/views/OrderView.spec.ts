import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useMenuStore } from '@/stores/menu';
import { bodyOf, routeFetch } from '@/test-utils/fetch';
import { menuItem } from '@/test-utils/fixtures';
import { navigation } from '@/utils/navigation';
import { routes } from '@/router';
import OrderView from './OrderView.vue';

enableAutoUnmount(afterEach);

const order = {
  id: 'o-1',
  orderNumber: '#MS-0007',
  status: 'awaiting_payment',
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
  payment: null,
};

async function mountOrder(path = '/orders/o-1') {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(path);
  const wrapper = mount(OrderView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

describe('OrderView', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    const auth = useAuthStore();
    auth.status = 'signed-in';
    auth.user = {
      id: 'u-1',
      email: 'e@example.com',
      firstName: 'Ekaette',
      fullName: 'Ekaette Bassey',
      avatarUrl: null,
      role: 'customer',
    };
  });
  afterEach(() => vi.useRealTimers());

  it('shows the order, totals and a Pay now button with the deadline', async () => {
    routeFetch({ 'GET /orders/o-1': () => Response.json(order) });
    const { wrapper } = await mountOrder();
    expect(wrapper.get('h1').text()).toContain('#MS-0007');
    expect(wrapper.text()).toContain('Awaiting payment');
    expect(wrapper.text()).toContain('Pay by 12:15pm, or this order will expire.');
    expect(wrapper.get('[data-test="pay-now"]').text()).toBe('Pay ₦10,500 now');
    expect(wrapper.text()).toContain('2 × Edikang Ikong');
    expect(wrapper.text()).toContain('12 Marian Road');
  });

  it('Pay now sends the customer to the payment page', async () => {
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => {});
    routeFetch({
      'GET /orders/o-1': () => Response.json(order),
      'POST /orders/o-1/payments': () =>
        Response.json(
          { reference: 'MS0007-abc', authorizationUrl: 'https://pay.test/checkout/abc' },
          { status: 201 },
        ),
    });
    const { wrapper } = await mountOrder();
    await wrapper.get('[data-test="pay-now"]').trigger('click');
    await flushPromises();
    expect(assign).toHaveBeenCalledWith('https://pay.test/checkout/abc');
  });

  it('explains when the payment service is unavailable and keeps Pay now', async () => {
    routeFetch({
      'GET /orders/o-1': () => Response.json(order),
      'POST /orders/o-1/payments': () =>
        Response.json(
          { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'ref-1' } },
          { status: 503 },
        ),
    });
    const { wrapper } = await mountOrder();
    await wrapper.get('[data-test="pay-now"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t open the payment page.');
    expect(wrapper.text()).toContain('Reference: ref-1');
    expect(wrapper.find('[data-test="pay-now"]').exists()).toBe(true);
  });

  it('refreshes the order when it can no longer be paid (409)', async () => {
    let calls = 0;
    routeFetch({
      'GET /orders/o-1': () =>
        Response.json(++calls === 1 ? order : { ...order, status: 'expired' }),
      'POST /orders/o-1/payments': () =>
        Response.json(
          {
            error: {
              code: 'ORDER_EXPIRED',
              message: 'This order expired before it was paid. Please order again.',
            },
          },
          { status: 409 },
        ),
    });
    const { wrapper } = await mountOrder();
    await wrapper.get('[data-test="pay-now"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('This order expired before it was paid.');
    expect(wrapper.find('[data-test="pay-now"]').exists()).toBe(false);
  });

  it('confirms a returning payment with the server before saying it was paid', async () => {
    const fetchMock = routeFetch({
      'POST /payments/verify': () =>
        Response.json({
          ...order,
          status: 'paid',
          payment: { status: 'success', channel: 'card', paidAt: '2026-10-05T11:05:00Z' },
        }),
    });
    const { wrapper, router } = await mountOrder(
      '/orders/o-1?reference=MS0007-abc&trxref=MS0007-abc',
    );
    expect(bodyOf(fetchMock, 'POST /payments/verify')).toEqual({ reference: 'MS0007-abc' });
    expect(wrapper.text()).toContain('Amedi, Ekaette! Your order is in the kitchen.');
    expect(wrapper.text()).toContain('Paid — in the kitchen');
    expect(router.currentRoute.value.fullPath).toBe('/orders/o-1');
  });

  it('shows "Confirming your payment…" while waiting, and keeps polling a pending payment', async () => {
    vi.useFakeTimers();
    let calls = 0;
    routeFetch({
      'POST /payments/verify': () =>
        Response.json(
          ++calls < 3
            ? { ...order, payment: { status: 'ongoing', channel: null, paidAt: null } }
            : { ...order, status: 'paid' },
        ),
    });
    const { wrapper } = await mountOrder('/orders/o-1?reference=MS0007-abc');
    expect(wrapper.text()).toContain('Confirming your payment…');
    await vi.advanceTimersByTimeAsync(3000);
    await flushPromises();
    expect(wrapper.text()).toContain('Confirming your payment…');
    await vi.advanceTimersByTimeAsync(3000);
    await flushPromises();
    expect(calls).toBe(3);
    expect(wrapper.text()).toContain('Your order is in the kitchen.');
  });

  it('stops polling after a while and explains the payment is still pending', async () => {
    vi.useFakeTimers();
    routeFetch({
      'POST /payments/verify': () =>
        Response.json({ ...order, payment: { status: 'ongoing', channel: null, paidAt: null } }),
    });
    const { wrapper } = await mountOrder('/orders/o-1?reference=MS0007-abc');
    await vi.advanceTimersByTimeAsync(3000 * 25);
    await flushPromises();
    expect(wrapper.text()).toContain('We’re still waiting for your bank to confirm this payment.');
    expect(wrapper.find('[data-test="check-again"]').exists()).toBe(true);
  });

  it('tells the customer clearly when the payment did not go through', async () => {
    routeFetch({
      'POST /payments/verify': () =>
        Response.json({
          ...order,
          status: 'payment_failed',
          payment: { status: 'failed', channel: null, paidAt: null },
        }),
    });
    const { wrapper } = await mountOrder('/orders/o-1?reference=MS0007-abc');
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Your payment didn’t go through. You have not been charged.',
    );
    expect(wrapper.find('[data-test="order-again"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="pay-now"]').exists()).toBe(false);
  });

  it('never guesses when confirmation fails: it says so and offers a retry', async () => {
    let calls = 0;
    routeFetch({
      'POST /payments/verify': () =>
        ++calls === 1
          ? Response.json(
              { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'ref-v' } },
              { status: 503 },
            )
          : Response.json({ ...order, status: 'paid' }),
    });
    const { wrapper } = await mountOrder('/orders/o-1?reference=MS0007-abc');
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('We couldn’t confirm your payment yet.');
    expect(alert.text()).toContain('If you were charged, your order is safe');
    await alert.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Your order is in the kitchen.');
  });

  it('"Order again" refills the cart from the order and opens checkout', async () => {
    routeFetch({
      'GET /orders/o-1': () => Response.json({ ...order, status: 'expired' }),
      'GET /menu': () =>
        Response.json({
          categories: [
            {
              id: 'calabar_classics',
              label: 'Calabar classics',
              items: [menuItem({ priceKobo: 450000 })],
            },
          ],
        }),
    });
    const { wrapper, router } = await mountOrder();
    expect(wrapper.text()).toContain(
      'This order expired before it was paid. You have not been charged.',
    );
    await wrapper.get('[data-test="order-again"]').trigger('click');
    await flushPromises();
    expect(useMenuStore().status).toBe('ready');
    expect(useCartStore().lines).toEqual([
      expect.objectContaining({ itemId: 'i-edikang', quantity: 2 }),
    ]);
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/checkout'));
  });

  it('shows pickup details and a paid order without Pay now', async () => {
    routeFetch({
      'GET /orders/o-1': () =>
        Response.json({
          ...order,
          status: 'paid',
          fulfilment: 'pickup',
          delivery: null,
          deliveryFeeKobo: 0,
        }),
    });
    const { wrapper } = await mountOrder();
    expect(wrapper.text()).toContain('Pick up at');
    expect(wrapper.text()).toContain('Paid — in the kitchen');
    expect(wrapper.find('[data-test="pay-now"]').exists()).toBe(false);
  });

  it('explains a missing order', async () => {
    routeFetch({
      'GET /orders/nope': () =>
        Response.json(
          { error: { code: 'ORDER_NOT_FOUND', message: 'We could not find that order.' } },
          { status: 404 },
        ),
    });
    const { wrapper } = await mountOrder('/orders/nope');
    expect(wrapper.get('[role="alert"]').text()).toContain('We could not find that order.');
  });

  it('asks a signed-out visitor to sign in', async () => {
    useAuthStore().status = 'signed-out';
    routeFetch({});
    const { wrapper } = await mountOrder();
    expect(wrapper.text()).toContain('Sign in to see your order');
  });
});
