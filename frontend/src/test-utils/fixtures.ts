import type { Menu, MenuItem, SiteInfo } from '@/api/types';

export function menuItem(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'i-edikang',
    slug: 'edikang-ikong',
    name: 'Edikang Ikong',
    description:
      'Ugu and waterleaf soup, rich with periwinkle, kpomo, stockfish and assorted meat.',
    priceKobo: null,
    isHouseSignature: true,
    isFreshJuice: false,
    isAvailable: true,
    image: null,
    optionGroups: [],
    ...overrides,
  };
}

export function sampleMenu(): Menu {
  return {
    categories: [
      {
        id: 'calabar_classics',
        label: 'Calabar classics',
        items: [
          menuItem(),
          menuItem({
            id: 'i-afang',
            slug: 'afang-soup',
            name: 'Afang Soup',
            description: 'Hand-shredded afang leaves and waterleaf.',
            isHouseSignature: false,
          }),
        ],
      },
      { id: 'swallow_sides', label: 'Swallow & sides', items: [] },
      { id: 'continental', label: 'Continental', items: [] },
      {
        id: 'drinks',
        label: 'Drinks',
        items: [
          menuItem({
            id: 'i-zobo',
            slug: 'zobo',
            name: 'Zobo',
            description: '',
            isHouseSignature: false,
            isFreshJuice: true,
          }),
          menuItem({
            id: 'i-pine',
            slug: 'pineapple-ginger',
            name: 'Pineapple & ginger',
            description: '',
            isHouseSignature: false,
            isFreshJuice: true,
          }),
          menuItem({
            id: 'i-water',
            slug: 'watermelon',
            name: 'Watermelon',
            description: '',
            isHouseSignature: false,
            isFreshJuice: true,
          }),
        ],
      },
    ],
  };
}

export function sampleSite(overrides: Partial<SiteInfo> = {}): SiteInfo {
  return {
    name: 'Mustard Seed Restaurant & Bar',
    phoneWhatsapp: null,
    hours: {
      opensAt: '08:00',
      closesAt: '23:00',
      onlineOrdersCloseAt: '22:30',
      timezone: 'Africa/Lagos',
    },
    delivery: { feeKobo: 150000, area: 'Calabar' },
    branches: [
      {
        id: 'calabar',
        city: 'Calabar',
        state: 'Cross River State',
        role: 'headquarters',
        streetAddress: null,
        onlineOrderingEnabled: true,
      },
      {
        id: 'uyo',
        city: 'Uyo',
        state: 'Akwa Ibom State',
        role: 'branch',
        streetAddress: '97 Tunde Ukpehe (Mitama), Uyo',
        onlineOrderingEnabled: false,
      },
    ],
    ...overrides,
  };
}
