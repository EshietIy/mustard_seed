import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Menu } from '@/api/types';
import { useMenuStore } from '@/stores/menu';
import { menuItem, sampleMenu } from '@/test-utils/fixtures';
import MenuSection from './MenuSection.vue';

function stubFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function mountLoaded(menu: Menu = sampleMenu()) {
  stubFetch(Response.json(menu));
  await useMenuStore().load();
  return mount(MenuSection, { attachTo: document.body });
}

const names = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('article h3').map((h) => h.text());

/** A menu with more items than fit before "Show full menu". */
function longMenu(count: number): Menu {
  const menu = sampleMenu();
  for (const category of menu.categories) category.items = [];
  menu.categories[0]!.items = Array.from({ length: count }, (_, i) =>
    menuItem({ id: `i-${i}`, slug: `dish-${i}`, name: `Dish ${i + 1}`, isHouseSignature: false }),
  );
  return menu;
}

describe('MenuSection', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('shows the heading, an "All" pill then one pill per category, "All" selected', async () => {
    const wrapper = await mountLoaded();
    expect(wrapper.get('h2').text()).toBe('Our menu');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((t) => t.text())).toEqual([
      'All',
      'Calabar soups',
      'Swallow',
      'Rice & native dishes',
      'Continental',
      'Fresh juices',
      'Soft drinks & water',
    ]);
    expect(tabs[0]?.attributes('aria-selected')).toBe('true');
    expect(names(wrapper)).toEqual([
      'Edikang Ikong',
      'Afang Soup',
      'Zobo',
      'Pineapple & ginger',
      'Watermelon',
    ]);
    wrapper.unmount();
  });

  it('shows whatever categories the API sends', async () => {
    const wrapper = await mountLoaded({
      categories: [{ id: 'specials', label: 'Weekend specials', items: [menuItem()] }],
    });
    expect(wrapper.findAll('[role="tab"]').map((t) => t.text())).toEqual([
      'All',
      'Weekend specials',
    ]);
    wrapper.unmount();
  });

  it('filters by category on click', async () => {
    const wrapper = await mountLoaded();
    await wrapper.findAll('[role="tab"]')[5]!.trigger('click');
    expect(names(wrapper)).toEqual(['Zobo', 'Pineapple & ginger', 'Watermelon']);
    wrapper.unmount();
  });

  it('supports arrow-key navigation between pills', async () => {
    const wrapper = await mountLoaded();
    const tab = (i: number) => wrapper.findAll('[role="tab"]')[i]!;
    await tab(0).trigger('keydown', { key: 'ArrowRight' });
    expect(tab(1).attributes('aria-selected')).toBe('true');
    await tab(1).trigger('keydown', { key: 'ArrowLeft' });
    await tab(0).trigger('keydown', { key: 'ArrowLeft' });
    expect(tab(6).attributes('aria-selected')).toBe('true');
    await tab(6).trigger('keydown', { key: 'Home' });
    expect(tab(0).attributes('aria-selected')).toBe('true');
    await tab(0).trigger('keydown', { key: 'End' });
    expect(tab(6).attributes('aria-selected')).toBe('true');
    wrapper.unmount();
  });

  it('shows a friendly message for a category with no items yet', async () => {
    const wrapper = await mountLoaded();
    await wrapper.findAll('[role="tab"]')[2]!.trigger('click');
    expect(wrapper.text()).toContain('More dishes are coming to this part of the menu soon.');
    wrapper.unmount();
  });

  describe('search', () => {
    it('filters as the customer types', async () => {
      const wrapper = await mountLoaded();
      await wrapper.get('input[type="search"]').setValue('afang');
      expect(names(wrapper)).toEqual(['Afang Soup']);
      wrapper.unmount();
    });

    it('shows the hero search in the box', async () => {
      const wrapper = await mountLoaded();
      useMenuStore().search('zobo');
      await flushPromises();
      expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe('zobo');
      expect(names(wrapper)).toEqual(['Zobo']);
      wrapper.unmount();
    });

    it('says when nothing matches, and clearing the search shows everything again', async () => {
      const wrapper = await mountLoaded();
      await wrapper.get('input[type="search"]').setValue('pizza');
      expect(names(wrapper)).toEqual([]);
      expect(wrapper.get('[data-test="no-matches"]').text()).toContain('No dishes match “pizza”.');
      await wrapper.get('[data-test="clear-search"]').trigger('click');
      expect(names(wrapper)).toHaveLength(5);
      expect(useMenuStore().query).toBe('');
      wrapper.unmount();
    });

    it('announces the number of results to screen readers', async () => {
      const wrapper = await mountLoaded();
      await wrapper.get('input[type="search"]').setValue('soup');
      expect(wrapper.get('[role="status"]').text()).toBe('2 dishes found');
      wrapper.unmount();
    });
  });

  describe('show full menu', () => {
    it('shows 8 items first, then the rest on request', async () => {
      const wrapper = await mountLoaded(longMenu(18));
      expect(names(wrapper)).toHaveLength(8);
      const more = wrapper.get('[data-test="show-more"]');
      expect(more.text()).toBe('Show full menu (10 more)');
      await more.trigger('click');
      expect(names(wrapper)).toHaveLength(18);
      expect(wrapper.find('[data-test="show-more"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('has no button when everything already fits', async () => {
      const wrapper = await mountLoaded(longMenu(8));
      expect(names(wrapper)).toHaveLength(8);
      expect(wrapper.find('[data-test="show-more"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('starts short again when the filter changes', async () => {
      const wrapper = await mountLoaded(longMenu(18));
      await wrapper.get('[data-test="show-more"]').trigger('click');
      await wrapper.get('input[type="search"]').setValue('dish');
      expect(names(wrapper)).toHaveLength(8);
      wrapper.unmount();
    });
  });

  it('shows a loading state while the menu loads', () => {
    useMenuStore().status = 'loading';
    const wrapper = mount(MenuSection);
    expect(wrapper.get('[aria-busy="true"]').text()).toContain('Loading the menu');
  });

  it('shows an error with a reference and retries', async () => {
    const fetchMock = stubFetch(
      Response.json(
        { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'ref-42' } },
        { status: 503 },
      ),
      Response.json(sampleMenu()),
    );
    await useMenuStore().load();
    const wrapper = mount(MenuSection);
    expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t load the menu.');
    expect(wrapper.text()).toContain('Reference: ref-42');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(names(wrapper)).toHaveLength(5);
  });
});
