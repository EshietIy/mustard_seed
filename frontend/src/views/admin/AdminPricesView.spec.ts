import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Menu } from '@/api/types';
import { useToastStore } from '@/stores/toast';
import { bodyOf, routeFetch } from '@/test-utils/fetch';
import { menuItem } from '@/test-utils/fixtures';
import AdminPricesView from './AdminPricesView.vue';

enableAutoUnmount(afterEach);

function menu(): Menu {
  return {
    categories: [
      {
        id: 'calabar_soups',
        label: 'Calabar soups',
        items: [
          menuItem({ id: 'i-afang', name: 'Afang Soup', priceKobo: 400000 }),
          menuItem({ id: 'i-atama', name: 'Atama Soup', priceKobo: null, isAvailable: false }),
        ],
      },
      { id: 'swallow', label: 'Swallow', items: [] },
      {
        id: 'fresh_juices',
        label: 'Fresh juices',
        items: [menuItem({ id: 'i-zobo', name: 'Zobo', priceKobo: 80050 })],
      },
    ],
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const failure = (status: number, code: string, message: string) =>
  json({ error: { code, message, requestId: 'ref-3' } }, status);
const saved = (id: string, name: string, priceKobo: number | null) =>
  json({ id, name, category: 'calabar_soups', priceKobo, isAvailable: true });

async function mountView() {
  const wrapper = mount(AdminPricesView);
  await flushPromises();
  return wrapper;
}

function dish(wrapper: VueWrapper, name: string) {
  const row = wrapper.findAll('[data-test="dish"]').find((r) => r.text().includes(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

const inputValue = (row: ReturnType<typeof dish>) =>
  (row.get('input').element as HTMLInputElement).value;

describe('AdminPricesView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows a loading state first', () => {
    routeFetch({ 'GET /menu': () => json(menu()) });
    expect(mount(AdminPricesView).get('[aria-busy="true"]').text()).toContain('Loading');
  });

  it('lists every dish by category with its current price', async () => {
    routeFetch({ 'GET /menu': () => json(menu()) });
    const wrapper = await mountView();
    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['Calabar soups', 'Fresh juices']);
    expect(dish(wrapper, 'Afang Soup').text()).toContain('₦4,000');
    expect(inputValue(dish(wrapper, 'Afang Soup'))).toBe('4000');
    expect(inputValue(dish(wrapper, 'Zobo'))).toBe('800.50');
    // No price yet: the placeholder customers see, and an empty box.
    expect(dish(wrapper, 'Atama Soup').text()).toContain('[PRICE]');
    expect(dish(wrapper, 'Atama Soup').text()).toContain('Not orderable until priced');
    expect(inputValue(dish(wrapper, 'Atama Soup'))).toBe('');
    expect(dish(wrapper, 'Atama Soup').find('[data-test="remove-price"]').exists()).toBe(false);
    expect(dish(wrapper, 'Afang Soup').get('input').attributes('aria-label')).toBe(
      'Price of Afang Soup in naira',
    );
  });

  it('saves a new price in kobo and confirms it', async () => {
    const fetchMock = routeFetch({
      'GET /menu': () => json(menu()),
      'PATCH /admin/menu-items/i-afang': () => saved('i-afang', 'Afang Soup', 450000),
    });
    const wrapper = await mountView();
    await dish(wrapper, 'Afang Soup').get('input').setValue('4,500');
    await dish(wrapper, 'Afang Soup').get('form').trigger('submit');
    await flushPromises();
    expect(bodyOf(fetchMock, 'PATCH /admin/menu-items/i-afang')).toEqual({ priceKobo: 450000 });
    expect(dish(wrapper, 'Afang Soup').text()).toContain('₦4,500');
    expect(inputValue(dish(wrapper, 'Afang Soup'))).toBe('4500');
    expect(useToastStore().messages.at(-1)?.text).toBe('Afang Soup now costs ₦4,500.');
  });

  it('prices a dish that had no price yet', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'PATCH /admin/menu-items/i-atama': () => saved('i-atama', 'Atama Soup', 500000),
    });
    const wrapper = await mountView();
    await dish(wrapper, 'Atama Soup').get('input').setValue('5000');
    await dish(wrapper, 'Atama Soup').get('form').trigger('submit');
    await flushPromises();
    expect(dish(wrapper, 'Atama Soup').text()).not.toContain('[PRICE]');
    expect(dish(wrapper, 'Atama Soup').find('[data-test="remove-price"]').exists()).toBe(true);
  });

  it.each([
    ['0', 'The price must be more than ₦0.'],
    ['', 'Enter a price in naira.'],
    ['four thousand', 'Enter the price as a number, for example 1500.'],
  ])('refuses %j without calling the API', async (text, message) => {
    const fetchMock = routeFetch({ 'GET /menu': () => json(menu()) });
    const wrapper = await mountView();
    await dish(wrapper, 'Afang Soup').get('input').setValue(text);
    await dish(wrapper, 'Afang Soup').get('form').trigger('submit');
    await flushPromises();
    expect(dish(wrapper, 'Afang Soup').get('[role="alert"]').text()).toBe(message);
    expect(dish(wrapper, 'Afang Soup').get('input').attributes('aria-invalid')).toBe('true');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('removes a price after asking, so the dish shows [PRICE]', async () => {
    const fetchMock = routeFetch({
      'GET /menu': () => json(menu()),
      'PATCH /admin/menu-items/i-zobo': () => saved('i-zobo', 'Zobo', null),
    });
    const wrapper = await mountView();
    await dish(wrapper, 'Zobo').get('[data-test="remove-price"]').trigger('click');
    const confirm = dish(wrapper, 'Zobo').get('[data-test="remove-confirm"]');
    expect(confirm.text()).toContain('Customers can’t order Zobo until it has a price again.');
    await confirm.get('[data-test="remove-yes"]').trigger('click');
    await flushPromises();
    expect(bodyOf(fetchMock, 'PATCH /admin/menu-items/i-zobo')).toEqual({ priceKobo: null });
    expect(dish(wrapper, 'Zobo').text()).toContain('[PRICE]');
    expect(inputValue(dish(wrapper, 'Zobo'))).toBe('');
    expect(useToastStore().messages.at(-1)?.text).toBe('Zobo has no price now.');
  });

  it('keeps the price when removing is cancelled', async () => {
    routeFetch({ 'GET /menu': () => json(menu()) });
    const wrapper = await mountView();
    await dish(wrapper, 'Zobo').get('[data-test="remove-price"]').trigger('click');
    await dish(wrapper, 'Zobo').get('[data-test="remove-no"]').trigger('click');
    expect(dish(wrapper, 'Zobo').find('[data-test="remove-confirm"]').exists()).toBe(false);
    expect(dish(wrapper, 'Zobo').text()).toContain('₦800.50');
  });

  it('keeps the typed price and explains a refused save on that row', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'PATCH /admin/menu-items/i-afang': () =>
        failure(
          403,
          'SUPER_ADMIN_ONLY',
          'Only a super admin can change prices. Supervisors can switch dishes on or off.',
        ),
    });
    const wrapper = await mountView();
    await dish(wrapper, 'Afang Soup').get('input').setValue('4500');
    await dish(wrapper, 'Afang Soup').get('form').trigger('submit');
    await flushPromises();
    const row = dish(wrapper, 'Afang Soup');
    expect(row.get('[role="alert"]').text()).toContain('Only a super admin can change prices.');
    expect(row.get('[role="alert"]').text()).toContain('Reference: ref-3');
    expect(inputValue(row)).toBe('4500');
    expect(row.text()).toContain('₦4,000');
    expect(dish(wrapper, 'Zobo').find('[role="alert"]').exists()).toBe(false);
  });

  it('explains a dish that was removed meanwhile', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'PATCH /admin/menu-items/i-afang': () =>
        failure(404, 'MENU_ITEM_NOT_FOUND', 'We could not find that menu item.'),
    });
    const wrapper = await mountView();
    await dish(wrapper, 'Afang Soup').get('input').setValue('4500');
    await dish(wrapper, 'Afang Soup').get('form').trigger('submit');
    await flushPromises();
    expect(dish(wrapper, 'Afang Soup').get('[role="alert"]').text()).toContain(
      'We could not find that menu item.',
    );
  });

  it('shows an error with a retry when the menu cannot load', async () => {
    let calls = 0;
    routeFetch({
      'GET /menu': () =>
        ++calls === 1 ? failure(503, 'SERVICE_UNAVAILABLE', 'down') : json(menu()),
    });
    const wrapper = await mountView();
    expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t load the menu.');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-test="dish"]')).toHaveLength(3);
  });

  it('says so when the menu is empty', async () => {
    routeFetch({ 'GET /menu': () => json({ categories: [] }) });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('No dishes on the menu yet.');
  });
});
