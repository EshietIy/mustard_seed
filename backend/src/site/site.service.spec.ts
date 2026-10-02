import { SiteService } from './site.service';
import type { SiteRepository } from './site.repository';
import type { BranchRecord, RestaurantInfoRecord } from './site.types';

const info: RestaurantInfoRecord = {
  name: 'Mustard Seed Restaurant & Bar',
  phoneWhatsapp: null,
  opensAt: '08:00:00',
  closesAt: '23:00:00',
  onlineOrdersCloseAt: '22:30:00',
  timezone: 'Africa/Lagos',
  deliveryFeeKobo: 150000,
  deliveryArea: 'Calabar',
};

const branches: BranchRecord[] = [
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
];

function repo(overrides: Partial<SiteRepository> = {}): SiteRepository {
  return {
    getRestaurantInfo: jest.fn().mockResolvedValue(info),
    listBranches: jest.fn().mockResolvedValue(branches),
    ...overrides,
  };
}

describe('SiteService', () => {
  it('returns restaurant info, hours as HH:MM, delivery and branches', async () => {
    await expect(new SiteService(repo()).getSiteInfo()).resolves.toEqual({
      name: 'Mustard Seed Restaurant & Bar',
      phoneWhatsapp: null,
      hours: {
        opensAt: '08:00',
        closesAt: '23:00',
        onlineOrdersCloseAt: '22:30',
        timezone: 'Africa/Lagos',
      },
      delivery: { feeKobo: 150000, area: 'Calabar' },
      branches,
    });
  });

  it('fails loudly when the settings row is missing', async () => {
    const r = repo({ getRestaurantInfo: jest.fn().mockResolvedValue(null) });
    await expect(new SiteService(r).getSiteInfo()).rejects.toThrow(/restaurant_info/);
  });
});
