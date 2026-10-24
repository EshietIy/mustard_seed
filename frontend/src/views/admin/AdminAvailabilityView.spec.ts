import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminOptionGroup, Menu } from '@/api/types';
import { useToastStore } from '@/stores/toast';
import { bodyOf, routeFetch } from '@/test-utils/fetch';
import { menuItem } from '@/test-utils/fixtures';
import AdminAvailabilityView from './AdminAvailabilityView.vue';

enableAutoUnmount(afterEach);

function menu(): Menu {
  return {
    categories: [
      {
        id: 'calabar_soups',
        label: 'Calabar soups',
        items: [
          menuItem({ id: 'i-afang', name: 'Afang Soup' }),
          menuItem({ id: 'i-atama', name: 'Atama Soup', isAvailable: false }),
        ],
      },
      { id: 'swallow', label: 'Swallow', items: [] },
      {
        id: 'fresh_juices',
        label: 'Fresh juices',
        items: [menuItem({ id: 'i-zobo', name: 'Zobo' })],
      },
    ],
  };
}

const option = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  priceDeltaKobo: 0,
  isAvailable: true,
  sortOrder: 0,
  archived: false,
  excludedFromItemIds: [],
  priceOverrides: [],
  ...extra,
});

function groups(): AdminOptionGroup[] {
  return [
    {
      id: 'g-protein',
      name: 'Soup protein',
      minChoices: 1,
      maxChoices: 1,
      sortOrder: 0,
      archived: false,
      itemIds: ['i-afang'],
      options: [
        option('o-chicken', 'Chicken'),
        option('o-turkey', 'Turkey', { isAvailable: false }),
        option('o-snail', 'Snail', { archived: true }),
      ],
    },
    {
      id: 'g-old',
      name: 'Old group',
      minChoices: 0,
      maxChoices: 1,
      sortOrder: 1,
      archived: true,
      itemIds: [],
      options: [option('o-old', 'Old option')],
    },
  ];
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const failure = (status: number, code: string, message: string, requestId = 'ref-9') =>
  json({ error: { code, message, requestId } }, status);

function okRoutes(extra: Record<string, () => Response> = {}) {
  return routeFetch({
    'GET /menu': () => json(menu()),
    'GET /admin/option-groups': () => json(groups()),
    ...extra,
  });
}

async function mountView() {
  const wrapper = mount(AdminAvailabilityView);
  await flushPromises();
  return wrapper;
}

const row = (wrapper: Awaited<ReturnType<typeof mountView>>, name: string) => {
  const found = wrapper
    .findAll('[data-test="availability-row"]')
    .find((r) => r.text().includes(name));
  if (!found) throw new Error(`no row for ${name}`);
  return found;
};

describe('AdminAvailabilityView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows a loading state first', () => {
    okRoutes();
    const wrapper = mount(AdminAvailabilityView);
    expect(wrapper.get('[aria-busy="true"]').text()).toContain('Loading');
  });

  it('lists the live meats and every dish by category, with their current state', async () => {
    okRoutes();
    const wrapper = await mountView();
    const meats = wrapper.get('[data-test="meats"]');
    expect(meats.text()).toContain('Soup protein');
    expect(meats.text()).toContain('Chicken');
    expect(meats.text()).toContain('Turkey');
    // Archived options and groups are gone from the menu, so there is nothing to switch.
    expect(meats.text()).not.toContain('Snail');
    expect(meats.text()).not.toContain('Old');

    const dishes = wrapper.get('[data-test="dishes"]');
    expect(dishes.findAll('h3').map((h) => h.text())).toEqual(['Calabar soups', 'Fresh juices']);

    const afang = row(wrapper, 'Afang Soup').get('[role="switch"]');
    expect(afang.attributes('aria-checked')).toBe('true');
    expect(afang.attributes('aria-label')).toBe('Afang Soup available');
    expect(row(wrapper, 'Atama Soup').text()).toContain('Sold out');
    expect(row(wrapper, 'Atama Soup').get('[role="switch"]').attributes('aria-checked')).toBe(
      'false',
    );
    expect(row(wrapper, 'Turkey').text()).toContain('Off');
  });

  it('switches a dish off and says so', async () => {
    const fetchMock = okRoutes({
      'PATCH /admin/menu-items/i-afang': () =>
        json({
          id: 'i-afang',
          name: 'Afang Soup',
          category: 'calabar_soups',
          priceKobo: null,
          isAvailable: false,
        }),
    });
    const wrapper = await mountView();
    await row(wrapper, 'Afang Soup').get('[role="switch"]').trigger('click');
    await flushPromises();
    expect(bodyOf(fetchMock, 'PATCH /admin/menu-items/i-afang')).toEqual({ isAvailable: false });
    expect(row(wrapper, 'Afang Soup').get('[role="switch"]').attributes('aria-checked')).toBe(
      'false',
    );
    expect(row(wrapper, 'Afang Soup').text()).toContain('Sold out');
    expect(useToastStore().messages.at(-1)?.text).toBe('Afang Soup is now sold out.');
  });

  it('switches a meat back on for every soup', async () => {
    const fetchMock = okRoutes({
      'PATCH /admin/options/o-turkey': () => json(groups()[0]),
    });
    const wrapper = await mountView();
    await row(wrapper, 'Turkey').get('[role="switch"]').trigger('click');
    await flushPromises();
    expect(bodyOf(fetchMock, 'PATCH /admin/options/o-turkey')).toEqual({ isAvailable: true });
    expect(row(wrapper, 'Turkey').get('[role="switch"]').attributes('aria-checked')).toBe('true');
    expect(useToastStore().messages.at(-1)?.text).toBe('Turkey is available again.');
  });

  it('disables a switch while its change is saving', async () => {
    let finish: (r: Response) => void = () => {};
    okRoutes({
      'PATCH /admin/menu-items/i-zobo': () => new Promise<Response>((r) => (finish = r)) as never,
    });
    const wrapper = await mountView();
    const zobo = row(wrapper, 'Zobo').get('[role="switch"]');
    await zobo.trigger('click');
    expect(zobo.attributes('disabled')).toBeDefined();
    finish(
      json({
        id: 'i-zobo',
        name: 'Zobo',
        category: 'fresh_juices',
        priceKobo: null,
        isAvailable: false,
      }),
    );
    await flushPromises();
    expect(zobo.attributes('disabled')).toBeUndefined();
  });

  it('keeps the old state and explains a refused change on that row', async () => {
    okRoutes({
      'PATCH /admin/menu-items/i-afang': () =>
        failure(403, 'FORBIDDEN', 'You don’t have permission to do that.'),
    });
    const wrapper = await mountView();
    await row(wrapper, 'Afang Soup').get('[role="switch"]').trigger('click');
    await flushPromises();
    const afang = row(wrapper, 'Afang Soup');
    expect(afang.get('[role="switch"]').attributes('aria-checked')).toBe('true');
    expect(afang.get('[role="alert"]').text()).toContain('You don’t have permission to do that.');
    expect(afang.get('[role="alert"]').text()).toContain('Reference: ref-9');
  });

  it('explains when a meat was removed meanwhile', async () => {
    okRoutes({
      'PATCH /admin/options/o-chicken': () =>
        failure(404, 'OPTION_NOT_FOUND', 'We could not find that option.'),
    });
    const wrapper = await mountView();
    await row(wrapper, 'Chicken').get('[role="switch"]').trigger('click');
    await flushPromises();
    expect(row(wrapper, 'Chicken').get('[role="alert"]').text()).toContain(
      'We could not find that option.',
    );
  });

  it('clears a row’s error once a later change works', async () => {
    let attempt = 0;
    okRoutes({
      'PATCH /admin/menu-items/i-afang': () =>
        ++attempt === 1
          ? failure(503, 'SERVICE_UNAVAILABLE', 'The service is busy. Please try again.')
          : json({
              id: 'i-afang',
              name: 'Afang Soup',
              category: 'calabar_soups',
              priceKobo: null,
              isAvailable: false,
            }),
    });
    const wrapper = await mountView();
    await row(wrapper, 'Afang Soup').get('[role="switch"]').trigger('click');
    await flushPromises();
    expect(row(wrapper, 'Afang Soup').find('[role="alert"]').exists()).toBe(true);
    await row(wrapper, 'Afang Soup').get('[role="switch"]').trigger('click');
    await flushPromises();
    expect(row(wrapper, 'Afang Soup').find('[role="alert"]').exists()).toBe(false);
  });

  it('shows an error with a retry when the lists cannot load', async () => {
    let calls = 0;
    routeFetch({
      'GET /menu': () =>
        ++calls === 1 ? failure(503, 'SERVICE_UNAVAILABLE', 'down', 'ref-42') : json(menu()),
      'GET /admin/option-groups': () => json(groups()),
    });
    const wrapper = await mountView();
    const alert = wrapper.get('[role="alert"]');
    expect(alert.text()).toContain('We couldn’t load the menu.');
    expect(alert.text()).toContain('Reference: ref-42');
    await alert.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="dishes"]').exists()).toBe(true);
  });

  it('says so when there is nothing to switch yet', async () => {
    routeFetch({
      'GET /menu': () => json({ categories: [] }),
      'GET /admin/option-groups': () => json([]),
    });
    const wrapper = await mountView();
    expect(wrapper.get('[data-test="meats"]').text()).toContain('No meats or other choices yet.');
    expect(wrapper.get('[data-test="dishes"]').text()).toContain('No dishes on the menu yet.');
  });
});
