import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AdminOption, AdminOptionGroup, Menu } from '@/api/types';
import { useAuthStore, type Role } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { bodyOf, routeFetch } from '@/test-utils/fetch';
import { menuItem } from '@/test-utils/fixtures';
import AdminMeatsView from './AdminMeatsView.vue';

enableAutoUnmount(afterEach);

const AFANG = 'i-afang';
const FISHERMAN = 'i-fisherman';

function menu(): Menu {
  return {
    categories: [
      {
        id: 'calabar_soups',
        label: 'Calabar soups',
        items: [
          menuItem({ id: AFANG, name: 'Afang Soup' }),
          menuItem({ id: FISHERMAN, name: 'Fisherman Soup' }),
        ],
      },
    ],
  };
}

const option = (id: string, name: string, extra: Partial<AdminOption> = {}): AdminOption => ({
  id,
  name,
  priceDeltaKobo: 0,
  isAvailable: true,
  sortOrder: 10,
  archived: false,
  excludedFromItemIds: [],
  priceOverrides: [],
  ...extra,
});

function protein(options?: AdminOption[]): AdminOptionGroup {
  return {
    id: 'g-protein',
    name: 'Soup protein',
    minChoices: 1,
    maxChoices: 1,
    sortOrder: 0,
    archived: false,
    itemIds: [AFANG, FISHERMAN],
    options: options ?? [
      option('o-chicken', 'Chicken', {
        priceDeltaKobo: 50000,
        sortOrder: 10,
        priceOverrides: [{ itemId: FISHERMAN, priceDeltaKobo: 80000 }],
      }),
      option('o-beef', 'Beef', { sortOrder: 5, excludedFromItemIds: [FISHERMAN] }),
      option('o-snail', 'Snail', { archived: true }),
    ],
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const failure = (
  status: number,
  code: string,
  message: string,
  details?: Array<{ field: string; messages: string[] }>,
) => json({ error: { code, message, requestId: 'ref-7', details } }, status);

function okRoutes(extra: Record<string, (init?: RequestInit) => Response> = {}) {
  return routeFetch({
    'GET /admin/option-groups': () =>
      json([protein(), { ...protein([]), id: 'g-old', name: 'Old', archived: true }]),
    'GET /menu': () => json(menu()),
    ...extra,
  });
}

function signIn(role: Role): void {
  const auth = useAuthStore();
  auth.status = 'signed-in';
  auth.user = {
    id: 'u-1',
    email: 'staff@example.com',
    firstName: 'Nse',
    fullName: 'Nse Etim',
    avatarUrl: null,
    role,
  };
}

async function mountView() {
  const wrapper = mount(AdminMeatsView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

function meat(wrapper: VueWrapper, name: string) {
  const card = wrapper.findAll('[data-test="meat"]').find((c) => c.get('h3').text() === name);
  if (!card) throw new Error(`no card for ${name}`);
  return card;
}

describe('AdminMeatsView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  describe('listing', () => {
    it('shows a loading state first', () => {
      okRoutes();
      expect(mount(AdminMeatsView).get('[aria-busy="true"]').text()).toContain('Loading');
    });

    it('lists the live meats of each live group in order, with their prices', async () => {
      okRoutes();
      const wrapper = await mountView();
      expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['Soup protein']);
      expect(wrapper.findAll('[data-test="meat"] h3').map((h) => h.text())).toEqual([
        'Beef',
        'Chicken',
      ]);
      expect(
        (meat(wrapper, 'Chicken').get('[data-test="price"]').element as HTMLInputElement).value,
      ).toBe('500');
      expect(meat(wrapper, 'Chicken').get('[data-test="per-dish-toggle"]').text()).toContain(
        'Different price on 1 dish',
      );
    });

    it('shows an error with a retry when the meats cannot load', async () => {
      let calls = 0;
      routeFetch({
        'GET /admin/option-groups': () =>
          ++calls === 1 ? failure(503, 'SERVICE_UNAVAILABLE', 'down') : json([protein()]),
        'GET /menu': () => json(menu()),
      });
      const wrapper = await mountView();
      expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t load the meats.');
      await wrapper.get('[role="alert"] button').trigger('click');
      await flushPromises();
      expect(wrapper.findAll('[data-test="meat"]')).toHaveLength(2);
    });

    it('says so when there are no choice groups yet', async () => {
      routeFetch({ 'GET /admin/option-groups': () => json([]), 'GET /menu': () => json(menu()) });
      const wrapper = await mountView();
      expect(wrapper.text()).toContain('No meats or other choices have been set up yet.');
    });
  });

  describe('changing a meat’s price', () => {
    it('saves the new price in kobo and confirms it', async () => {
      const updated = protein();
      updated.options[0]!.priceDeltaKobo = 70000;
      const fetchMock = okRoutes({ 'PATCH /admin/options/o-chicken': () => json(updated) });
      const wrapper = await mountView();
      const card = meat(wrapper, 'Chicken');
      await card.get('[data-test="price"]').setValue('₦700');
      await card.get('[data-test="price-form"]').trigger('submit');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/options/o-chicken')).toEqual({
        priceDeltaKobo: 70000,
      });
      expect(
        (meat(wrapper, 'Chicken').get('[data-test="price"]').element as HTMLInputElement).value,
      ).toBe('700');
      expect(useToastStore().messages.at(-1)?.text).toBe('Chicken now adds ₦700.');
    });

    it('refuses a price that is not a number without calling the API', async () => {
      const fetchMock = okRoutes();
      const wrapper = await mountView();
      const card = meat(wrapper, 'Chicken');
      await card.get('[data-test="price"]').setValue('seven hundred');
      await card.get('[data-test="price-form"]').trigger('submit');
      await flushPromises();
      expect(card.get('[data-test="price-error"]').text()).toBe(
        'Enter the price as a number, for example 1500.',
      );
      expect(card.get('[data-test="price"]').attributes('aria-invalid')).toBe('true');
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    });

    it('shows the server’s reason and keeps what was typed', async () => {
      okRoutes({
        'PATCH /admin/options/o-chicken': () =>
          failure(429, 'RATE_LIMITED', 'Too many attempts. Please wait a moment and try again.'),
      });
      const wrapper = await mountView();
      const card = meat(wrapper, 'Chicken');
      await card.get('[data-test="price"]').setValue('900');
      await card.get('[data-test="price-form"]').trigger('submit');
      await flushPromises();
      expect(card.get('[data-test="price-error"]').text()).toContain('Too many attempts');
      expect(card.get('[data-test="price-error"]').text()).toContain('Reference: ref-7');
      expect((card.get('[data-test="price"]').element as HTMLInputElement).value).toBe('900');
    });
  });

  describe('prices on each dish', () => {
    async function openPerDish(wrapper: VueWrapper, name: string) {
      await meat(wrapper, name).get('[data-test="per-dish-toggle"]').trigger('click');
      return meat(wrapper, name);
    }

    const dishRow = (card: ReturnType<typeof meat>, dish: string) => {
      const row = card.findAll('[data-test="dish-price"]').find((r) => r.text().includes(dish));
      if (!row) throw new Error(`no row for ${dish}`);
      return row;
    };

    it('lists only the dishes that offer the meat, with any special price', async () => {
      okRoutes();
      const wrapper = await mountView();
      const chicken = await openPerDish(wrapper, 'Chicken');
      expect(chicken.findAll('[data-test="dish-price"]')).toHaveLength(2);
      const fisherman = dishRow(chicken, 'Fisherman Soup');
      expect((fisherman.get('input').element as HTMLInputElement).value).toBe('800');
      expect(fisherman.find('[data-test="use-normal"]').exists()).toBe(true);
      const afang = dishRow(chicken, 'Afang Soup');
      expect((afang.get('input').element as HTMLInputElement).value).toBe('');
      expect(afang.get('input').attributes('placeholder')).toBe('500 (normal price)');
      expect(afang.find('[data-test="use-normal"]').exists()).toBe(false);

      const beef = await openPerDish(wrapper, 'Beef');
      expect(beef.findAll('[data-test="dish-price"]').map((r) => r.get('label').text())).toEqual([
        'Beef extra cost on Afang Soup',
      ]);
    });

    it('sets a special price on one dish', async () => {
      const fetchMock = okRoutes({
        'PUT /admin/menu-items/i-afang/options/o-chicken': () =>
          json({ itemId: AFANG, optionId: 'o-chicken', isExcluded: false, priceDeltaKobo: 60000 }),
      });
      const wrapper = await mountView();
      const chicken = await openPerDish(wrapper, 'Chicken');
      await dishRow(chicken, 'Afang Soup').get('input').setValue('600');
      await dishRow(chicken, 'Afang Soup').get('form').trigger('submit');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PUT /admin/menu-items/i-afang/options/o-chicken')).toEqual({
        priceDeltaKobo: 60000,
      });
      expect(meat(wrapper, 'Chicken').get('[data-test="per-dish-toggle"]').text()).toContain(
        'Different price on 2 dishes',
      );
      expect(useToastStore().messages.at(-1)?.text).toBe('Chicken now adds ₦600 on Afang Soup.');
    });

    it('goes back to the normal price on one dish', async () => {
      const fetchMock = okRoutes({
        'PUT /admin/menu-items/i-fisherman/options/o-chicken': () =>
          json({
            itemId: FISHERMAN,
            optionId: 'o-chicken',
            isExcluded: false,
            priceDeltaKobo: null,
          }),
      });
      const wrapper = await mountView();
      const chicken = await openPerDish(wrapper, 'Chicken');
      await dishRow(chicken, 'Fisherman Soup').get('[data-test="use-normal"]').trigger('click');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PUT /admin/menu-items/i-fisherman/options/o-chicken')).toEqual({
        priceDeltaKobo: null,
      });
      const row = dishRow(meat(wrapper, 'Chicken'), 'Fisherman Soup');
      expect((row.get('input').element as HTMLInputElement).value).toBe('');
      expect(row.find('[data-test="use-normal"]').exists()).toBe(false);
      expect(useToastStore().messages.at(-1)?.text).toBe(
        'Fisherman Soup uses the normal Chicken price again.',
      );
    });

    it('keeps unsaved typing on other dishes when one dish is saved', async () => {
      okRoutes({
        'PUT /admin/menu-items/i-fisherman/options/o-chicken': () =>
          json({
            itemId: FISHERMAN,
            optionId: 'o-chicken',
            isExcluded: false,
            priceDeltaKobo: null,
          }),
      });
      const wrapper = await mountView();
      const chicken = await openPerDish(wrapper, 'Chicken');
      await dishRow(chicken, 'Afang Soup').get('input').setValue('650');
      await dishRow(chicken, 'Fisherman Soup').get('[data-test="use-normal"]').trigger('click');
      await flushPromises();
      expect((dishRow(chicken, 'Afang Soup').get('input').element as HTMLInputElement).value).toBe(
        '650',
      );
    });

    it('explains a refused change on that dish only', async () => {
      okRoutes({
        'PUT /admin/menu-items/i-afang/options/o-chicken': () =>
          failure(
            403,
            'OPTION_EXCLUDED_ON_ITEM',
            "This item doesn't offer that option. Ask a super admin to offer it first.",
          ),
      });
      const wrapper = await mountView();
      const chicken = await openPerDish(wrapper, 'Chicken');
      await dishRow(chicken, 'Afang Soup').get('input').setValue('600');
      await dishRow(chicken, 'Afang Soup').get('form').trigger('submit');
      await flushPromises();
      expect(dishRow(chicken, 'Afang Soup').get('[role="alert"]').text()).toContain(
        'Ask a super admin to offer it first.',
      );
      expect(dishRow(chicken, 'Fisherman Soup').find('[role="alert"]').exists()).toBe(false);
    });

    it('needs a price before saving one dish', async () => {
      okRoutes();
      const wrapper = await mountView();
      const chicken = await openPerDish(wrapper, 'Chicken');
      await dishRow(chicken, 'Afang Soup').get('form').trigger('submit');
      await flushPromises();
      expect(dishRow(chicken, 'Afang Soup').get('[role="alert"]').text()).toContain(
        'Enter a price in naira',
      );
    });
  });

  describe('switching a meat on and off', () => {
    it('switches it off for every dish', async () => {
      const updated = protein();
      updated.options[1]!.isAvailable = false;
      const fetchMock = okRoutes({ 'PATCH /admin/options/o-beef': () => json(updated) });
      const wrapper = await mountView();
      await meat(wrapper, 'Beef').get('[role="switch"]').trigger('click');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/options/o-beef')).toEqual({ isAvailable: false });
      expect(meat(wrapper, 'Beef').get('[role="switch"]').attributes('aria-checked')).toBe('false');
      expect(useToastStore().messages.at(-1)?.text).toBe('Beef is now switched off.');
    });
  });

  describe('adding a meat', () => {
    const form = (wrapper: VueWrapper) => wrapper.get('[data-test="add-meat"]');

    it('offers every dish that uses the group, all ticked', async () => {
      okRoutes();
      const wrapper = await mountView();
      const boxes = form(wrapper).findAll('input[type="checkbox"]');
      expect(boxes).toHaveLength(2);
      expect(boxes.every((b) => (b.element as HTMLInputElement).checked)).toBe(true);
      expect(form(wrapper).text()).toContain('Afang Soup');
      expect(form(wrapper).text()).toContain('Fisherman Soup');
    });

    it('adds a meat with its price on the ticked dishes', async () => {
      const withGoat = protein();
      withGoat.options.push(
        option('o-goat', 'Goat meat', { priceDeltaKobo: 90000, sortOrder: 20 }),
      );
      const fetchMock = okRoutes({
        'POST /admin/option-groups/g-protein/options': () => json(withGoat, 201),
      });
      const wrapper = await mountView();
      await form(wrapper).get('[data-test="new-name"]').setValue('  Goat meat ');
      await form(wrapper).get('[data-test="new-price"]').setValue('900');
      await form(wrapper).findAll('input[type="checkbox"]')[1]!.setValue(false);
      await form(wrapper).trigger('submit');
      await flushPromises();
      expect(bodyOf(fetchMock, 'POST /admin/option-groups/g-protein/options')).toEqual({
        name: 'Goat meat',
        priceDeltaKobo: 90000,
        itemIds: [AFANG],
      });
      expect(wrapper.findAll('[data-test="meat"] h3').map((h) => h.text())).toContain('Goat meat');
      expect((form(wrapper).get('[data-test="new-name"]').element as HTMLInputElement).value).toBe(
        '',
      );
      expect(useToastStore().messages.at(-1)?.text).toBe('Goat meat added.');
    });

    it('needs a name, a price and at least one dish', async () => {
      const fetchMock = okRoutes();
      const wrapper = await mountView();
      for (const box of form(wrapper).findAll('input[type="checkbox"]')) await box.setValue(false);
      await form(wrapper).trigger('submit');
      await flushPromises();
      expect(form(wrapper).get('[data-test="new-name-error"]').text()).toBe('Enter a name.');
      expect(form(wrapper).get('[data-test="new-price-error"]').text()).toContain(
        'Enter a price in naira',
      );
      expect(form(wrapper).get('[data-test="new-dishes-error"]').text()).toBe(
        'Tick at least one dish.',
      );
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    });

    it('shows a taken name next to the name field', async () => {
      okRoutes({
        'POST /admin/option-groups/g-protein/options': () =>
          failure(
            409,
            'OPTION_NAME_TAKEN',
            'That name is already in use here. Choose a different name.',
          ),
      });
      const wrapper = await mountView();
      await form(wrapper).get('[data-test="new-name"]').setValue('Chicken');
      await form(wrapper).get('[data-test="new-price"]').setValue('0');
      await form(wrapper).trigger('submit');
      await flushPromises();
      expect(form(wrapper).get('[data-test="new-name-error"]').text()).toBe(
        'That name is already in use here. Choose a different name.',
      );
      expect((form(wrapper).get('[data-test="new-name"]').element as HTMLInputElement).value).toBe(
        'Chicken',
      );
    });

    it('shows the server’s field errors next to the fields', async () => {
      okRoutes({
        'POST /admin/option-groups/g-protein/options': () =>
          failure(400, 'VALIDATION_FAILED', 'Some fields are invalid.', [
            { field: 'name', messages: ['name must be shorter than or equal to 40 characters'] },
          ]),
      });
      const wrapper = await mountView();
      await form(wrapper).get('[data-test="new-name"]').setValue('x'.repeat(41));
      await form(wrapper).get('[data-test="new-price"]').setValue('0');
      await form(wrapper).trigger('submit');
      await flushPromises();
      expect(form(wrapper).get('[data-test="new-name-error"]').text()).toContain('40 characters');
    });

    it('shows other failures for the whole form, with a reference', async () => {
      okRoutes({
        'POST /admin/option-groups/g-protein/options': () =>
          failure(503, 'SERVICE_UNAVAILABLE', 'internal'),
      });
      const wrapper = await mountView();
      await form(wrapper).get('[data-test="new-name"]').setValue('Goat meat');
      await form(wrapper).get('[data-test="new-price"]').setValue('900');
      await form(wrapper).trigger('submit');
      await flushPromises();
      const alert = form(wrapper).get('[data-test="add-error"]');
      expect(alert.text()).toContain('Something went wrong on our side.');
      expect(alert.text()).toContain('Reference: ref-7');
    });
  });

  describe('what a supervisor does not see', () => {
    it('has no rename, reorder, archive, restore or offer controls', async () => {
      signIn('supervisor');
      okRoutes();
      const wrapper = await mountView();
      await meat(wrapper, 'Chicken').get('[data-test="per-dish-toggle"]').trigger('click');
      for (const test of ['rename', 'move-up', 'move-down', 'archive', 'offered', 'archived']) {
        expect(wrapper.find(`[data-test="${test}"]`).exists()).toBe(false);
      }
    });
  });

  describe('super admin tools', () => {
    beforeEach(() => signIn('super_admin'));

    it('renames a meat', async () => {
      const renamed = protein();
      renamed.options[0]!.name = 'Hen';
      const fetchMock = okRoutes({ 'PATCH /admin/options/o-chicken': () => json(renamed) });
      const wrapper = await mountView();
      await meat(wrapper, 'Chicken').get('[data-test="rename"]').trigger('click');
      const form = meat(wrapper, 'Chicken').get('[data-test="rename-form"]');
      await form.get('input').setValue(' Hen ');
      await form.trigger('submit');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/options/o-chicken')).toEqual({ name: 'Hen' });
      expect(wrapper.findAll('[data-test="meat"] h3').map((h) => h.text())).toContain('Hen');
      expect(useToastStore().messages.at(-1)?.text).toBe('Chicken is now called Hen.');
    });

    it('shows a taken name next to the rename field', async () => {
      okRoutes({
        'PATCH /admin/options/o-chicken': () =>
          failure(
            409,
            'OPTION_NAME_TAKEN',
            'That name is already in use here. Choose a different name.',
          ),
      });
      const wrapper = await mountView();
      await meat(wrapper, 'Chicken').get('[data-test="rename"]').trigger('click');
      const form = meat(wrapper, 'Chicken').get('[data-test="rename-form"]');
      await form.get('input').setValue('Beef');
      await form.trigger('submit');
      await flushPromises();
      expect(form.get('[role="alert"]').text()).toContain('already in use');
      expect((form.get('input').element as HTMLInputElement).value).toBe('Beef');
    });

    it('needs a name to rename, and can be cancelled', async () => {
      const fetchMock = okRoutes();
      const wrapper = await mountView();
      await meat(wrapper, 'Chicken').get('[data-test="rename"]').trigger('click');
      const form = meat(wrapper, 'Chicken').get('[data-test="rename-form"]');
      await form.get('input').setValue('  ');
      await form.trigger('submit');
      expect(form.get('[role="alert"]').text()).toBe('Enter a name.');
      await form.get('[data-test="rename-cancel"]').trigger('click');
      expect(meat(wrapper, 'Chicken').find('[data-test="rename-form"]').exists()).toBe(false);
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    });

    it('moves a meat up by renumbering the group in its new order', async () => {
      const reordered = protein();
      reordered.options[0]!.sortOrder = 10;
      reordered.options[1]!.sortOrder = 20;
      const fetchMock = okRoutes({
        'PATCH /admin/options/o-chicken': () => json(reordered),
        'PATCH /admin/options/o-beef': () => json(reordered),
      });
      const wrapper = await mountView();
      // Beef (5) is first, Chicken (10) second; moving Chicken up renumbers to Chicken 10, Beef 20.
      expect(
        meat(wrapper, 'Beef').get('[data-test="move-up"]').attributes('disabled'),
      ).toBeDefined();
      expect(
        meat(wrapper, 'Chicken').get('[data-test="move-down"]').attributes('disabled'),
      ).toBeDefined();
      await meat(wrapper, 'Chicken').get('[data-test="move-up"]').trigger('click');
      await flushPromises();
      // Chicken already sits at 10, so only Beef needs saving.
      expect(bodyOf(fetchMock, 'PATCH /admin/options/o-chicken')).toBeUndefined();
      expect(bodyOf(fetchMock, 'PATCH /admin/options/o-beef')).toEqual({ sortOrder: 20 });
      expect(wrapper.findAll('[data-test="meat"] h3').map((h) => h.text())).toEqual([
        'Chicken',
        'Beef',
      ]);
    });

    it('explains a failed move above the list', async () => {
      okRoutes({
        'PATCH /admin/options/o-chicken': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
        'PATCH /admin/options/o-beef': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
      });
      const wrapper = await mountView();
      await meat(wrapper, 'Chicken').get('[data-test="move-up"]').trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-test="order-error"]').text()).toContain('Reference: ref-7');
      expect(wrapper.findAll('[data-test="meat"] h3').map((h) => h.text())).toEqual([
        'Beef',
        'Chicken',
      ]);
    });

    it('archives a meat after asking, and lists it under Archived', async () => {
      const archived = protein();
      archived.options[0]!.archived = true;
      const fetchMock = okRoutes({ 'PATCH /admin/options/o-chicken': () => json(archived) });
      const wrapper = await mountView();
      await meat(wrapper, 'Chicken').get('[data-test="archive"]').trigger('click');
      const confirm = meat(wrapper, 'Chicken').get('[data-test="archive-confirm"]');
      expect(confirm.text()).toContain('Archive Chicken?');
      expect(confirm.text()).toContain('Past orders still show it.');
      await confirm.get('[data-test="archive-yes"]').trigger('click');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/options/o-chicken')).toEqual({ archived: true });
      expect(wrapper.findAll('[data-test="meat"] h3').map((h) => h.text())).toEqual(['Beef']);
      const list = wrapper.get('[data-test="archived"]');
      expect(list.text()).toContain('Chicken');
      expect(list.text()).toContain('Snail');
      expect(useToastStore().messages.at(-1)?.text).toBe('Chicken archived.');
    });

    it('keeps the meat when archiving is cancelled', async () => {
      okRoutes();
      const wrapper = await mountView();
      await meat(wrapper, 'Chicken').get('[data-test="archive"]').trigger('click');
      await meat(wrapper, 'Chicken').get('[data-test="archive-no"]').trigger('click');
      expect(meat(wrapper, 'Chicken').find('[data-test="archive-confirm"]').exists()).toBe(false);
    });

    it('restores an archived meat', async () => {
      const restored = protein();
      restored.options[2]!.archived = false;
      const fetchMock = okRoutes({ 'PATCH /admin/options/o-snail': () => json(restored) });
      const wrapper = await mountView();
      const row = wrapper
        .get('[data-test="archived"]')
        .findAll('li')
        .find((li) => li.text().includes('Snail'))!;
      await row.get('button').trigger('click');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/options/o-snail')).toEqual({ archived: false });
      expect(wrapper.findAll('[data-test="meat"] h3').map((h) => h.text())).toContain('Snail');
      expect(useToastStore().messages.at(-1)?.text).toBe('Snail is back on the menu.');
    });

    it('explains a failed restore on that row', async () => {
      okRoutes({
        'PATCH /admin/options/o-snail': () =>
          failure(
            409,
            'OPTION_NAME_TAKEN',
            'That name is already in use here. Choose a different name.',
          ),
      });
      const wrapper = await mountView();
      const archived = wrapper.get('[data-test="archived"]');
      await archived.get('button').trigger('click');
      await flushPromises();
      expect(archived.get('[role="alert"]').text()).toContain('already in use');
    });

    describe('which dishes offer a meat', () => {
      const dishRow = (card: ReturnType<typeof meat>, dish: string) =>
        card.findAll('[data-test="dish-price"]').find((r) => r.text().includes(dish))!;

      it('lists every dish using the group, ticked where the meat is offered', async () => {
        okRoutes();
        const wrapper = await mountView();
        await meat(wrapper, 'Beef').get('[data-test="per-dish-toggle"]').trigger('click');
        const beef = meat(wrapper, 'Beef');
        expect(beef.findAll('[data-test="dish-price"]')).toHaveLength(2);
        const offered = (dish: string) =>
          (dishRow(beef, dish).get('[data-test="offered"]').element as HTMLInputElement).checked;
        expect(offered('Afang Soup')).toBe(true);
        expect(offered('Fisherman Soup')).toBe(false);
        // No price box where the meat isn't offered.
        expect(dishRow(beef, 'Fisherman Soup').find('input[inputmode="decimal"]').exists()).toBe(
          false,
        );
      });

      it('stops offering a meat on one dish', async () => {
        const fetchMock = okRoutes({
          'PUT /admin/menu-items/i-fisherman/options/o-chicken': () =>
            json({
              itemId: FISHERMAN,
              optionId: 'o-chicken',
              isExcluded: true,
              priceDeltaKobo: null,
            }),
        });
        const wrapper = await mountView();
        await meat(wrapper, 'Chicken').get('[data-test="per-dish-toggle"]').trigger('click');
        await dishRow(meat(wrapper, 'Chicken'), 'Fisherman Soup')
          .get('[data-test="offered"]')
          .setValue(false);
        await flushPromises();
        expect(bodyOf(fetchMock, 'PUT /admin/menu-items/i-fisherman/options/o-chicken')).toEqual({
          isExcluded: true,
        });
        const row = dishRow(meat(wrapper, 'Chicken'), 'Fisherman Soup');
        expect((row.get('[data-test="offered"]').element as HTMLInputElement).checked).toBe(false);
        // Its special price went with it.
        expect(meat(wrapper, 'Chicken').get('[data-test="per-dish-toggle"]').text()).not.toContain(
          'Different price on 1 dish',
        );
        expect(useToastStore().messages.at(-1)?.text).toBe(
          'Fisherman Soup no longer offers Chicken.',
        );
      });

      it('offers a meat on a dish again', async () => {
        const fetchMock = okRoutes({
          'DELETE /admin/menu-items/i-fisherman/options/o-beef': () =>
            new Response(null, { status: 204 }),
        });
        const wrapper = await mountView();
        await meat(wrapper, 'Beef').get('[data-test="per-dish-toggle"]').trigger('click');
        await dishRow(meat(wrapper, 'Beef'), 'Fisherman Soup')
          .get('[data-test="offered"]')
          .setValue(true);
        await flushPromises();
        expect(
          fetchMock.mock.calls.some(
            ([url, init]) =>
              init?.method === 'DELETE' &&
              String(url).endsWith('/menu-items/i-fisherman/options/o-beef'),
          ),
        ).toBe(true);
        const row = dishRow(meat(wrapper, 'Beef'), 'Fisherman Soup');
        expect((row.get('[data-test="offered"]').element as HTMLInputElement).checked).toBe(true);
        expect(useToastStore().messages.at(-1)?.text).toBe('Fisherman Soup offers Beef again.');
      });

      it('puts the tick back when the change fails', async () => {
        okRoutes({
          'PUT /admin/menu-items/i-afang/options/o-chicken': () =>
            failure(503, 'SERVICE_UNAVAILABLE', 'down'),
        });
        const wrapper = await mountView();
        await meat(wrapper, 'Chicken').get('[data-test="per-dish-toggle"]').trigger('click');
        await dishRow(meat(wrapper, 'Chicken'), 'Afang Soup')
          .get('[data-test="offered"]')
          .setValue(false);
        await flushPromises();
        const row = dishRow(meat(wrapper, 'Chicken'), 'Afang Soup');
        expect((row.get('[data-test="offered"]').element as HTMLInputElement).checked).toBe(true);
        expect(row.get('[role="alert"]').text()).toContain('Reference: ref-7');
      });
    });
  });
});
