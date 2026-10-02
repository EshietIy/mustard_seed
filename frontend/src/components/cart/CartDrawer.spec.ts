import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from '@/stores/cart';
import { useSiteStore } from '@/stores/site';
import { menuItem, sampleSite } from '@/test-utils/fixtures';
import CartDrawer from './CartDrawer.vue';

enableAutoUnmount(afterEach);

describe('CartDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    useSiteStore().info = sampleSite();
  });

  it('renders nothing when closed', () => {
    const wrapper = mount(CartDrawer, { props: { open: false } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('shows an empty state', () => {
    const wrapper = mount(CartDrawer, { props: { open: true } });
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true');
    expect(wrapper.text()).toContain('Your order is empty');
  });

  it('lists lines, changes quantities and removes lines', async () => {
    const cart = useCartStore();
    cart.add(menuItem({ priceKobo: 450000 }));
    const wrapper = mount(CartDrawer, { props: { open: true } });
    expect(wrapper.text()).toContain('Edikang Ikong');
    expect(wrapper.text()).toContain('₦4,500');
    await wrapper.get('[aria-label="Add one more Edikang Ikong"]').trigger('click');
    expect(cart.count).toBe(2);
    expect(wrapper.text()).toContain('₦9,000');
    await wrapper.get('[aria-label="Remove one Edikang Ikong"]').trigger('click');
    await wrapper.get('[aria-label="Remove one Edikang Ikong"]').trigger('click');
    expect(cart.isEmpty).toBe(true);
  });

  it('shows the [PRICE] placeholder for the subtotal while prices are missing', () => {
    useCartStore().add(menuItem({ priceKobo: null }));
    const wrapper = mount(CartDrawer, { props: { open: true } });
    expect(wrapper.get('[data-test="subtotal"]').text()).toBe('[PRICE]');
  });

  it('mentions the delivery fee from site info and keeps checkout disabled for now', () => {
    useCartStore().add(menuItem());
    const wrapper = mount(CartDrawer, { props: { open: true } });
    expect(wrapper.text()).toContain(
      'Delivery is ₦1,500 anywhere in Calabar, or pick up for free.',
    );
    const checkout = wrapper.get('[data-test="checkout"]');
    expect(checkout.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Online checkout opens soon.');
  });

  it('warns about items that have sold out since they were added', () => {
    const cart = useCartStore();
    cart.add(menuItem());
    cart.reconcile([menuItem({ isAvailable: false })]);
    const wrapper = mount(CartDrawer, { props: { open: true } });
    expect(wrapper.text()).toContain('Sold out');
    expect(wrapper.text()).toContain('Some items have sold out. Remove them to continue.');
  });

  it('closes on Escape even when focus has left the drawer', async () => {
    const wrapper = mount(CartDrawer, { props: { open: true }, attachTo: document.body });
    (document.activeElement as HTMLElement | null)?.blur();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('update:open')).toEqual([[false]]);
    wrapper.unmount();
  });

  it('returns focus to the button that opened it', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const wrapper = mount(CartDrawer, { props: { open: true }, attachTo: document.body });
    await wrapper.vm.$nextTick();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close your order');
    await wrapper.setProps({ open: false });
    expect(document.activeElement).toBe(opener);
    wrapper.unmount();
    opener.remove();
  });

  it('closes on Escape and on the close button', async () => {
    const wrapper = mount(CartDrawer, { props: { open: true }, attachTo: document.body });
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    await wrapper.get('[aria-label="Close your order"]').trigger('click');
    expect(wrapper.emitted('update:open')).toEqual([[false], [false]]);
    wrapper.unmount();
  });
});
