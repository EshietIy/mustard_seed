import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CART_STORAGE_KEY } from '@/stores/cart';
import { useToastStore } from '@/stores/toast';
import { sampleMenu, sampleSite } from '@/test-utils/fixtures';
import HomeView from './HomeView.vue';

function routeFetch(menu: unknown = sampleMenu()) {
  const fn = vi.fn((url: string) =>
    Promise.resolve(Response.json(url.endsWith('/menu') ? menu : sampleSite())),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

function storeCart(lines: unknown[]) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ lines }));
}

describe('HomeView', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('loads the menu and site info and renders every section in order', async () => {
    const fetchMock = routeFetch();
    const wrapper = mount(HomeView, { attachTo: document.body });
    await flushPromises();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'http://api.test/api/v1/menu',
      'http://api.test/api/v1/site',
    ]);
    expect(
      wrapper.findAll('section').map((s) => s.attributes('id') ?? s.attributes('aria-label')),
    ).toEqual(['top', 'How ordering works', 'menu', 'juices', 'story', 'visit']);
    wrapper.unmount();
  });

  it('opens the cart drawer from the header', async () => {
    routeFetch();
    const wrapper = mount(HomeView, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('[data-test="open-cart"]').trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('removes saved cart items that are no longer on the menu, and says so', async () => {
    storeCart([
      { itemId: 'gone', name: 'Old dish', priceKobo: null, quantity: 1, isAvailable: true },
    ]);
    routeFetch();
    mount(HomeView);
    await flushPromises();
    expect(useToastStore().messages[0]?.text).toBe(
      'Some items in your order are no longer on the menu and were removed.',
    );
  });

  it('flags saved cart items that have sold out', async () => {
    storeCart([
      { itemId: 'i-afang', name: 'Afang Soup', priceKobo: null, quantity: 1, isAvailable: true },
    ]);
    const menu = sampleMenu();
    menu.categories[0]!.items[1]!.isAvailable = false;
    routeFetch(menu);
    mount(HomeView);
    await flushPromises();
    expect(useToastStore().messages[0]?.text).toBe('Some items in your order have sold out.');
  });
});
