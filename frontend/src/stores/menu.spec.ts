import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Menu } from '@/api/types';
import { useMenuStore } from './menu';

const menu: Menu = {
  categories: [
    {
      id: 'calabar_classics',
      label: 'Calabar classics',
      items: [
        {
          id: '1',
          slug: 'edikang-ikong',
          name: 'Edikang Ikong',
          description: '',
          priceKobo: null,
          isHouseSignature: true,
          isFreshJuice: false,
          isAvailable: true,
          image: null,
          optionGroups: [],
        },
      ],
    },
    {
      id: 'drinks',
      label: 'Drinks',
      items: [
        {
          id: '2',
          slug: 'zobo',
          name: 'Zobo',
          description: '',
          priceKobo: null,
          isHouseSignature: false,
          isFreshJuice: true,
          isAvailable: true,
          image: null,
          optionGroups: [],
        },
      ],
    },
  ],
};

describe('menu store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('loads the menu and exposes items and fresh juices', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(menu));
    vi.stubGlobal('fetch', fetchMock);
    const store = useMenuStore();
    await store.load();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/api/v1/menu');
    expect(store.status).toBe('ready');
    expect(store.categories).toHaveLength(2);
    expect(store.allItems.map((i) => i.name)).toEqual(['Edikang Ikong', 'Zobo']);
    expect(store.freshJuices.map((i) => i.name)).toEqual(['Zobo']);
  });

  it('records a normalised error when loading fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'SERVICE_UNAVAILABLE', requestId: 'r-9' } },
            { status: 503 },
          ),
        ),
    );
    const store = useMenuStore();
    await store.load();
    expect(store.status).toBe('error');
    expect(store.error?.kind).toBe('server');
    expect(store.error?.requestId).toBe('r-9');
  });
});
