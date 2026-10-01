import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import App from './App.vue';
import { globalError, resetGlobalError } from './errors/global-error';
import { routes } from './router';

async function mountApp() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ paymentMode: 'live' })));
  const router = createRouter({ history: createMemoryHistory(), routes });
  await router.push('/');
  const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });
  await flushPromises();
  return wrapper;
}

describe('App', () => {
  afterEach(() => resetGlobalError());

  it('renders the home view', async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain('Mustard Seed Restaurant & Bar');
  });

  it('shows the recovery screen when an unhandled error occurs', async () => {
    const wrapper = await mountApp();
    globalError.value = new Error('escaped');
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Something went wrong');
  });

  it('renders the not-found view for unknown routes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ paymentMode: 'live' })));
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push('/nope');
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } });
    await flushPromises();
    expect(wrapper.text()).toContain("We couldn't find that page.");
  });
});
