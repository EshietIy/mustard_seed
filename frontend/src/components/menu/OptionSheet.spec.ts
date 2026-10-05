import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { MenuItem } from '@/api/types';
import { menuItem } from '@/test-utils/fixtures';
import OptionSheet from './OptionSheet.vue';

enableAutoUnmount(afterEach);

const protein = {
  id: 'g-protein',
  name: 'Soup protein',
  minChoices: 1,
  maxChoices: 1,
  options: [
    { id: 'o-beef', name: 'Beef', priceDeltaKobo: 0, isAvailable: true },
    { id: 'o-chicken', name: 'Chicken', priceDeltaKobo: 50000, isAvailable: true },
    { id: 'o-turkey', name: 'Turkey', priceDeltaKobo: 0, isAvailable: false },
  ],
};
const extras = {
  id: 'g-extras',
  name: 'Extras',
  minChoices: 0,
  maxChoices: 2,
  options: [
    { id: 'o-egg', name: 'Egg', priceDeltaKobo: 20000, isAvailable: true },
    { id: 'o-ponmo', name: 'Ponmo', priceDeltaKobo: 30000, isAvailable: true },
    { id: 'o-snail', name: 'Snail', priceDeltaKobo: 90000, isAvailable: true },
  ],
};

function mountSheet(item: Partial<MenuItem> = {}) {
  return mount(OptionSheet, {
    props: {
      item: menuItem({
        id: 'soup',
        name: 'Afang Soup',
        priceKobo: 400000,
        optionGroups: [protein],
        ...item,
      }),
    },
    attachTo: document.body,
  });
}

const addButton = (w: ReturnType<typeof mountSheet>) => w.get('[data-test="add-with-options"]');

describe('OptionSheet', () => {
  it('is a labelled dialog that shows each group with its rule', () => {
    const wrapper = mountSheet();
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(wrapper.get(`#${dialog.attributes('aria-labelledby')}`).text()).toBe('Afang Soup');
    expect(wrapper.get('fieldset legend').text()).toContain('Soup protein');
    expect(wrapper.get('fieldset').text()).toContain('Required · choose 1');
  });

  it('uses radio buttons for a single choice, with nothing preselected', () => {
    const wrapper = mountSheet();
    const radios = wrapper.findAll('input[type="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios.every((r) => !(r.element as HTMLInputElement).checked)).toBe(true);
  });

  it('keeps Add disabled with a clear message until the required choice is made', async () => {
    const wrapper = mountSheet();
    expect(addButton(wrapper).attributes('disabled')).toBeDefined();
    expect(wrapper.get('[data-test="choice-needed"]').text()).toBe(
      'Choose a soup protein to add this.',
    );
    await wrapper.get('input[value="o-chicken"]').setValue(true);
    expect(addButton(wrapper).attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-test="choice-needed"]').exists()).toBe(false);
  });

  it('shows extra costs and the price with the choices made', async () => {
    const wrapper = mountSheet();
    expect(wrapper.get('label[for="opt-o-chicken"]').text()).toContain('+₦500');
    expect(wrapper.get('label[for="opt-o-beef"]').text()).not.toContain('+');
    expect(addButton(wrapper).text()).toBe('Add to order · ₦4,000');
    await wrapper.get('input[value="o-chicken"]').setValue(true);
    expect(addButton(wrapper).text()).toBe('Add to order · ₦4,500');
  });

  it('shows a switched-off option but does not let it be chosen', () => {
    const wrapper = mountSheet();
    const turkey = wrapper.get('input[value="o-turkey"]');
    expect(turkey.attributes('disabled')).toBeDefined();
    expect(wrapper.get('label[for="opt-o-turkey"]').text()).toContain('Not available');
  });

  it('uses checkboxes for several choices and stops at the maximum', async () => {
    const wrapper = mountSheet({ optionGroups: [protein, extras] });
    await wrapper.get('input[value="o-beef"]').setValue(true);
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(3);
    expect(wrapper.findAll('fieldset')[1]!.text()).toContain('Optional · up to 2');
    await wrapper.get('input[value="o-egg"]').setValue(true);
    await wrapper.get('input[value="o-ponmo"]').setValue(true);
    expect(wrapper.get('input[value="o-snail"]').attributes('disabled')).toBeDefined();
    expect(addButton(wrapper).text()).toBe('Add to order · ₦4,500');
  });

  it('adds with the chosen option ids in menu order', async () => {
    const wrapper = mountSheet({ optionGroups: [protein, extras] });
    await wrapper.get('input[value="o-ponmo"]').setValue(true);
    await wrapper.get('input[value="o-egg"]').setValue(true);
    await wrapper.get('input[value="o-chicken"]').setValue(true);
    await addButton(wrapper).trigger('click');
    expect(wrapper.emitted('add')).toEqual([[['o-chicken', 'o-egg', 'o-ponmo']]]);
  });

  it('closes with the close button and with Escape', async () => {
    const wrapper = mountSheet();
    await wrapper.get('[aria-label="Close"]').trigger('click');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toHaveLength(2);
  });

  it('moves focus into the sheet when it opens', async () => {
    const wrapper = mountSheet();
    await new Promise((r) => setTimeout(r));
    expect(wrapper.element.contains(document.activeElement)).toBe(true);
  });

  it('shows the price placeholder when the item has no price yet', () => {
    const wrapper = mountSheet({ priceKobo: null });
    expect(addButton(wrapper).text()).toBe('Add to order');
  });
});
