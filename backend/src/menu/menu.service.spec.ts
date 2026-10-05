import { MenuService } from './menu.service';
import { InMemoryMenuRepository } from './in-memory-menu.repository';
import type { MenuItemRecord } from './menu.types';

const config = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_STORAGE_BUCKET: 'site-images' };

function item(overrides: Partial<MenuItemRecord>): MenuItemRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'edikang-ikong',
    name: 'Edikang Ikong',
    description: 'Ugu and waterleaf soup.',
    category: 'calabar_classics',
    priceKobo: null,
    isHouseSignature: false,
    isFreshJuice: false,
    isAvailable: true,
    imagePath: null,
    sortOrder: 10,
    optionGroups: [],
    ...overrides,
  };
}

describe('MenuService', () => {
  it('always returns the four categories in display order, even when empty', async () => {
    const service = new MenuService(new InMemoryMenuRepository([]), config);
    const menu = await service.getMenu();
    expect(menu.categories.map((c) => [c.id, c.label, c.items.length])).toEqual([
      ['calabar_classics', 'Calabar classics', 0],
      ['swallow_sides', 'Swallow & sides', 0],
      ['continental', 'Continental', 0],
      ['drinks', 'Drinks', 0],
    ]);
  });

  it('groups items by category, ordered by sort order then name', async () => {
    const repo = new InMemoryMenuRepository([
      item({ id: 'a', slug: 'afang', name: 'Afang Soup', sortOrder: 20 }),
      item({ id: 'z', slug: 'zobo', name: 'Zobo', category: 'drinks', isFreshJuice: true }),
      item({ id: 'e', slug: 'edikang', name: 'Edikang Ikong', sortOrder: 10 }),
      item({ id: 'b', slug: 'atama', name: 'Atama Soup', sortOrder: 20 }),
    ]);
    const menu = await new MenuService(repo, config).getMenu();
    expect(menu.categories[0]?.items.map((i) => i.name)).toEqual([
      'Edikang Ikong',
      'Afang Soup',
      'Atama Soup',
    ]);
    expect(menu.categories[3]?.items.map((i) => i.name)).toEqual(['Zobo']);
  });

  it('maps an item to the public shape, keeping placeholders as null', async () => {
    const repo = new InMemoryMenuRepository([
      item({ isHouseSignature: true, priceKobo: null, imagePath: null }),
    ]);
    const [first] = (await new MenuService(repo, config).getMenu()).categories[0].items;
    expect(first).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'edikang-ikong',
      name: 'Edikang Ikong',
      description: 'Ugu and waterleaf soup.',
      priceKobo: null,
      isHouseSignature: true,
      isFreshJuice: false,
      isAvailable: true,
      image: null,
      optionGroups: [],
    });
  });

  it("includes an item's option groups so the site can show the choice sheet", async () => {
    const protein = {
      id: 'g1',
      name: 'Soup protein',
      minChoices: 1,
      maxChoices: 1,
      options: [
        { id: 'o1', name: 'Chicken', priceDeltaKobo: 0, isAvailable: true },
        { id: 'o2', name: 'Turkey', priceDeltaKobo: 50000, isAvailable: false },
      ],
    };
    const repo = new InMemoryMenuRepository([item({ optionGroups: [protein] })]);
    const [first] = (await new MenuService(repo, config).getMenu()).categories[0].items;
    expect(first.optionGroups).toEqual([protein]);
  });

  it('includes unavailable items, flagged, and builds image URLs from the stored key', async () => {
    const repo = new InMemoryMenuRepository([
      item({ isAvailable: false, priceKobo: 450000, imagePath: 'menu/edikang-ikong/v1' }),
    ]);
    const [first] = (await new MenuService(repo, config).getMenu()).categories[0].items;
    expect(first?.isAvailable).toBe(false);
    expect(first?.priceKobo).toBe(450000);
    expect(first?.image?.thumbnailUrl).toBe(
      'https://abc.supabase.co/storage/v1/object/public/site-images/menu/edikang-ikong/v1/thumb.webp',
    );
  });

  it('propagates repository failures', async () => {
    const repo = new InMemoryMenuRepository([]);
    repo.failWith(new Error('db down'));
    await expect(new MenuService(repo, config).getMenu()).rejects.toThrow('db down');
  });
});
