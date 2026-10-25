import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ROLES_KEY } from '../auth/guards/roles.decorator';
import { MenuAdminController } from './menu-admin.controller';
import type { MenuAdminService } from './menu-admin.service';

const supervisor = { id: 'sup-1', role: 'supervisor' } as AuthenticatedUser;
const admin = { id: 'admin-1', role: 'super_admin' } as AuthenticatedUser;
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
    listItems: jest.fn().mockResolvedValue([item]),
    createItem: jest.fn().mockResolvedValue(item),
    moveItem: jest.fn().mockResolvedValue([item]),
  } as unknown as MenuAdminService;
  const log = { info: jest.fn() };
  const req = { id: 'corr-1', log, user: supervisor } as unknown as Request;
  const adminReq = { id: 'corr-2', log, user: admin } as unknown as Request;
  return { controller: new MenuAdminController(service), service, log, req, adminReq };
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

  it('keeps listing, adding and moving dishes to super admins', () => {
    expect(rolesOf('listItems')).toEqual(['super_admin']);
    expect(rolesOf('createItem')).toEqual(['super_admin']);
    expect(rolesOf('moveItem')).toEqual(['super_admin']);
  });

  it('lists every dish', async () => {
    const { controller } = deps();
    await expect(controller.listItems()).resolves.toEqual([item]);
  });

  it('adds a dish and logs it', async () => {
    const { controller, service, log, adminReq } = deps();
    const body = { name: 'Afang Soup', category: 'calabar_soups' as const };
    await expect(controller.createItem(body, adminReq)).resolves.toBe(item);
    expect(service.createItem).toHaveBeenCalledWith(admin, body, 'corr-2');
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'menu_item.created',
        outcome: 'SUCCESS',
        actorUserId: 'admin-1',
        itemId: 'i1',
      }),
      expect.any(String),
    );
  });

  it.each([
    [true, 'menu_item.archived'],
    [false, 'menu_item.restored'],
  ])('logs isArchived %s as %s', async (isArchived, event) => {
    const { controller, log, adminReq } = deps();
    await controller.updateItem('i1', { isArchived }, adminReq);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event, outcome: 'SUCCESS' }),
      expect.any(String),
    );
  });

  it('moves a dish, returns the list and logs it', async () => {
    const { controller, service, log, adminReq } = deps();
    await expect(controller.moveItem('i1', { direction: 'up' }, adminReq)).resolves.toEqual([item]);
    expect(service.moveItem).toHaveBeenCalledWith(admin, 'i1', 'up', 'corr-2');
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'menu_item.moved', direction: 'up' }),
      expect.any(String),
    );
  });
});
