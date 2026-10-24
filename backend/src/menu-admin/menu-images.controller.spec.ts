import { NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ROLES_KEY } from '../auth/guards/roles.decorator';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { MenuImagesController } from './menu-images.controller';
import type { MenuImagesService, UploadedFile } from './menu-images.service';

const admin = { id: 'adm-1', role: 'super_admin' } as AuthenticatedUser;
const upload: UploadedFile = {
  buffer: Buffer.from('x'),
  size: 2_000_000,
  originalname: 'soup.jpg',
  mimetype: 'image/jpeg',
};
const result = {
  itemId: 'i1',
  image: { thumbnailUrl: 'https://t', fullUrl: 'https://f' },
  sizes: { originalBytes: 2_000_000, thumbBytes: 40_000, fullBytes: 150_000 },
  oldFilesRemoved: true,
};
const usage = (percent: number) => ({
  usedBytes: 1,
  allowanceBytes: 100,
  percent,
  nearLimit: percent >= 70,
});

function deps(overrides: Partial<Record<keyof MenuImagesService, jest.Mock>> = {}) {
  const service = {
    upload: jest.fn().mockResolvedValue(result),
    remove: jest.fn().mockResolvedValue(undefined),
    usage: jest.fn().mockResolvedValue(usage(10)),
    ...overrides,
  } as unknown as MenuImagesService;
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const req = { id: 'corr-1', log, user: admin } as unknown as Request;
  return { controller: new MenuImagesController(service), service, log, req };
}

const rolesOf = (method: keyof MenuImagesController) =>
  new Reflector().getAllAndOverride<string[]>(ROLES_KEY, [
    MenuImagesController.prototype[method],
    MenuImagesController,
  ]);

describe('MenuImagesController', () => {
  it('is for super admins only', () => {
    for (const m of ['upload', 'remove', 'usage'] as const) {
      expect(rolesOf(m)).toEqual(['super_admin']);
    }
  });

  it('uploads, logs sizes and the storage used', async () => {
    const { controller, service, log, req } = deps();
    await expect(controller.upload('i1', upload, req)).resolves.toEqual({
      ...result,
      storage: usage(10),
    });
    expect(service.upload).toHaveBeenCalledWith(admin, 'i1', upload, 'corr-1');
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'menu_item.image_uploaded',
        outcome: 'SUCCESS',
        actorUserId: 'adm-1',
        itemId: 'i1',
        originalBytes: 2_000_000,
        thumbBytes: 40_000,
        fullBytes: 150_000,
        storagePercent: 10,
      }),
      expect.any(String),
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('warns when storage passes 70% of the allowance', async () => {
    const { controller, log, req } = deps({ usage: jest.fn().mockResolvedValue(usage(72.5)) });
    await controller.upload('i1', upload, req);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'storage.near_limit', storagePercent: 72.5 }),
      expect.any(String),
    );
  });

  it('still answers when the storage total cannot be read', async () => {
    const down = new UpstreamUnavailableException('supabase', 'images.usage', 'down');
    const { controller, log, req } = deps({ usage: jest.fn().mockRejectedValue(down) });
    await expect(controller.upload('i1', upload, req)).resolves.toMatchObject({ storage: null });
    expect(log.error).toHaveBeenCalled();
  });

  it.each([
    [
      'a refusal',
      new UnsupportedMediaTypeException({ code: 'UNSUPPORTED_IMAGE_TYPE', message: 'm' }),
      'warn',
    ],
    [
      'a storage failure',
      new UpstreamUnavailableException('supabase-storage', 'put', 'down'),
      'error',
    ],
  ] as const)('logs %s as a FAILED upload and passes it on', async (_n, err, level) => {
    const { controller, log, req } = deps({ upload: jest.fn().mockRejectedValue(err) });
    await expect(controller.upload('i1', upload, req)).rejects.toBe(err);
    expect(log[level]).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'menu_item.image_uploaded',
        outcome: 'FAILED',
        actorUserId: 'adm-1',
        itemId: 'i1',
        originalBytes: 2_000_000,
      }),
      expect.any(String),
    );
  });

  it('removes a photo and logs it', async () => {
    const { controller, service, log, req } = deps();
    await controller.remove('i1', req);
    expect(service.remove).toHaveBeenCalledWith(admin, 'i1', 'corr-1');
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'menu_item.image_removed', outcome: 'SUCCESS' }),
      expect.any(String),
    );
  });

  it('logs a failed removal', async () => {
    const err = new NotFoundException({ code: 'IMAGE_NOT_FOUND', message: 'm' });
    const { controller, log, req } = deps({ remove: jest.fn().mockRejectedValue(err) });
    await expect(controller.remove('i1', req)).rejects.toBe(err);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'menu_item.image_removed', outcome: 'FAILED' }),
      expect.any(String),
    );
  });

  it('reports storage usage', async () => {
    const { controller } = deps();
    await expect(controller.usage()).resolves.toEqual(usage(10));
  });
});
