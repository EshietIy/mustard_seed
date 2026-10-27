import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RestaurantSettings } from '@/api/types';
import { useToastStore } from '@/stores/toast';
import { bodyOf, routeFetch } from '@/test-utils/fetch';
import AdminSettingsView from './AdminSettingsView.vue';

enableAutoUnmount(afterEach);

const SETTINGS: RestaurantSettings = {
  deliveryFeeKobo: 150000,
  deliveryArea: 'Calabar',
  opensAt: '08:00',
  closesAt: '23:00',
  onlineOrdersCloseAt: '22:30',
  timezone: 'Africa/Lagos',
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const failure = (status: number, code: string, message: string, extra = {}) =>
  json({ error: { code, message, requestId: 'ref-9', ...extra } }, status);
const echo = (init: RequestInit | undefined) =>
  json({ ...SETTINGS, ...(JSON.parse(String(init?.body)) as object) });

async function mountView() {
  const wrapper = mount(AdminSettingsView);
  await flushPromises();
  return wrapper;
}

async function setTime(wrapper: VueWrapper, key: string, value: string) {
  await wrapper.get(`[data-test="${key}"]`).setValue(value);
}

const lastToast = () => useToastStore().messages.at(-1)?.text;

describe('AdminSettingsView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows a loading state first', () => {
    routeFetch({ 'GET /admin/settings': () => json(SETTINGS) });
    expect(mount(AdminSettingsView).get('[aria-busy="true"]').text()).toContain('Loading');
  });

  it('shows the current fee and hours, ready to edit', async () => {
    routeFetch({ 'GET /admin/settings': () => json(SETTINGS) });
    const wrapper = await mountView();
    expect(wrapper.get('[data-test="current-fee"]').text()).toBe('Now: ₦1,500');
    expect(wrapper.text()).toContain('anywhere in Calabar');
    expect((wrapper.get('[data-test="fee"]').element as HTMLInputElement).value).toBe('1500');
    expect(wrapper.get('[data-test="current-hours"]').text()).toBe(
      'Now: open 8am – 11pm, online orders until 10:30pm',
    );
    expect((wrapper.get('[data-test="opensAt"]').element as HTMLInputElement).value).toBe('08:00');
    expect(
      (wrapper.get('[data-test="onlineOrdersCloseAt"]').element as HTMLInputElement).value,
    ).toBe('22:30');
  });

  it('offers a retry when the settings cannot load', async () => {
    let calls = 0;
    routeFetch({
      'GET /admin/settings': () =>
        ++calls === 1 ? failure(503, 'SERVICE_UNAVAILABLE', 'Try again.') : json(SETTINGS),
    });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('We couldn’t load the settings.');
    expect(wrapper.text()).toContain('ref-9');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-test="current-fee"]').text()).toBe('Now: ₦1,500');
  });

  describe('delivery fee', () => {
    it('saves the fee in kobo and confirms it', async () => {
      const fetchMock = routeFetch({
        'GET /admin/settings': () => json(SETTINGS),
        'PATCH /admin/settings': echo,
      });
      const wrapper = await mountView();
      await wrapper.get('[data-test="fee"]').setValue('₦2,000.50');
      await wrapper.get('[data-test="fee-form"]').trigger('submit');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/settings')).toEqual({ deliveryFeeKobo: 200050 });
      expect(wrapper.get('[data-test="current-fee"]').text()).toBe('Now: ₦2,000.50');
      expect(lastToast()).toBe('Delivery now costs ₦2,000.50 from the next order.');
    });

    it('allows free delivery', async () => {
      routeFetch({ 'GET /admin/settings': () => json(SETTINGS), 'PATCH /admin/settings': echo });
      const wrapper = await mountView();
      await wrapper.get('[data-test="fee"]').setValue('0');
      await wrapper.get('[data-test="fee-form"]').trigger('submit');
      await flushPromises();
      expect(wrapper.get('[data-test="current-fee"]').text()).toBe('Now: Free');
      expect(lastToast()).toBe('Delivery is free from the next order.');
    });

    it.each([
      ['', 'Enter a price in naira (0 for free delivery).'],
      ['abc', 'Enter the price as a number, for example 1500.'],
      ['1500.555', 'Use at most 2 digits after the point.'],
      ['2000000', 'The price can be at most ₦1,000,000.'],
    ])('explains a fee it cannot use (%s) without sending it', async (text, message) => {
      const fetchMock = routeFetch({ 'GET /admin/settings': () => json(SETTINGS) });
      const wrapper = await mountView();
      await wrapper.get('[data-test="fee"]').setValue(text);
      await wrapper.get('[data-test="fee-form"]').trigger('submit');
      expect(wrapper.get('[data-test="fee-form"] [role="alert"]').text()).toBe(message);
      expect(wrapper.get('[data-test="fee"]').attributes('aria-invalid')).toBe('true');
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    });

    it('keeps the old fee and explains when saving fails', async () => {
      routeFetch({
        'GET /admin/settings': () => json(SETTINGS),
        'PATCH /admin/settings': () =>
          failure(500, 'INTERNAL_ERROR', 'Something went wrong on our side.'),
      });
      const wrapper = await mountView();
      await wrapper.get('[data-test="fee"]').setValue('3000');
      await wrapper.get('[data-test="fee-form"]').trigger('submit');
      await flushPromises();
      expect(wrapper.get('[data-test="current-fee"]').text()).toBe('Now: ₦1,500');
      const alert = wrapper.get('[data-test="fee-form"] [role="alert"]').text();
      expect(alert).toContain('Something went wrong');
      expect(alert).toContain('ref-9');
    });

    it('shows the field message from a server validation error', async () => {
      routeFetch({
        'GET /admin/settings': () => json(SETTINGS),
        'PATCH /admin/settings': () =>
          failure(400, 'VALIDATION_FAILED', 'Check the highlighted fields.', {
            details: [
              { field: 'deliveryFeeKobo', messages: ['deliveryFeeKobo must not be less than 0'] },
            ],
          }),
      });
      const wrapper = await mountView();
      await wrapper.get('[data-test="fee"]').setValue('10');
      await wrapper.get('[data-test="fee-form"]').trigger('submit');
      await flushPromises();
      expect(wrapper.get('[data-test="fee-form"] [role="alert"]').text()).toContain(
        'deliveryFeeKobo must not be less than 0',
      );
    });
  });

  describe('opening hours', () => {
    it('saves all three times and confirms them in words', async () => {
      const fetchMock = routeFetch({
        'GET /admin/settings': () => json(SETTINGS),
        'PATCH /admin/settings': echo,
      });
      const wrapper = await mountView();
      await setTime(wrapper, 'opensAt', '09:00');
      await setTime(wrapper, 'onlineOrdersCloseAt', '21:30');
      await setTime(wrapper, 'closesAt', '22:00');
      await wrapper.get('[data-test="hours-form"]').trigger('submit');
      await flushPromises();
      expect(bodyOf(fetchMock, 'PATCH /admin/settings')).toEqual({
        opensAt: '09:00',
        onlineOrdersCloseAt: '21:30',
        closesAt: '22:00',
      });
      expect(wrapper.get('[data-test="current-hours"]').text()).toBe(
        'Now: open 9am – 10pm, online orders until 9:30pm',
      );
      expect(lastToast()).toBe('Open 9am – 10pm, online orders until 9:30pm.');
    });

    it.each([
      ['onlineOrdersCloseAt', '07:30', 'The online order cut-off must be after opening time.'],
      ['opensAt', '22:30', 'The online order cut-off must be after opening time.'],
      ['closesAt', '22:00', 'The online order cut-off can’t be after closing time.'],
      ['closesAt', '', 'Enter the time for “Closes”.'],
    ])(
      'explains hours with no time to order (%s %s) without sending',
      async (key, value, message) => {
        const fetchMock = routeFetch({ 'GET /admin/settings': () => json(SETTINGS) });
        const wrapper = await mountView();
        await setTime(wrapper, key, value);
        await wrapper.get('[data-test="hours-form"]').trigger('submit');
        expect(wrapper.get('[data-test="hours-form"] [role="alert"]').text()).toBe(message);
        expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
      },
    );

    it('shows the server’s reason when it refuses the hours', async () => {
      routeFetch({
        'GET /admin/settings': () => json(SETTINGS),
        'PATCH /admin/settings': () =>
          failure(400, 'INVALID_HOURS', 'The online order cut-off can’t be after closing time.'),
      });
      const wrapper = await mountView();
      await setTime(wrapper, 'opensAt', '09:00');
      await wrapper.get('[data-test="hours-form"]').trigger('submit');
      await flushPromises();
      expect(wrapper.get('[data-test="hours-form"] [role="alert"]').text()).toContain(
        'The online order cut-off can’t be after closing time.',
      );
      expect(wrapper.get('[data-test="current-hours"]').text()).toContain('open 8am');
    });
  });
});
