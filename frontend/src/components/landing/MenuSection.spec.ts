import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMenuStore } from '@/stores/menu';
import { sampleMenu } from '@/test-utils/fixtures';
import MenuSection from './MenuSection.vue';

function stubFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function mountLoaded() {
  stubFetch(Response.json(sampleMenu()));
  await useMenuStore().load();
  return mount(MenuSection, { attachTo: document.body });
}

describe('MenuSection', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('shows the heading and one tab per category, the first selected', async () => {
    const wrapper = await mountLoaded();
    expect(wrapper.get('h2').text()).toBe('From our pots to your table');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs.map((t) => t.text())).toEqual([
      'Calabar classics',
      'Swallow & sides',
      'Continental',
      'Drinks',
    ]);
    expect(tabs[0]?.attributes('aria-selected')).toBe('true');
    expect(wrapper.findAll('article h3').map((h) => h.text())).toEqual([
      'Edikang Ikong',
      'Afang Soup',
    ]);
    wrapper.unmount();
  });

  it('switches tabs on click', async () => {
    const wrapper = await mountLoaded();
    await wrapper.findAll('[role="tab"]')[3]!.trigger('click');
    expect(wrapper.findAll('article h3').map((h) => h.text())).toEqual([
      'Zobo',
      'Pineapple & ginger',
      'Watermelon',
    ]);
    wrapper.unmount();
  });

  it('supports arrow-key navigation between tabs', async () => {
    const wrapper = await mountLoaded();
    const tabs = wrapper.findAll('[role="tab"]');
    await tabs[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.findAll('[role="tab"]')[1]?.attributes('aria-selected')).toBe('true');
    await wrapper.findAll('[role="tab"]')[1]!.trigger('keydown', { key: 'ArrowLeft' });
    await wrapper.findAll('[role="tab"]')[0]!.trigger('keydown', { key: 'ArrowLeft' });
    expect(wrapper.findAll('[role="tab"]')[3]?.attributes('aria-selected')).toBe('true');
    await wrapper.findAll('[role="tab"]')[3]!.trigger('keydown', { key: 'Home' });
    expect(wrapper.findAll('[role="tab"]')[0]?.attributes('aria-selected')).toBe('true');
    await wrapper.findAll('[role="tab"]')[0]!.trigger('keydown', { key: 'End' });
    expect(wrapper.findAll('[role="tab"]')[3]?.attributes('aria-selected')).toBe('true');
    wrapper.unmount();
  });

  it('shows a friendly message for a category with no items yet', async () => {
    const wrapper = await mountLoaded();
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click');
    expect(wrapper.text()).toContain('More dishes are coming to this part of the menu soon.');
    wrapper.unmount();
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
    expect(wrapper.findAll('article h3').length).toBe(2);
  });
});
