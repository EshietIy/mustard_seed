import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import OrderProgress from './OrderProgress.vue';

const steps = (status: string, fulfilment: 'delivery' | 'pickup' = 'delivery') => {
  const wrapper = mount(OrderProgress, { props: { status, fulfilment } });
  return wrapper.findAll('li').map((li) => ({
    label: li.text(),
    done: li.classes('done'),
    current: li.attributes('aria-current') === 'step',
  }));
};

describe('OrderProgress', () => {
  it('shows the four delivery steps with Confirmed reached once paid', () => {
    expect(steps('paid')).toEqual([
      { label: 'Confirmed', done: true, current: true },
      { label: 'Preparing', done: false, current: false },
      { label: 'Ready', done: false, current: false },
      { label: 'Delivered', done: false, current: false },
    ]);
  });

  it('ends with Collected for pickup', () => {
    expect(steps('collected', 'pickup').map((s) => s.label)).toEqual([
      'Confirmed',
      'Preparing',
      'Ready',
      'Collected',
    ]);
    expect(steps('collected', 'pickup').every((s) => s.done)).toBe(true);
  });

  it.each([
    ['preparing', 1],
    ['ready', 2],
    ['out_for_delivery', 2],
    ['delivered', 3],
  ])('marks the current step for %s', (status, index) => {
    const result = steps(status);
    expect(result.findIndex((s) => s.current)).toBe(index);
    expect(result.filter((s) => s.done)).toHaveLength(index + 1);
  });

  it('labels the list for screen readers', () => {
    const wrapper = mount(OrderProgress, { props: { status: 'paid', fulfilment: 'delivery' } });
    expect(wrapper.get('ol').attributes('aria-label')).toBe('Order progress');
  });
});
