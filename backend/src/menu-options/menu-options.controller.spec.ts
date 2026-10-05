import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ROLES_KEY } from '../auth/guards/roles.decorator';
import { MenuOptionsController } from './menu-options.controller';
import type { MenuOptionsService } from './menu-options.service';

const admin = { id: 'admin-1', role: 'super_admin' } as AuthenticatedUser;
const group = { id: 'g1', name: 'Soup protein', options: [{ id: 'o1' }] };

function deps() {
  const service = {
    list: jest.fn().mockResolvedValue([group]),
    createGroup: jest.fn().mockResolvedValue(group),
    updateGroup: jest.fn().mockResolvedValue(group),
    createOption: jest.fn().mockResolvedValue(group),
    updateOption: jest.fn().mockResolvedValue(group),
    setItemGroups: jest.fn().mockResolvedValue({ itemId: 'i1', groupIds: ['g1'] }),
    setOverride: jest.fn().mockResolvedValue({ itemId: 'i1', optionId: 'o1' }),
    deleteOverride: jest.fn().mockResolvedValue(undefined),
  } as unknown as MenuOptionsService;
  const log = { info: jest.fn() };
  const req = { id: 'corr-1', log, user: admin } as unknown as Request;
  return { controller: new MenuOptionsController(service), service, log, req };
}

const rolesOf = (method: keyof MenuOptionsController) =>
  new Reflector().getAllAndOverride<string[]>(ROLES_KEY, [
    MenuOptionsController.prototype[method],
    MenuOptionsController,
  ]);

describe('MenuOptionsController', () => {
  it('lets staff read and switch options, and keeps everything else for super admins', () => {
    expect(rolesOf('list')).toEqual(['supervisor', 'super_admin']);
    expect(rolesOf('updateOption')).toEqual(['supervisor', 'super_admin']);
    for (const method of [
      'createGroup',
      'updateGroup',
      'createOption',
      'setItemGroups',
      'setOverride',
      'deleteOverride',
    ] as const) {
      expect(rolesOf(method)).toEqual(['super_admin']);
    }
  });

  it('passes the actor and request id to the service and logs the change', async () => {
    const { controller, service, log, req } = deps();
    await controller.createOption('g1', { name: 'Beef' }, req);
    expect(service.createOption).toHaveBeenCalledWith(admin, 'g1', { name: 'Beef' }, 'corr-1');
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'option.created',
        outcome: 'SUCCESS',
        actorUserId: 'admin-1',
        groupId: 'g1',
      }),
      expect.any(String),
    );
  });

  it('refuses an update with nothing to change (400)', async () => {
    const { controller, req } = deps();
    await expect(controller.updateOption('o1', {}, req)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.updateGroup('g1', {}, req)).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.setOverride('i1', 'o1', {}, req)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('ignores fields the client did not send (validated DTOs carry them as undefined)', async () => {
    const { controller, service, req } = deps();
    await controller.updateOption('o1', { isAvailable: false, name: undefined }, req);
    expect(service.updateOption).toHaveBeenCalledWith(
      admin,
      'o1',
      { isAvailable: false },
      'corr-1',
    );
    await expect(
      controller.updateOption('o1', { name: undefined, archived: undefined }, req),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('wires every route to the service', async () => {
    const { controller, service, req } = deps();
    await controller.list();
    await controller.createGroup({ name: 'X', minChoices: 0, maxChoices: 1 }, req);
    await controller.updateGroup('g1', { archived: true }, req);
    await controller.updateOption('o1', { isAvailable: false }, req);
    await controller.setItemGroups('i1', { groupIds: ['g1'] }, req);
    await controller.setOverride('i1', 'o1', { isExcluded: true }, req);
    await controller.deleteOverride('i1', 'o1', req);
    expect(service.list).toHaveBeenCalled();
    expect(service.updateGroup).toHaveBeenCalledWith(admin, 'g1', { archived: true }, 'corr-1');
    expect(service.updateOption).toHaveBeenCalledWith(
      admin,
      'o1',
      { isAvailable: false },
      'corr-1',
    );
    expect(service.setItemGroups).toHaveBeenCalledWith(admin, 'i1', ['g1'], 'corr-1');
    expect(service.setOverride).toHaveBeenCalledWith(
      admin,
      'i1',
      'o1',
      { isExcluded: true },
      'corr-1',
    );
    expect(service.deleteOverride).toHaveBeenCalledWith(admin, 'i1', 'o1', 'corr-1');
  });
});
