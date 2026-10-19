import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMenuStore } from '@/stores/menu';
import { menuItem, sampleMenu } from '@/test-utils/fixtures';
import TopDishes from './TopDishes.vue';

function loadMenu(menu = sampleMenu()) {
  const store = useMenuStore();
  store.categories = menu.categories;
  store.status = 'ready';
}

describe('TopDishes', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('shows one compact card per house signature', () => {
    const menu = sampleMenu();
    menu.categories[4]!.items[0]!.isHouseSignature = true;
    loadMenu(menu);
    const wrapper = mount(TopDishes);
    expect(wrapper.get('h2').text()).toBe('Top dishes');
    expect(wrapper.text()).toContain('House signatures');
    expect(wrapper.findAll('article h3').map((h) => h.text())).toEqual(['Edikang Ikong', 'Zobo']);
    expect(wrapper.findAll('article.card--compact')).toHaveLength(2);
  });

  it('is hidden when no dish is a house signature', () => {
    const menu = sampleMenu();
    menu.categories[0]!.items = [menuItem({ isHouseSignature: false })];
    loadMenu(menu);
    expect(mount(TopDishes).find('section').exists()).toBe(false);
  });

  it('is hidden when the menu failed (the menu section shows the error)', () => {
    useMenuStore().status = 'error';
    expect(mount(TopDishes).find('section').exists()).toBe(false);
  });

  it('shows placeholders while the menu loads', () => {
    useMenuStore().status = 'loading';
    const wrapper = mount(TopDishes);
    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true);
  });

  it('scrolls the row with the arrow buttons', async () => {
    loadMenu();
    const wrapper = mount(TopDishes, { attachTo: document.body });
    const track = wrapper.get('[data-test="track"]').element as HTMLElement;
    const scrollBy = vi.fn();
    track.scrollBy = scrollBy;
    Object.defineProperty(track, 'clientWidth', { value: 800 });
    await wrapper.get('button[aria-label="Next dishes"]').trigger('click');
    await wrapper.get('button[aria-label="Previous dishes"]').trigger('click');
    expect(scrollBy.mock.calls.map((c) => (c[0] as ScrollToOptions).left)).toEqual([600, -600]);
    wrapper.unmount();
  });
});
