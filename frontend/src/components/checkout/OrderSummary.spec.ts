import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import OrderSummary from './OrderSummary.vue';

const lines = [
  {
    menuItemId: 'a',
    name: 'Edikang Ikong',
    unitPriceKobo: 450000,
    quantity: 2,
    lineTotalKobo: 900000,
  },
  { menuItemId: 'b', name: 'Zobo', unitPriceKobo: null, quantity: 1, lineTotalKobo: null },
];

describe('OrderSummary', () => {
  it('lists each line with quantity and amount, and the totals', () => {
    const wrapper = mount(OrderSummary, {
      props: {
        lines,
        subtotalKobo: 980000,
        deliveryFeeKobo: 150000,
        totalKobo: 1130000,
        fulfilment: 'delivery',
      },
    });
    const rows = wrapper.findAll('li').map((li) => li.text().replace(/\s+/g, ' '));
    expect(rows[0]).toContain('2 × Edikang Ikong');
    expect(rows[0]).toContain('₦9,000');
    expect(rows[1]).toContain('[PRICE]');
    expect(wrapper.text()).toContain('Delivery (anywhere in Calabar)');
    expect(wrapper.text()).toContain('₦1,500');
    expect(wrapper.get('[data-test="total"]').text()).toBe('₦11,300');
  });

  it('shows a free pickup and placeholder totals when not priced', () => {
    const wrapper = mount(OrderSummary, {
      props: {
        lines,
        subtotalKobo: null,
        deliveryFeeKobo: 0,
        totalKobo: null,
        fulfilment: 'pickup',
      },
    });
    expect(wrapper.text()).toContain('Pickup');
    expect(wrapper.text()).toContain('Free');
    expect(wrapper.get('[data-test="total"]').text()).toBe('[PRICE]');
  });

  it('shows the chosen options under a line', () => {
    const wrapper = mount(OrderSummary, {
      props: {
        lines: [
          {
            menuItemId: 'soup',
            name: 'Afang Soup',
            quantity: 1,
            lineTotalKobo: 450000,
            options: [{ name: 'Chicken' }, { name: 'Egg' }],
          },
          {
            menuItemId: 'soup',
            name: 'Afang Soup',
            quantity: 1,
            lineTotalKobo: 400000,
            options: [{ name: 'Beef' }],
          },
        ],
        subtotalKobo: 850000,
        deliveryFeeKobo: 0,
        totalKobo: 850000,
        fulfilment: 'pickup',
      },
    });
    const rows = wrapper.findAll('li');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.get('[data-test="line-options"]').text()).toBe('Chicken · Egg');
    expect(rows[1]!.get('[data-test="line-options"]').text()).toBe('Beef');
  });
});
