import { SiteController } from './site.controller';
import type { SiteService } from './site.service';

describe('SiteController', () => {
  it('returns site info from the service', async () => {
    const info = { name: 'x' };
    const service = { getSiteInfo: jest.fn().mockResolvedValue(info) } as unknown as SiteService;
    await expect(new SiteController(service).get()).resolves.toBe(info);
  });
});
