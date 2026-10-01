import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfigStore } from './config';

describe('config store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('loads the payment mode from the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ paymentMode: 'simulated' })));
    const store = useConfigStore();
    expect(store.status).toBe('idle');
    await store.load();
    expect(store.status).toBe('ready');
    expect(store.paymentMode).toBe('simulated');
    expect(store.isTestMode).toBe(true);
  });

  it('is not in test mode when payments are live', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ paymentMode: 'live' })));
    const store = useConfigStore();
    await store.load();
    expect(store.isTestMode).toBe(false);
  });

  it('records the error when the config cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    const store = useConfigStore();
    await store.load();
    expect(store.status).toBe('error');
    expect(store.error?.kind).toBe('server');
    expect(store.isTestMode).toBe(false);
  });
});
