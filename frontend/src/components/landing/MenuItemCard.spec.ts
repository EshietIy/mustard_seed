import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from '@/stores/cart';
import { useToastStore } from '@/stores/toast';
import { menuItem } from '@/test-utils/fixtures';
import MenuItemCard from './MenuItemCard.vue';

describe('MenuItemCard', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('renders name, description, the [PRICE] placeholder and the signature badge', () => {
    const wrapper = mount(MenuItemCard, { props: { item: menuItem() } });
    expect(wrapper.get('h3').text()).toBe('Edikang Ikong');
    expect(wrapper.text()).toContain('Ugu and waterleaf soup');
    expect(wrapper.text()).toContain('[PRICE]');
    expect(wrapper.get('[data-test="signature"]').text()).toBe('Signature');
  });

  it('formats a real price and hides the badge for normal items', () => {
    const wrapper = mount(MenuItemCard, {
      props: { item: menuItem({ priceKobo: 450000, isHouseSignature: false }) },
    });
    expect(wrapper.text()).toContain('₦4,500');
    expect(wrapper.find('[data-test="signature"]').exists()).toBe(false);
  });

  it('shows the striped photo placeholder when there is no image', () => {
    const wrapper = mount(MenuItemCard, { props: { item: menuItem() } });
    expect(wrapper.find('.placeholder--light').exists()).toBe(true);
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it('lazy-loads the thumbnail and falls back to the placeholder if it fails', async () => {
    const wrapper = mount(MenuItemCard, {
      props: {
        item: menuItem({
          image: { thumbnailUrl: 'https://x/thumb.webp', fullUrl: 'https://x/full.webp' },
        }),
      },
    });
    const img = wrapper.get('img');
    expect(img.attributes('src')).toBe('https://x/thumb.webp');
    expect(img.attributes('loading')).toBe('lazy');
    expect(img.attributes('alt')).toBe('Edikang Ikong');
    await img.trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.placeholder').exists()).toBe(true);
  });

  it('adds the item to the cart and confirms it', async () => {
    const wrapper = mount(MenuItemCard, { props: { item: menuItem() } });
    await wrapper.get('button').trigger('click');
    expect(useCartStore().count).toBe(1);
    expect(useToastStore().messages[0]?.text).toBe('Added Edikang Ikong to your order');
  });

  it('disables ordering for sold-out items', async () => {
    const wrapper = mount(MenuItemCard, { props: { item: menuItem({ isAvailable: false }) } });
    const button = wrapper.get('button');
    expect(button.text()).toBe('Sold out');
    expect(button.attributes('disabled')).toBeDefined();
    await button.trigger('click');
    expect(useCartStore().count).toBe(0);
  });

  it('tells the customer when they reach the quantity limit', async () => {
    const cart = useCartStore();
    for (let i = 0; i < 20; i++) cart.add(menuItem());
    const wrapper = mount(MenuItemCard, { props: { item: menuItem() } });
    await wrapper.get('button').trigger('click');
    expect(useToastStore().messages.at(-1)?.text).toBe(
      "You've reached the limit for Edikang Ikong.",
    );
  });

  it('labels the Add button with the dish name for screen readers', () => {
    const wrapper = mount(MenuItemCard, { props: { item: menuItem() } });
    expect(wrapper.get('button').attributes('aria-label')).toBe('Add Edikang Ikong to your order');
  });

  describe('the compact variant (Top dishes)', () => {
    it('shows name, price and the dark "Photo coming" pill, without description or badge', () => {
      const wrapper = mount(MenuItemCard, { props: { item: menuItem(), variant: 'compact' } });
      expect(wrapper.get('h3').text()).toBe('Edikang Ikong');
      expect(wrapper.text()).toContain('[PRICE]');
      expect(wrapper.text()).not.toContain('Ugu and waterleaf soup');
      expect(wrapper.find('[data-test="signature"]').exists()).toBe(false);
      expect(wrapper.find('.placeholder--dark').text()).toBe('Photo coming');
    });

    it('still adds to the order', async () => {
      const wrapper = mount(MenuItemCard, { props: { item: menuItem(), variant: 'compact' } });
      await wrapper.get('button[aria-label="Add Edikang Ikong to your order"]').trigger('click');
      expect(useCartStore().count).toBe(1);
    });
  });

  describe('an item with choices', () => {
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

    it('opens the choice sheet instead of adding straight away', async () => {
      const wrapper = mount(MenuItemCard, { props: { item: soup }, attachTo: document.body });
      await wrapper.get('button[aria-label="Choose options for Afang Soup"]').trigger('click');
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
      expect(useCartStore().count).toBe(0);
      wrapper.unmount();
    });

    it('adds the item with the chosen options, confirms it, and closes the sheet', async () => {
      const wrapper = mount(MenuItemCard, { props: { item: soup }, attachTo: document.body });
      await wrapper.get('button[aria-label="Choose options for Afang Soup"]').trigger('click');
      await wrapper.get('input[value="o-chicken"]').setValue(true);
      await wrapper.get('[data-test="add-with-options"]').trigger('click');
      const cart = useCartStore();
      expect(cart.lines.map((l) => [l.name, l.options.map((o) => o.name)])).toEqual([
        ['Afang Soup', ['Chicken']],
      ]);
      expect(useToastStore().messages[0]?.text).toBe('Added Afang Soup (Chicken) to your order');
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('closes the sheet without adding anything', async () => {
      const wrapper = mount(MenuItemCard, { props: { item: soup }, attachTo: document.body });
      await wrapper.get('button[aria-label="Choose options for Afang Soup"]').trigger('click');
      await wrapper.get('[aria-label="Close"]').trigger('click');
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
      expect(useCartStore().count).toBe(0);
      wrapper.unmount();
    });
  });
});
