import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { useCartStore } from '@/stores/cart';
import { useToastStore } from '@/stores/toast';
import { menuItem } from '@/test-utils/fixtures';
import SiteHeader from './SiteHeader.vue';

describe('SiteHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('has the brand, section links and an order button with the item count', async () => {
    const wrapper = mount(SiteHeader);
    expect(wrapper.text()).toContain('Mustard Seed');
    expect(wrapper.text()).toContain('Restaurant & Bar');
    expect(wrapper.findAll('nav a').map((a) => a.attributes('href'))).toEqual([
      '#menu',
      '#juices',
      '#story',
      '#visit',
    ]);
    const order = wrapper.get('[data-test="open-cart"]');
    expect(order.text()).toContain('0');
    useCartStore().add(menuItem());
    useCartStore().add(menuItem());
    await wrapper.vm.$nextTick();
    expect(order.text()).toContain('2');
    expect(order.attributes('aria-label')).toBe('Your order, 2 items');
  });

  it('emits open-cart when the order button is pressed', async () => {
    const wrapper = mount(SiteHeader);
    await wrapper.get('[data-test="open-cart"]').trigger('click');
    expect(wrapper.emitted('open-cart')).toHaveLength(1);
  });

  it('opens the sign-in dialog when signed out', async () => {
    const auth = useAuthStore();
    auth.status = 'signed-out';
    const wrapper = mount(SiteHeader);
    await wrapper.get('[data-test="sign-in"]').trigger('click');
    expect(auth.signInOpen).toBe(true);
  });

  it('shows the signed-in user and lets them sign out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const auth = useAuthStore();
    auth.status = 'signed-in';
    auth.user = {
      id: 'u-1',
      email: 'ekaette@example.com',
      firstName: 'Ekaette',
      fullName: 'Ekaette Bassey',
      avatarUrl: null,
      role: 'customer',
    };
    const wrapper = mount(SiteHeader);
    expect(wrapper.find('[data-test="sign-in"]').exists()).toBe(false);
    const account = wrapper.get('[data-test="account"]');
    expect(account.text()).toContain('E');
    expect(account.text()).toContain('Ekaette');
    expect(account.attributes('aria-expanded')).toBe('false');
    await account.trigger('click');
    expect(account.attributes('aria-expanded')).toBe('true');
    await wrapper.get('[data-test="sign-out"]').trigger('click');
    await flushPromises();
    expect(auth.status).toBe('signed-out');
    expect(useToastStore().messages.at(-1)?.text).toBe('You’ve signed out.');
  });
});
