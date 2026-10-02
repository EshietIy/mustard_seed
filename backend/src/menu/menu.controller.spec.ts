import { MenuController } from './menu.controller';
import type { MenuService } from './menu.service';

describe('MenuController', () => {
  it('returns the menu from the service', async () => {
    const menu = { categories: [] };
    const service = { getMenu: jest.fn().mockResolvedValue(menu) } as unknown as MenuService;
    await expect(new MenuController(service).get()).resolves.toBe(menu);
  });
});
