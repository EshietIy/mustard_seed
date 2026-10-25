import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminMenuItem } from '@/api/types';
import { useToastStore } from '@/stores/toast';
import { bodyOf, routeFetch } from '@/test-utils/fetch';
import AdminDishesView from './AdminDishesView.vue';

enableAutoUnmount(afterEach);

const dish = (overrides: Partial<AdminMenuItem>): AdminMenuItem => ({
  id: 'd-x',
  slug: 'x',
  name: 'X',
  description: '',
  category: 'calabar_soups',
  priceKobo: 400000,
  isAvailable: true,
  isHouseSignature: false,
  sortOrder: 10,
  archivedAt: null,
  ...overrides,
});

const AFANG = dish({
  id: 'd-afang',
  name: 'Afang Soup',
  description: 'Afang and waterleaf',
  isHouseSignature: true,
});
const EDIKANG = dish({ id: 'd-edikang', name: 'Edikang', sortOrder: 20, priceKobo: null });
const ZOBO = dish({
  id: 'd-zobo',
  name: 'Zobo',
  category: 'fresh_juices',
  priceKobo: 80000,
  isAvailable: false,
});
const FISHERMAN = dish({
  id: 'd-fisher',
  name: 'Fisherman',
  sortOrder: 30,
  archivedAt: '2026-10-22T12:00:00Z',
});

const MENU = {
  categories: [
    { id: 'calabar_soups', label: 'Calabar soups', items: [] },
    { id: 'swallow', label: 'Swallow', items: [] },
    { id: 'fresh_juices', label: 'Fresh juices', items: [] },
  ],
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const failure = (status: number, code: string, message: string, extra: object = {}) =>
  json({ error: { code, message, requestId: 'ref-7', ...extra } }, status);

const base = (items: AdminMenuItem[] = [EDIKANG, AFANG, ZOBO, FISHERMAN]) => ({
  'GET /menu': () => json(MENU),
  'GET /admin/menu-items': () => json(items),
});

async function mountView() {
  const wrapper = mount(AdminDishesView);
  await flushPromises();
  return wrapper;
}

const namesIn = (wrapper: VueWrapper, category: string) =>
  wrapper.findAll(`[data-category="${category}"] [data-test="dish"] .name`).map((n) => n.text());

function row(wrapper: VueWrapper, name: string) {
  const found = wrapper
    .findAll('[data-test="dish"], [data-test="retired"]')
    .find((r) => r.find('.name').text() === name);
  if (!found) throw new Error(`no row for ${name}`);
  return found;
}

async function fillAdd(
  wrapper: VueWrapper,
  fields: {
    name?: string;
    category?: string;
    price?: string;
    description?: string;
    signature?: boolean;
  },
) {
  const form = wrapper.get('[data-test="add-dish"]');
  if (fields.name !== undefined) await form.get('[data-test="add-name"]').setValue(fields.name);
  if (fields.category) await form.get('select').setValue(fields.category);
  if (fields.price !== undefined) await form.get('[data-test="add-price"]').setValue(fields.price);
  if (fields.description !== undefined) {
    await form.get('textarea').setValue(fields.description);
  }
  if (fields.signature) await form.get('input[type="checkbox"]').setValue(true);
  await form.trigger('submit');
  await flushPromises();
}

describe('AdminDishesView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows a loading state first', () => {
    routeFetch(base());
    expect(mount(AdminDishesView).get('[aria-busy="true"]').text()).toContain('Loading');
  });

  it('lists dishes on the menu by category, in their order, with their details', async () => {
    routeFetch(base());
    const wrapper = await mountView();
    expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Afang Soup', 'Edikang']);
    expect(namesIn(wrapper, 'fresh_juices')).toEqual(['Zobo']);
    expect(wrapper.find('[data-category="swallow"]').exists()).toBe(false);
    const afang = row(wrapper, 'Afang Soup').text();
    expect(afang).toContain('₦4,000');
    expect(afang).toContain('House signature');
    expect(afang).toContain('Afang and waterleaf');
    expect(row(wrapper, 'Edikang').text()).toContain('[PRICE]');
    expect(row(wrapper, 'Zobo').text()).toContain('Switched off');
  });

  it('lists retired dishes separately, with when they were retired', async () => {
    routeFetch(base());
    const wrapper = await mountView();
    const retired = wrapper.findAll('[data-test="retired"]');
    expect(retired).toHaveLength(1);
    expect(retired[0]!.text()).toContain('Fisherman');
    expect(retired[0]!.text()).toContain('Calabar soups');
    expect(retired[0]!.text()).toContain('Retired 22 Oct 2026');
    expect(namesIn(wrapper, 'calabar_soups')).not.toContain('Fisherman');
  });

  it('says so when there are no dishes yet', async () => {
    routeFetch(base([]));
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('No dishes yet');
    expect(wrapper.find('[data-test="add-dish"]').exists()).toBe(true);
  });

  it('explains a failure to load, and tries again', async () => {
    let calls = 0;
    routeFetch({
      'GET /menu': () => json(MENU),
      'GET /admin/menu-items': () =>
        ++calls === 1 ? failure(503, 'SERVICE_UNAVAILABLE', 'down') : json([AFANG]),
    });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('We couldn’t load the dishes.');
    expect(wrapper.text()).toContain('Reference: ref-7');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Afang Soup']);
  });

  describe('adding', () => {
    it('adds a dish with every detail, switched off, and says how to turn it on', async () => {
      const created = dish({
        id: 'd-new',
        name: 'Atama Soup',
        description: 'Atama leaves',
        priceKobo: 420050,
        isHouseSignature: true,
        isAvailable: false,
        sortOrder: 30,
      });
      const fetchMock = routeFetch({
        ...base(),
        'POST /admin/menu-items': () => json(created, 201),
      });
      const wrapper = await mountView();
      await fillAdd(wrapper, {
        name: '  Atama Soup ',
        category: 'calabar_soups',
        price: '4,200.50',
        description: ' Atama leaves ',
        signature: true,
      });
      expect(bodyOf(fetchMock, 'POST /admin/menu-items')).toEqual({
        name: 'Atama Soup',
        category: 'calabar_soups',
        description: 'Atama leaves',
        isHouseSignature: true,
        priceKobo: 420050,
      });
      expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Afang Soup', 'Edikang', 'Atama Soup']);
      expect(useToastStore().messages.at(-1)?.text).toBe(
        'Atama Soup added, switched off. Add a photo, then switch it on in Availability.',
      );
      const name = wrapper.get('[data-test="add-name"]').element as HTMLInputElement;
      expect(name.value).toBe('');
    });

    it('adds a dish without a price', async () => {
      const fetchMock = routeFetch({
        ...base(),
        'POST /admin/menu-items': () =>
          json(dish({ id: 'd-n', name: 'Garri', category: 'swallow', priceKobo: null }), 201),
      });
      const wrapper = await mountView();
      await fillAdd(wrapper, { name: 'Garri', category: 'swallow' });
      expect(bodyOf(fetchMock, 'POST /admin/menu-items')).toEqual({
        name: 'Garri',
        category: 'swallow',
        description: '',
        isHouseSignature: false,
      });
      expect(namesIn(wrapper, 'swallow')).toEqual(['Garri']);
    });

    it.each([
      [{ name: '' }, 'name', 'Enter the dish name.'],
      [{ name: 'A'.repeat(121) }, 'name', 'Keep the name to 120 characters.'],
      [{ name: 'Atama', price: 'abc' }, 'price', 'Enter the price as a number, for example 1500.'],
      [{ name: 'Atama', price: '0' }, 'price', 'The price must be more than ₦0.'],
      [
        { name: 'Atama', description: 'x'.repeat(501) },
        'description',
        'Keep the description to 500 characters.',
      ],
    ])('refuses %o without calling the API', async (fields, field, message) => {
      const fetchMock = routeFetch(base());
      const wrapper = await mountView();
      await fillAdd(wrapper, { category: 'swallow', ...fields });
      expect(wrapper.get(`[data-test="add-${field}-error"]`).text()).toBe(message);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('shows a name already on the menu next to the name box', async () => {
      routeFetch({
        ...base(),
        'POST /admin/menu-items': () =>
          failure(409, 'DISH_NAME_TAKEN', 'A dish called “Zobo” is already on the menu.'),
      });
      const wrapper = await mountView();
      await fillAdd(wrapper, { name: 'Zobo', category: 'fresh_juices' });
      expect(wrapper.get('[data-test="add-name-error"]').text()).toBe(
        'A dish called “Zobo” is already on the menu.',
      );
      expect(wrapper.get('[data-test="add-name"]').attributes('aria-invalid')).toBe('true');
    });

    it('shows server field checks next to their boxes', async () => {
      routeFetch({
        ...base(),
        'POST /admin/menu-items': () =>
          failure(400, 'VALIDATION_FAILED', 'Some fields are invalid.', {
            details: [{ field: 'description', messages: ['description is too long'] }],
          }),
      });
      const wrapper = await mountView();
      await fillAdd(wrapper, { name: 'Atama', category: 'swallow' });
      expect(wrapper.get('[data-test="add-description-error"]').text()).toBe(
        'description is too long',
      );
    });

    it('explains any other failure, with its reference', async () => {
      routeFetch({
        ...base(),
        'POST /admin/menu-items': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
      });
      const wrapper = await mountView();
      await fillAdd(wrapper, { name: 'Atama', category: 'swallow' });
      expect(wrapper.get('[data-test="add-error"]').text()).toContain('Reference: ref-7');
      expect(wrapper.find('[data-category="swallow"]').exists()).toBe(false);
    });
  });

  describe('ordering', () => {
    it('cannot move the first dish up or the last one down', async () => {
      routeFetch(base());
      const wrapper = await mountView();
      expect(row(wrapper, 'Afang Soup').get('[data-test="move-up"]').attributes()).toHaveProperty(
        'disabled',
      );
      expect(row(wrapper, 'Edikang').get('[data-test="move-down"]').attributes()).toHaveProperty(
        'disabled',
      );
      expect(
        row(wrapper, 'Afang Soup').get('[data-test="move-down"]').attributes(),
      ).not.toHaveProperty('disabled');
    });

    it('moves a dish and shows the new order', async () => {
      const fetchMock = routeFetch({
        ...base(),
        'POST /admin/menu-items/d-edikang/move': () =>
          json([{ ...EDIKANG, sortOrder: 10 }, { ...AFANG, sortOrder: 20 }, ZOBO, FISHERMAN]),
      });
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="move-up"]').trigger('click');
      await flushPromises();
      expect(bodyOf(fetchMock, 'POST /admin/menu-items/d-edikang/move')).toEqual({
        direction: 'up',
      });
      expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Edikang', 'Afang Soup']);
      expect(row(wrapper, 'Edikang').get('[data-test="move-up"]').attributes('aria-label')).toBe(
        'Move Edikang up',
      );
    });

    it('keeps the order and explains a failed move', async () => {
      routeFetch({
        ...base(),
        'POST /admin/menu-items/d-afang/move': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
      });
      const wrapper = await mountView();
      await row(wrapper, 'Afang Soup').get('[data-test="move-down"]').trigger('click');
      await flushPromises();
      expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Afang Soup', 'Edikang']);
      expect(row(wrapper, 'Afang Soup').text()).toContain('Reference: ref-7');
    });
  });

  describe('editing', () => {
    it('opens with the current details and sends only what changed', async () => {
      const fetchMock = routeFetch({
        ...base(),
        'PATCH /admin/menu-items/d-afang': () =>
          json({ ...AFANG, name: 'Afang', category: 'swallow', sortOrder: 10 }),
      });
      const wrapper = await mountView();
      await row(wrapper, 'Afang Soup').get('[data-test="edit"]').trigger('click');
      const form = wrapper.get('[data-test="edit-form"]');
      expect((form.get('[data-test="edit-name"]').element as HTMLInputElement).value).toBe(
        'Afang Soup',
      );
      expect((form.get('textarea').element as HTMLTextAreaElement).value).toBe(
        'Afang and waterleaf',
      );
      expect((form.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true);
      await form.get('[data-test="edit-name"]').setValue(' Afang ');
      await form.get('select').setValue('swallow');
      await form.trigger('submit');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/menu-items/d-afang')).toEqual({
        name: 'Afang',
        category: 'swallow',
      });
      expect(wrapper.find('[data-test="edit-form"]').exists()).toBe(false);
      expect(namesIn(wrapper, 'swallow')).toEqual(['Afang']);
      expect(useToastStore().messages.at(-1)?.text).toBe('Afang saved.');
    });

    it('closes without calling the API when nothing changed', async () => {
      const fetchMock = routeFetch(base());
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="edit"]').trigger('click');
      await wrapper.get('[data-test="edit-form"]').trigger('submit');
      await flushPromises();
      expect(wrapper.find('[data-test="edit-form"]').exists()).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('cancels without saving', async () => {
      routeFetch(base());
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="edit"]').trigger('click');
      await wrapper.get('[data-test="edit-name"]').setValue('Changed');
      await wrapper.get('[data-test="edit-cancel"]').trigger('click');
      expect(wrapper.find('[data-test="edit-form"]').exists()).toBe(false);
      expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Afang Soup', 'Edikang']);
    });

    it('refuses a blank name without calling the API', async () => {
      const fetchMock = routeFetch(base());
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="edit"]').trigger('click');
      await wrapper.get('[data-test="edit-name"]').setValue('  ');
      await wrapper.get('[data-test="edit-form"]').trigger('submit');
      expect(wrapper.get('[data-test="edit-name-error"]').text()).toBe('Enter the dish name.');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('refuses an over-long description without calling the API', async () => {
      const fetchMock = routeFetch(base());
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="edit"]').trigger('click');
      await wrapper.get('[data-test="edit-form"] textarea').setValue('x'.repeat(501));
      await wrapper.get('[data-test="edit-form"]').trigger('submit');
      expect(wrapper.get('[data-test="edit-description-error"]').text()).toBe(
        'Keep the description to 500 characters.',
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('shows a name already on the menu next to the name box, keeping the form open', async () => {
      routeFetch({
        ...base(),
        'PATCH /admin/menu-items/d-edikang': () =>
          failure(409, 'DISH_NAME_TAKEN', 'A dish called “Afang Soup” is already on the menu.'),
      });
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="edit"]').trigger('click');
      await wrapper.get('[data-test="edit-name"]').setValue('Afang Soup');
      await wrapper.get('[data-test="edit-form"]').trigger('submit');
      await flushPromises();
      expect(wrapper.get('[data-test="edit-name-error"]').text()).toBe(
        'A dish called “Afang Soup” is already on the menu.',
      );
      expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Afang Soup', 'Edikang']);
    });

    it('explains any other failure to save', async () => {
      routeFetch({
        ...base(),
        'PATCH /admin/menu-items/d-edikang': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
      });
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="edit"]').trigger('click');
      await wrapper.get('[data-test="edit-name"]').setValue('Edikang Ikong');
      await wrapper.get('[data-test="edit-form"]').trigger('submit');
      await flushPromises();
      expect(wrapper.get('[data-test="edit-form"]').text()).toContain('Reference: ref-7');
    });
  });

  describe('retiring', () => {
    it('retires a dish after explaining what that means', async () => {
      const fetchMock = routeFetch({
        ...base(),
        'PATCH /admin/menu-items/d-edikang': () =>
          json({ ...EDIKANG, archivedAt: '2026-10-25T10:00:00Z' }),
      });
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="retire"]').trigger('click');
      const confirm = row(wrapper, 'Edikang').get('[data-test="retire-confirm"]');
      expect(confirm.text()).toContain(
        'Retire Edikang? It leaves the menu and can’t be ordered. Past orders still show it, and you can bring it back later.',
      );
      await confirm.get('[data-test="retire-yes"]').trigger('click');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/menu-items/d-edikang')).toEqual({ isArchived: true });
      expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Afang Soup']);
      expect(wrapper.findAll('[data-test="retired"]')).toHaveLength(2);
      expect(useToastStore().messages.at(-1)?.text).toBe('Edikang retired.');
    });

    it('keeps the dish when the confirmation is cancelled', async () => {
      routeFetch(base());
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="retire"]').trigger('click');
      await row(wrapper, 'Edikang').get('[data-test="retire-no"]').trigger('click');
      expect(row(wrapper, 'Edikang').find('[data-test="retire-confirm"]').exists()).toBe(false);
    });

    it('keeps the dish and explains a failed retire', async () => {
      routeFetch({
        ...base(),
        'PATCH /admin/menu-items/d-edikang': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
      });
      const wrapper = await mountView();
      await row(wrapper, 'Edikang').get('[data-test="retire"]').trigger('click');
      await row(wrapper, 'Edikang').get('[data-test="retire-yes"]').trigger('click');
      await flushPromises();
      expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Afang Soup', 'Edikang']);
      expect(row(wrapper, 'Edikang').text()).toContain('Reference: ref-7');
    });

    it('brings a retired dish back, switched off', async () => {
      const fetchMock = routeFetch({
        ...base(),
        'PATCH /admin/menu-items/d-fisher': () =>
          json({ ...FISHERMAN, archivedAt: null, isAvailable: false }),
      });
      const wrapper = await mountView();
      await row(wrapper, 'Fisherman').get('[data-test="restore"]').trigger('click');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/menu-items/d-fisher')).toEqual({ isArchived: false });
      expect(namesIn(wrapper, 'calabar_soups')).toEqual(['Afang Soup', 'Edikang', 'Fisherman']);
      expect(wrapper.findAll('[data-test="retired"]')).toHaveLength(0);
      expect(useToastStore().messages.at(-1)?.text).toBe(
        'Fisherman is back on the menu, switched off. Switch it on in Availability when it’s ready.',
      );
    });

    it('explains why a dish cannot come back', async () => {
      routeFetch({
        ...base(),
        'PATCH /admin/menu-items/d-fisher': () =>
          failure(409, 'DISH_NAME_TAKEN', 'A dish called “Fisherman” is already on the menu.'),
      });
      const wrapper = await mountView();
      await row(wrapper, 'Fisherman').get('[data-test="restore"]').trigger('click');
      await flushPromises();
      expect(row(wrapper, 'Fisherman').text()).toContain(
        'A dish called “Fisherman” is already on the menu.',
      );
    });
  });
});
