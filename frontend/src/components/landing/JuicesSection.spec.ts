import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMenuStore } from '@/stores/menu';
import { sampleMenu } from '@/test-utils/fixtures';
import JuicesSection from './JuicesSection.vue';

describe('JuicesSection', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows the copy and the fresh juices from the menu', () => {
    const menu = useMenuStore();
    menu.categories = sampleMenu().categories;
    const wrapper = mount(JuicesSection);
    expect(wrapper.text()).toContain('Pressed every morning');
    expect(wrapper.get('h2').text()).toBe('Fresh juices. Nothing added, nothing hidden.');
    expect(wrapper.findAll('figcaption').map((f) => f.text())).toEqual([
      'Zobo',
      'Pineapple & ginger',
      'Watermelon',
    ]);
  });

  it('"See all drinks" switches the menu to the Drinks tab', async () => {
    const menu = useMenuStore();
    menu.categories = sampleMenu().categories;
    const wrapper = mount(JuicesSection);
    await wrapper.get('a[href="#menu"]').trigger('click');
    expect(menu.activeCategory).toBe('drinks');
  });

  it('still renders the copy when the menu is unavailable', () => {
    const wrapper = mount(JuicesSection);
    expect(wrapper.find('h2').exists()).toBe(true);
    expect(wrapper.findAll('figure')).toHaveLength(0);
  });
});
