import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Menu } from '@/api/types';
import { ALL_CATEGORIES, useMenuStore } from './menu';

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
      id: 'fresh_juices',
      label: 'Fresh juices',
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

  it('loads the menu and exposes all items and the house signatures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(menu));
    vi.stubGlobal('fetch', fetchMock);
    const store = useMenuStore();
    await store.load();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://api.test/api/v1/menu');
    expect(store.status).toBe('ready');
    expect(store.categories).toHaveLength(2);
    expect(store.allItems.map((i) => i.name)).toEqual(['Edikang Ikong', 'Zobo']);
    expect(store.houseSignatures.map((i) => i.name)).toEqual(['Edikang Ikong']);
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

  describe('filtering', () => {
    const item = (id: string, name: string, description = '', extra = {}) => ({
      id,
      slug: id,
      name,
      description,
      priceKobo: null,
      isHouseSignature: false,
      isFreshJuice: false,
      isAvailable: true,
      image: null,
      optionGroups: [],
      ...extra,
    });

    async function loaded() {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          Response.json({
            categories: [
              {
                id: 'calabar_soups',
                label: 'Calabar soups',
                items: [
                  item('afang', 'Afang Soup', 'Hand-shredded afang leaves.'),
                  item('fisherman', 'Fisherman Soup', 'The day’s catch.'),
                  item('atama', 'Atama Soup', 'With fresh and smoked fish.'),
                ],
              },
              { id: 'swallow', label: 'Swallow', items: [item('pounded', 'Pounded Yam')] },
              {
                id: 'fresh_juices',
                label: 'Fresh juices',
                items: [item('zobo', 'Zobo', '', { isFreshJuice: true })],
              },
            ],
          }),
        ),
      );
      const store = useMenuStore();
      await store.load();
      return store;
    }

    const names = (store: ReturnType<typeof useMenuStore>) => store.visibleItems.map((i) => i.name);

    it('starts on "All" with every item visible', async () => {
      const store = await loaded();
      expect(store.activeCategory).toBe(ALL_CATEGORIES);
      expect(names(store)).toEqual([
        'Afang Soup',
        'Fisherman Soup',
        'Atama Soup',
        'Pounded Yam',
        'Zobo',
      ]);
    });

    it('shows one category when it is selected', async () => {
      const store = await loaded();
      store.selectCategory('swallow');
      expect(names(store)).toEqual(['Pounded Yam']);
    });

    it('falls back to "All" when the selected category is not on the menu', async () => {
      const store = await loaded();
      store.selectCategory('drinks');
      expect(store.activeCategory).toBe(ALL_CATEGORIES);
      expect(names(store)).toHaveLength(5);
    });

    it('searches names and descriptions, ignoring case and accents', async () => {
      const store = await loaded();
      store.search('FISH');
      expect(names(store)).toEqual(['Fisherman Soup', 'Atama Soup']);
      store.search('days catch');
      expect(names(store)).toEqual([]);
      store.search('day’s CATCH');
      expect(names(store)).toEqual(['Fisherman Soup']);
      store.search('pounded yàm');
      expect(names(store)).toEqual(['Pounded Yam']);
    });

    it('matches every word of a search, in any order', async () => {
      const store = await loaded();
      store.search('soup smoked');
      expect(names(store)).toEqual(['Atama Soup']);
    });

    it('finds items by their category and fresh juices by "fresh juice"', async () => {
      const store = await loaded();
      store.search('Fresh juice');
      expect(names(store)).toEqual(['Zobo']);
      store.search('swallow');
      expect(names(store)).toEqual(['Pounded Yam']);
    });

    it('a new search shows all categories, so matches are not hidden by a tab', async () => {
      const store = await loaded();
      store.selectCategory('swallow');
      store.search('afang');
      expect(store.activeCategory).toBe(ALL_CATEGORIES);
      expect(names(store)).toEqual(['Afang Soup']);
    });

    it('a blank search clears the filter', async () => {
      const store = await loaded();
      store.search('afang');
      store.search('   ');
      expect(store.query).toBe('');
      expect(names(store)).toHaveLength(5);
    });
  });
});
