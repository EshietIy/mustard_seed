import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ROLES_KEY } from '../auth/guards/roles.decorator';
import { MenuAdminController } from './menu-admin.controller';
import type { MenuAdminService } from './menu-admin.service';

const supervisor = { id: 'sup-1', role: 'supervisor' } as AuthenticatedUser;
const item = {
  id: 'i1',
  name: 'Afang Soup',
  category: 'calabar_soups',
  priceKobo: 400000,
  isAvailable: false,
};

function deps() {
  const service = {
    updateItem: jest.fn().mockResolvedValue(item),
  } as unknown as MenuAdminService;
  const log = { info: jest.fn() };
  const req = { id: 'corr-1', log, user: supervisor } as unknown as Request;
  return { controller: new MenuAdminController(service), service, log, req };
}

const rolesOf = (method: keyof MenuAdminController) =>
  new Reflector().getAllAndOverride<string[]>(ROLES_KEY, [
    MenuAdminController.prototype[method],
    MenuAdminController,
  ]);

describe('MenuAdminController', () => {
  it('lets supervisors and super admins switch dishes on and off', () => {
    expect(rolesOf('updateItem')).toEqual(['supervisor', 'super_admin']);
  });

  it('passes only the sent fields to the service and logs the change', async () => {
    const { controller, service, log, req } = deps();
    await expect(controller.updateItem('i1', { isAvailable: false }, req)).resolves.toBe(item);
    expect(service.updateItem).toHaveBeenCalledWith(
      supervisor,
      'i1',
      { isAvailable: false },
      'corr-1',
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'menu_item.updated',
        outcome: 'SUCCESS',
        actorUserId: 'sup-1',
        itemId: 'i1',
        fields: ['isAvailable'],
      }),
      expect.any(String),
    );
  });

  it('refuses a body with nothing to change', async () => {
    const { controller, service, req } = deps();
    await expect(controller.updateItem('i1', {}, req)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.updateItem).not.toHaveBeenCalled();
  });
});
