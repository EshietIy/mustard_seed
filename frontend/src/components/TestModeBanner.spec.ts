import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestModeBanner from './TestModeBanner.vue';

function mountWith(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  return mount(TestModeBanner);
}

describe('TestModeBanner', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('shows the banner when payments are simulated', async () => {
    const wrapper = mountWith(Response.json({ paymentMode: 'simulated' }));
    await flushPromises();
    const banner = wrapper.get('[role="status"]');
    expect(banner.text()).toContain('TEST MODE: payments are simulated');
  });

  it('hides the banner when payments are live', async () => {
    const wrapper = mountWith(Response.json({ paymentMode: 'live' }));
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('hides the banner when the config request fails', async () => {
    const wrapper = mountWith(new Response('', { status: 500 }));
    await flushPromises();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });
});
