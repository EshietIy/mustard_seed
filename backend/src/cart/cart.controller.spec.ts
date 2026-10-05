import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CartController } from './cart.controller';
import type { CartService } from './cart.service';

const user = { id: 'u-1', role: 'customer' } as AuthenticatedUser;
const cart = { lines: [], itemCount: 0, subtotalKobo: 0, canCheckout: false };

function deps() {
  const service = {
    view: jest.fn().mockResolvedValue(cart),
    setLine: jest.fn().mockResolvedValue(cart),
    deleteLine: jest.fn().mockResolvedValue(cart),
    clear: jest.fn().mockResolvedValue(cart),
    merge: jest.fn().mockResolvedValue({ cart, skipped: 1 }),
  } as unknown as CartService;
  const log = { info: jest.fn() };
  const req = { id: 'corr-1', log, user } as unknown as Request;
  return { controller: new CartController(service), service, log, req };
}

describe('CartController', () => {
  it("always works on the signed-in user's own cart", async () => {
    const { controller, service, req } = deps();
    await controller.get(req);
    await controller.setLine({ menuItemId: 'm', quantity: 2 }, req);
    await controller.deleteLine('l-1', req);
    await controller.clear(req);
    expect(service.view).toHaveBeenCalledWith('u-1');
    expect(service.setLine).toHaveBeenCalledWith('u-1', { menuItemId: 'm', quantity: 2 });
    expect(service.deleteLine).toHaveBeenCalledWith('u-1', 'l-1');
    expect(service.clear).toHaveBeenCalledWith('u-1');
  });

  it('merges a guest cart and logs how many lines were skipped', async () => {
    const { controller, service, log, req } = deps();
    await expect(
      controller.merge({ lines: [{ menuItemId: 'm', quantity: 1 }] }, req),
    ).resolves.toEqual({ cart, skipped: 1 });
    expect(service.merge).toHaveBeenCalledWith('u-1', [{ menuItemId: 'm', quantity: 1 }]);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'cart.merged', userId: 'u-1', lineCount: 1, skipped: 1 }),
      expect.any(String),
    );
  });
});
