import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ImageUploadResult, Menu, StorageUsage } from '@/api/types';
import { useToastStore } from '@/stores/toast';
import { routeFetch } from '@/test-utils/fetch';
import { menuItem } from '@/test-utils/fixtures';
import AdminPhotosView from './AdminPhotosView.vue';

enableAutoUnmount(afterEach);

const AFANG_IMAGE = {
  thumbnailUrl: 'https://img.test/afang/thumb.webp',
  fullUrl: 'https://img.test/afang/full.webp',
};

function menu(): Menu {
  return {
    categories: [
      {
        id: 'calabar_soups',
        label: 'Calabar soups',
        items: [
          menuItem({ id: 'i-afang', name: 'Afang Soup', image: AFANG_IMAGE }),
          menuItem({ id: 'i-atama', name: 'Atama Soup', image: null }),
        ],
      },
      { id: 'swallow', label: 'Swallow', items: [] },
    ],
  };
}

const usage = (percent: number, usedBytes = 12_900_000): StorageUsage => ({
  usedBytes,
  allowanceBytes: 1_073_741_824,
  percent,
  nearLimit: percent >= 70,
});

const json = (body: unknown, status = 200) => Response.json(body, { status });
const failure = (status: number, code: string, message: string) =>
  json({ error: { code, message, requestId: 'ref-9' } }, status);

const uploaded = (storage: StorageUsage | null = usage(1.3)): ImageUploadResult => ({
  itemId: 'i-atama',
  image: {
    thumbnailUrl: 'https://img.test/atama/v2/thumb.webp',
    fullUrl: 'https://img.test/atama/v2/full.webp',
  },
  sizes: { originalBytes: 2_000_000, thumbBytes: 40_000, fullBytes: 150_000 },
  oldFilesRemoved: true,
  storage,
});

async function mountView() {
  const wrapper = mount(AdminPhotosView);
  await flushPromises();
  return wrapper;
}

function dish(wrapper: VueWrapper, name: string) {
  const row = wrapper.findAll('[data-test="dish"]').find((r) => r.text().includes(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

async function choose(row: ReturnType<typeof dish>, file: File) {
  const input = row.get('input[type="file"]');
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await flushPromises();
}

const jpeg = () => new File(['jpeg bytes'], 'atama.jpg', { type: 'image/jpeg' });

describe('AdminPhotosView', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows a loading state first', () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1)),
    });
    expect(mount(AdminPhotosView).get('[aria-busy="true"]').text()).toContain('Loading');
  });

  it('lists each dish with its photo or the placeholder', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1.2)),
    });
    const wrapper = await mountView();
    expect(wrapper.findAll('h2').map((h) => h.text())).toEqual(['Calabar soups']);
    const afang = dish(wrapper, 'Afang Soup');
    expect(afang.get('img').attributes()).toMatchObject({
      src: AFANG_IMAGE.thumbnailUrl,
      alt: 'Afang Soup',
    });
    expect(afang.text()).toContain('Replace photo');
    expect(afang.find('[data-test="remove-photo"]').exists()).toBe(true);
    const atama = dish(wrapper, 'Atama Soup');
    expect(atama.find('img').exists()).toBe(false);
    expect(atama.text()).toContain('Photo coming');
    expect(atama.text()).toContain('Upload photo');
    expect(atama.find('[data-test="remove-photo"]').exists()).toBe(false);
    expect(atama.get('input[type="file"]').attributes()).toMatchObject({
      accept: 'image/jpeg,image/png,image/webp',
      'aria-label': 'Upload a photo of Atama Soup',
    });
  });

  it('shows the storage used', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1.2)),
    });
    const wrapper = await mountView();
    const meter = wrapper.get('[data-test="storage"]');
    expect(meter.text()).toContain('12.3 MB of 1 GB used (1.2%)');
    expect(meter.find('[role="alert"]').exists()).toBe(false);
    expect(meter.get('[role="progressbar"]').attributes('aria-valuenow')).toBe('1.2');
  });

  it('warns when storage is past 70%', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(72.5, 778_454_630)),
    });
    const wrapper = await mountView();
    expect(wrapper.get('[data-test="storage"] [role="alert"]').text()).toContain(
      'Photo storage is 72.5% full',
    );
  });

  it('still lists the dishes when the storage total cannot be read', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
    });
    const wrapper = await mountView();
    expect(wrapper.get('[data-test="storage"]').text()).toContain(
      'We couldn’t read how much storage is used.',
    );
    expect(wrapper.findAll('[data-test="dish"]')).toHaveLength(2);
  });

  it('uploads the chosen file as a form, then shows the new photo and storage', async () => {
    const fetchMock = routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1.2)),
      'POST /admin/menu-items/i-atama/image': () => json(uploaded(), 201),
    });
    const wrapper = await mountView();
    const file = jpeg();
    await choose(dish(wrapper, 'Atama Soup'), file);
    const call = fetchMock.mock.calls.find(([url]) =>
      url.endsWith('/admin/menu-items/i-atama/image'),
    );
    const form = call?.[1]?.body as FormData;
    expect(form.get('image')).toBe(file);
    const row = dish(wrapper, 'Atama Soup');
    expect(row.get('img').attributes('src')).toBe('https://img.test/atama/v2/thumb.webp');
    expect(row.text()).toContain('Replace photo');
    expect(wrapper.get('[data-test="storage"]').text()).toContain('(1.3%)');
    expect(useToastStore().messages.at(-1)?.text).toBe('Photo of Atama Soup saved.');
  });

  it('shows the dish as uploading while the photo is sent', async () => {
    let finish: (r: Response) => void = () => undefined;
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1.2)),
      'POST /admin/menu-items/i-atama/image': () =>
        new Promise<Response>((r) => (finish = r)) as unknown as Response,
    });
    const wrapper = await mountView();
    await choose(dish(wrapper, 'Atama Soup'), jpeg());
    const row = dish(wrapper, 'Atama Soup');
    expect(row.text()).toContain('Uploading…');
    expect(row.get('input[type="file"]').attributes('disabled')).toBeDefined();
    finish(json(uploaded(), 201));
    await flushPromises();
    expect(dish(wrapper, 'Atama Soup').text()).not.toContain('Uploading…');
  });

  it.each([
    [415, 'UNSUPPORTED_IMAGE_TYPE', 'Photos must be JPEG, PNG or WebP.'],
    [413, 'PAYLOAD_TOO_LARGE', 'That upload is too large.'],
    [422, 'IMAGE_UNREADABLE', 'We couldn’t read that photo. It may be damaged; try another one.'],
  ])('keeps the existing photo and explains a %i refusal', async (status, code, message) => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1.2)),
      'POST /admin/menu-items/i-afang/image': () => failure(status, code, message),
    });
    const wrapper = await mountView();
    await choose(dish(wrapper, 'Afang Soup'), jpeg());
    const row = dish(wrapper, 'Afang Soup');
    expect(row.get('[role="alert"]').text()).toContain(message);
    expect(row.get('[role="alert"]').text()).toContain('Reference: ref-9');
    expect(row.get('img').attributes('src')).toBe(AFANG_IMAGE.thumbnailUrl);
  });

  it('explains a too-large photo before sending it', async () => {
    const fetchMock = routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1)),
    });
    const wrapper = await mountView();
    const huge = new File([new Uint8Array(21 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    await choose(dish(wrapper, 'Atama Soup'), huge);
    expect(dish(wrapper, 'Atama Soup').get('[role="alert"]').text()).toContain(
      'That photo is 21 MB. Choose one under 20 MB',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses a file that is not a picture before sending it', async () => {
    const fetchMock = routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1)),
    });
    const wrapper = await mountView();
    await choose(
      dish(wrapper, 'Atama Soup'),
      new File(['%PDF'], 'menu.pdf', { type: 'application/pdf' }),
    );
    expect(dish(wrapper, 'Atama Soup').get('[role="alert"]').text()).toContain(
      'Photos must be JPEG, PNG or WebP.',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('removes a photo after asking', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1.2)),
      'DELETE /admin/menu-items/i-afang/image': () => new Response(null, { status: 204 }),
    });
    const wrapper = await mountView();
    await dish(wrapper, 'Afang Soup').get('[data-test="remove-photo"]').trigger('click');
    const confirm = dish(wrapper, 'Afang Soup').get('[data-test="remove-confirm"]');
    expect(confirm.text()).toContain(
      'Customers will see “Photo coming” until a new one is uploaded.',
    );
    await confirm.get('[data-test="remove-yes"]').trigger('click');
    await flushPromises();
    const row = dish(wrapper, 'Afang Soup');
    expect(row.find('img').exists()).toBe(false);
    expect(row.text()).toContain('Photo coming');
    expect(useToastStore().messages.at(-1)?.text).toBe('Photo of Afang Soup removed.');
  });

  it('keeps the photo when removing is cancelled or fails', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1.2)),
      'DELETE /admin/menu-items/i-afang/image': () => failure(503, 'SERVICE_UNAVAILABLE', 'down'),
    });
    const wrapper = await mountView();
    await dish(wrapper, 'Afang Soup').get('[data-test="remove-photo"]').trigger('click');
    await dish(wrapper, 'Afang Soup').get('[data-test="remove-no"]').trigger('click');
    expect(dish(wrapper, 'Afang Soup').find('[data-test="remove-confirm"]').exists()).toBe(false);
    await dish(wrapper, 'Afang Soup').get('[data-test="remove-photo"]').trigger('click');
    await dish(wrapper, 'Afang Soup').get('[data-test="remove-yes"]').trigger('click');
    await flushPromises();
    const row = dish(wrapper, 'Afang Soup');
    expect(row.get('img').attributes('src')).toBe(AFANG_IMAGE.thumbnailUrl);
    expect(row.get('[role="alert"]').text()).toContain('Reference: ref-9');
  });

  it('falls back to the placeholder when a photo will not load', async () => {
    routeFetch({
      'GET /menu': () => json(menu()),
      'GET /admin/storage-usage': () => json(usage(1)),
    });
    const wrapper = await mountView();
    await dish(wrapper, 'Afang Soup').get('img').trigger('error');
    expect(dish(wrapper, 'Afang Soup').find('img').exists()).toBe(false);
    expect(dish(wrapper, 'Afang Soup').text()).toContain('Photo coming');
  });

  it('shows an error with a retry when the menu cannot load', async () => {
    let calls = 0;
    routeFetch({
      'GET /menu': () =>
        ++calls === 1 ? failure(503, 'SERVICE_UNAVAILABLE', 'down') : json(menu()),
      'GET /admin/storage-usage': () => json(usage(1)),
    });
    const wrapper = await mountView();
    expect(wrapper.get('[role="alert"]').text()).toContain('We couldn’t load the menu.');
    await wrapper.get('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-test="dish"]')).toHaveLength(2);
  });

  it('says so when the menu is empty', async () => {
    routeFetch({
      'GET /menu': () => json({ categories: [] }),
      'GET /admin/storage-usage': () => json(usage(0)),
    });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain('No dishes on the menu yet.');
  });
});
