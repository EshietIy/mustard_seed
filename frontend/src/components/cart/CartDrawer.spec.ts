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

  it('mentions the delivery fee from site info and goes to checkout', async () => {
    useCartStore().add(menuItem());
    const wrapper = mount(CartDrawer, { props: { open: true } });
    expect(wrapper.text()).toContain(
      'Delivery is ₦1,500 anywhere in Calabar, or pick up for free.',
    );
    const checkout = wrapper.get('[data-test="checkout"]');
    expect(checkout.attributes('disabled')).toBeUndefined();
    await checkout.trigger('click');
    expect(wrapper.emitted('checkout')).toHaveLength(1);
  });

  it('blocks checkout while a sold-out item is in the order', () => {
    const cart = useCartStore();
    cart.add(menuItem());
    cart.reconcile([menuItem({ isAvailable: false })]);
    const wrapper = mount(CartDrawer, { props: { open: true } });
    expect(wrapper.get('[data-test="checkout"]').attributes('disabled')).toBeDefined();
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

  it('shows the chosen options under a line and changes that line only', async () => {
    const cart = useCartStore();
    const soup = menuItem({
      id: 'soup',
      name: 'Afang Soup',
      priceKobo: 400000,
      optionGroups: [
        {
          id: 'g-protein',
          name: 'Soup protein',
          minChoices: 1,
          maxChoices: 1,
          options: [
            { id: 'o-beef', name: 'Beef', priceDeltaKobo: 0, isAvailable: true },
            { id: 'o-chicken', name: 'Chicken', priceDeltaKobo: 50000, isAvailable: true },
          ],
        },
      ],
    });
    cart.add(soup, ['o-beef']);
    cart.add(soup, ['o-chicken']);
    const wrapper = mount(CartDrawer, { props: { open: true } });
    const lines = wrapper.findAll('li');
    expect(lines[0]!.text()).toContain('Beef');
    expect(lines[1]!.text()).toContain('Chicken');
    expect(lines[1]!.text()).toContain('₦4,500');
    await lines[1]!.get('[aria-label="Add one more Afang Soup (Chicken)"]').trigger('click');
    expect(cart.lines.map((l) => l.quantity)).toEqual([1, 2]);
  });

  it('asks for the choice again and blocks checkout when a line needs it', () => {
    const cart = useCartStore();
    cart.add(menuItem({ id: 'soup', name: 'Afang Soup', priceKobo: 400000 }));
    cart.reconcile([
      menuItem({
        id: 'soup',
        name: 'Afang Soup',
        priceKobo: 400000,
        optionGroups: [
          {
            id: 'g-protein',
            name: 'Soup protein',
            minChoices: 1,
            maxChoices: 1,
            options: [
              { id: 'o-beef', name: 'Beef', priceDeltaKobo: 0, isAvailable: true },
              { id: 'o-chicken', name: 'Chicken', priceDeltaKobo: 50000, isAvailable: true },
            ],
          },
        ],
      }),
    ]);
    const wrapper = mount(CartDrawer, { props: { open: true } });
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Some choices need updating. Remove those items and add them again with your choices.',
    );
    expect(wrapper.get('li').text()).toContain('Choose again');
    expect(wrapper.get('button.checkout').attributes('disabled')).toBeDefined();
  });
});
