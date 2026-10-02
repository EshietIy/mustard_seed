import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { routeFetch } from '@/test-utils/fetch';
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
      menuItemId: 'a',
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
};

async function mountOrder(id = 'o-1') {
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push(`/orders/${id}`);
  const wrapper = mount(OrderView, { global: { plugins: [router] } });
  await flushPromises();
  return wrapper;
}

describe('OrderView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().status = 'signed-in';
  });

  it('shows the order, its totals and that payment is the next step', async () => {
    routeFetch({ 'GET /orders/o-1': () => Response.json(order) });
    const wrapper = await mountOrder();
    expect(wrapper.get('h1').text()).toContain('#MS-0007');
    expect(wrapper.text()).toContain('Awaiting payment');
    expect(wrapper.text()).toContain('We start cooking as soon as your payment is confirmed.');
    expect(wrapper.text()).toContain('2 × Edikang Ikong');
    expect(wrapper.get('[data-test="total"]').text()).toBe('₦10,500');
    expect(wrapper.text()).toContain('12 Marian Road');
    expect(wrapper.text()).toContain('+2348031234567');
  });

  it('shows pickup details for pickup orders', async () => {
    routeFetch({
      'GET /orders/o-1': () =>
        Response.json({ ...order, fulfilment: 'pickup', delivery: null, deliveryFeeKobo: 0 }),
    });
    const wrapper = await mountOrder();
    expect(wrapper.text()).toContain('Pick up at');
    expect(wrapper.text()).toContain('Calabar');
  });

  it('explains a missing order', async () => {
    routeFetch({
      'GET /orders/nope': () =>
        Response.json(
          { error: { code: 'ORDER_NOT_FOUND', message: 'We could not find that order.' } },
          { status: 404 },
        ),
    });
    const wrapper = await mountOrder('nope');
    expect(wrapper.get('[role="alert"]').text()).toContain('We could not find that order.');
  });

  it('asks a signed-out visitor to sign in', async () => {
    useAuthStore().status = 'signed-out';
    routeFetch({});
    const wrapper = await mountOrder();
    expect(wrapper.text()).toContain('Sign in to see your order');
  });
});
