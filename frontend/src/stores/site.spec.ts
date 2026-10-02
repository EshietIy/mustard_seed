import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSiteStore } from './site';

const site = {
  name: 'Mustard Seed Restaurant & Bar',
  phoneWhatsapp: null,
  hours: {
    opensAt: '08:00',
    closesAt: '23:00',
    onlineOrdersCloseAt: '22:30',
    timezone: 'Africa/Lagos',
  },
  delivery: { feeKobo: 150000, area: 'Calabar' },
  branches: [],
};

describe('site store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('loads site info from /site', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(site));
    vi.stubGlobal('fetch', fetchMock);
    const store = useSiteStore();
    await store.load();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/api/v1/site');
    expect(store.status).toBe('ready');
    expect(store.info?.delivery.feeKobo).toBe(150000);
  });

  it('records an error on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const store = useSiteStore();
    await store.load();
    expect(store.status).toBe('error');
    expect(store.error).not.toBeNull();
  });
});
