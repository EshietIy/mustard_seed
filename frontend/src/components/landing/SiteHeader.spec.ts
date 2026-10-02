import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
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

  it('explains that sign-in is coming soon', async () => {
    const wrapper = mount(SiteHeader);
    await wrapper.get('[data-test="sign-in"]').trigger('click');
    expect(useToastStore().messages[0]?.text).toBe(
      'Sign in with Google is coming soon. You can still build your order.',
    );
  });
});
