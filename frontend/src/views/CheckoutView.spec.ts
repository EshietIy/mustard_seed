import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Quote } from '@/api/types';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useSiteStore } from '@/stores/site';
import { menuItem, sampleSite } from '@/test-utils/fixtures';
import { bodyOf, routeFetch } from '@/test-utils/fetch';
import { routes } from '@/router';
import CheckoutView from './CheckoutView.vue';

enableAutoUnmount(afterEach);

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  lines: [
    {
      menuItemId: 'i-edikang',
      name: 'Edikang Ikong',
      unitPriceKobo: 450000,
      quantity: 2,
      lineTotalKobo: 900000,
      isAvailable: true,
    },
  ],
  subtotalKobo: 900000,
  deliveryFeeKobo: 150000,
  totalKobo: 1050000,
  ordering: {
    open: true,
    opensAt: '08:00',
    onlineOrdersCloseAt: '22:30',
    timezone: 'Africa/Lagos',
  },
  problems: [],
  canPlaceOrder: true,
  ...overrides,
});

const order = {
  id: 'o-1',
  orderNumber: '#MS-0001',
  status: 'awaiting_payment',
  fulfilment: 'delivery',
  totalKobo: 1050000,
};

function signIn() {
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
}

async function mountCheckout() {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push('/checkout');
  const wrapper = mount(CheckoutView, { global: { plugins: [router] }, attachTo: document.body });
  await flushPromises();
  return { wrapper, router };
}

async function fill(wrapper: Awaited<ReturnType<typeof mountCheckout>>['wrapper']) {
  await wrapper.get('input[name="phone"]').setValue('0803 123 4567');
  await wrapper.get('textarea[name="streetAddress"]').setValue('12 Marian Road');
}

describe('CheckoutView', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useSiteStore().info = sampleSite();
    useSiteStore().status = 'ready';
    useCartStore().add(menuItem({ priceKobo: 450000 }));
    useCartStore().add(menuItem({ priceKobo: 450000 }));
  });

  it('asks a signed-out customer to sign in, keeping their order', async () => {
    useAuthStore().status = 'signed-out';
    routeFetch({ 'POST /orders/quote': () => Response.json(quote()) });
    const { wrapper } = await mountCheckout();
    expect(wrapper.text()).toContain('Sign in to place your order');
    await wrapper.get('[data-test="checkout-sign-in"]').trigger('click');
    expect(useAuthStore().signInOpen).toBe(true);
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it('shows an empty state when the cart is empty', async () => {
    signIn();
    useCartStore().clear();
    routeFetch({});
    const { wrapper } = await mountCheckout();
    expect(wrapper.text()).toContain('Your order is empty');
    expect(wrapper.findAll('main a[href="/"]').map((a) => a.text())).toEqual(['Back to the menu']);
  });

  it('shows server totals, prefills the name and re-quotes when switching to pickup', async () => {
    signIn();
    const fetchMock = routeFetch({
      'POST /orders/quote': (init) => {
        const body = JSON.parse(String(init?.body)) as { fulfilment: string };
        return Response.json(
          body.fulfilment === 'pickup' ? quote({ deliveryFeeKobo: 0, totalKobo: 900000 }) : quote(),
        );
      },
    });
    const { wrapper } = await mountCheckout();
    expect(bodyOf(fetchMock, 'POST /orders/quote')).toEqual({
      fulfilment: 'delivery',
      branchId: 'calabar',
      items: [{ menuItemId: 'i-edikang', quantity: 2 }],
    });
    expect((wrapper.get('input[name="fullName"]').element as HTMLInputElement).value).toBe(
      'Ekaette Bassey',
    );
    expect(wrapper.get('[data-test="total"]').text()).toBe('₦10,500');
    expect(wrapper.text()).toContain('Calabar, Cross River State');
    await wrapper.get('input[value="pickup"]').setValue(true);
    await flushPromises();
    expect(wrapper.get('[data-test="total"]').text()).toBe('₦9,000');
    expect(wrapper.find('textarea[name="streetAddress"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('[CALABAR ADDRESS]');
  });

  it('places the order with the total the customer saw, clears the cart and opens the order', async () => {
    signIn();
    const fetchMock = routeFetch({
      'POST /orders/quote': () => Response.json(quote()),
      'POST /orders': () => Response.json(order, { status: 201 }),
    });
    const { wrapper, router } = await mountCheckout();
    await fill(wrapper);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    const sent = bodyOf(fetchMock, 'POST /orders') as Record<string, unknown>;
    expect(sent).toMatchObject({
      fulfilment: 'delivery',
      branchId: 'calabar',
      items: [{ menuItemId: 'i-edikang', quantity: 2 }],
      contact: { fullName: 'Ekaette Bassey', phone: '0803 123 4567' },
      delivery: { streetAddress: '12 Marian Road', city: 'Calabar' },
      expectedTotalKobo: 1050000,
    });
    expect(sent.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(useCartStore().isEmpty).toBe(true);
    // The order page is lazy-loaded, so navigation completes a little later.
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/orders/o-1'));
  });

  it('checks required fields before sending', async () => {
    signIn();
    const fetchMock = routeFetch({ 'POST /orders/quote': () => Response.json(quote()) });
    const { wrapper } = await mountCheckout();
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('Enter a phone number so the rider can reach you');
    expect(wrapper.text()).toContain('Enter your street address');
    expect(
      fetchMock.mock.calls.some(
        ([, init]) =>
          init?.method === 'POST' && !String(fetchMock.mock.calls[0]?.[0]).includes('quote'),
      ),
    ).toBe(false);
  });

  it('shows field errors from the server next to the inputs', async () => {
    signIn();
    routeFetch({
      'POST /orders/quote': () => Response.json(quote()),
      'POST /orders': () =>
        Response.json(
          {
            error: {
              code: 'VALIDATION_FAILED',
              message: 'Some fields are invalid.',
              details: [
                {
                  field: 'contact.phone',
                  messages: ['Enter a valid Nigerian phone number, e.g. 0803 123 4567'],
                },
              ],
            },
          },
          { status: 400 },
        ),
    });
    const { wrapper } = await mountCheckout();
    await fill(wrapper);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    const phone = wrapper.get('input[name="phone"]');
    expect(phone.attributes('aria-invalid')).toBe('true');
    expect(wrapper.get(`#${phone.attributes('aria-describedby')}`).text()).toBe(
      'Enter a valid Nigerian phone number, e.g. 0803 123 4567',
    );
  });

  it('explains closed hours and blocks placing the order', async () => {
    signIn();
    routeFetch({
      'POST /orders/quote': () =>
        Response.json(
          quote({
            ordering: {
              open: false,
              opensAt: '08:00',
              onlineOrdersCloseAt: '22:30',
              timezone: 'Africa/Lagos',
            },
            problems: [
              {
                code: 'ORDERING_CLOSED',
                message: 'Online orders are open 8am – 10:30pm. Please come back then.',
              },
            ],
            canPlaceOrder: false,
          }),
        ),
    });
    const { wrapper } = await mountCheckout();
    expect(wrapper.get('[role="alert"]').text()).toContain('Online orders are open 8am – 10:30pm.');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined();
  });

  it('refreshes totals when prices changed (409)', async () => {
    signIn();
    let quoteCalls = 0;
    routeFetch({
      'POST /orders/quote': () => {
        quoteCalls += 1;
        return Response.json(
          quoteCalls === 1 ? quote() : quote({ subtotalKobo: 1000000, totalKobo: 1150000 }),
        );
      },
      'POST /orders': () =>
        Response.json(
          {
            error: {
              code: 'PRICE_CHANGED',
              message: 'Prices have changed since you started checkout. Please review your order.',
            },
          },
          { status: 409 },
        ),
    });
    const { wrapper } = await mountCheckout();
    await fill(wrapper);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Prices have changed');
    expect(wrapper.get('[data-test="total"]').text()).toBe('₦11,500');
    expect(useCartStore().isEmpty).toBe(false);
  });

  it('keeps the form and offers a retry on a server or network error', async () => {
    signIn();
    routeFetch({
      'POST /orders/quote': () => Response.json(quote()),
      'POST /orders': () =>
        Response.json(
          { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'ref-9' } },
          { status: 503 },
        ),
    });
    const { wrapper } = await mountCheckout();
    await fill(wrapper);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('Your order was not placed.');
    expect(alert.text()).toContain('Reference: ref-9');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined();
    expect(useCartStore().isEmpty).toBe(false);
  });

  it('shows an error with retry when the quote cannot load', async () => {
    signIn();
    let calls = 0;
    routeFetch({
      'POST /orders/quote': () => {
        calls += 1;
        return calls === 1 ? new Response('', { status: 503 }) : Response.json(quote());
      },
    });
    const { wrapper } = await mountCheckout();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('We couldn’t work out your total.');
    await alert.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-test="total"]').text()).toBe('₦10,500');
  });
});
