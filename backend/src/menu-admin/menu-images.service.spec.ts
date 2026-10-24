import { HttpException } from '@nestjs/common';
import sharp from 'sharp';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { InMemoryImageStorage } from '../images/in-memory-image-storage';
import type { AuditEvent } from '../orders/orders.types';
import { InMemoryMenuAdminRepository } from './in-memory-menu-admin.repository';
import { MenuImagesService, type UploadedFile } from './menu-images.service';

const SOUP = '11111111-1111-4111-8111-111111111111';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';
const admin = { id: 'u-admin', role: 'super_admin' } as AuthenticatedUser;
const config = {
  SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_STORAGE_BUCKET: 'site-images',
  IMAGE_STORAGE_ALLOWANCE_MB: 1024,
};

const statusOf = (err: unknown) => (err as HttpException).getStatus();
const codeOf = (err: unknown) => ((err as HttpException).getResponse() as { code: string }).code;

let jpeg: Buffer;
let png: Buffer;
beforeAll(async () => {
  const create = { width: 800, height: 600, channels: 3 as const, background: '#9f2d2d' };
  jpeg = await sharp({ create }).jpeg().toBuffer();
  png = await sharp({ create }).png().toBuffer();
});

const file = (data: Buffer, originalname = 'soup.jpg', mimetype = 'image/jpeg'): UploadedFile => ({
  buffer: data,
  size: data.length,
  originalname,
  mimetype,
});

function setup(imagePath: string | null = null) {
  const repo = new InMemoryMenuAdminRepository([
    {
      id: SOUP,
      name: 'Afang Soup',
      category: 'calabar_soups',
      priceKobo: 400000,
      isAvailable: true,
      imagePath,
    },
  ]);
  const storage = new InMemoryImageStorage();
  const audit: AuditEvent[] = [];
  const service = new MenuImagesService(repo, storage, config, {
    recordAudit: (e) => {
      audit.push(e);
      return Promise.resolve();
    },
  });
  return { repo, storage, service, audit };
}

async function failure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a failure');
    },
    (e: unknown) => e,
  );
}

describe('MenuImagesService.upload', () => {
  it('stores a WebP thumbnail and full size under a new versioned key and saves that key', async () => {
    const { repo, storage, service, audit } = setup();
    const result = await service.upload(admin, SOUP, file(jpeg), 'corr-1');

    const path = repo.items[0]?.imagePath;
    expect(path).toMatch(new RegExp(`^menu-items/${SOUP}/[0-9a-f-]{36}$`));
    expect([...storage.files.keys()].sort()).toEqual([`${path}/full.webp`, `${path}/thumb.webp`]);
    for (const { contentType } of storage.files.values()) expect(contentType).toBe('image/webp');
    expect(result.image).toEqual({
      thumbnailUrl: `https://proj.supabase.co/storage/v1/object/public/site-images/${path}/thumb.webp`,
      fullUrl: `https://proj.supabase.co/storage/v1/object/public/site-images/${path}/full.webp`,
    });
    expect(result.sizes.originalBytes).toBe(jpeg.length);
    expect(result.sizes.thumbBytes).toBe(storage.files.get(`${path}/thumb.webp`)?.data.length);
    expect(audit).toEqual([
      expect.objectContaining({
        event: 'menu_item.image_uploaded',
        outcome: 'SUCCESS',
        userId: 'u-admin',
        correlationId: 'corr-1',
        details: expect.objectContaining({ itemId: SOUP, imagePath: path }) as unknown,
      }),
    ]);
  });

  it('accepts PNG and WebP too', async () => {
    const { service } = setup();
    await service.upload(admin, SOUP, file(png, 'soup.png', 'image/png'), 'c');
    const webp = await sharp(png).webp().toBuffer();
    await service.upload(admin, SOUP, file(webp, 'soup.webp', 'image/webp'), 'c');
  });

  it('replaces a photo and removes the old files', async () => {
    const old = `menu-items/${SOUP}/old-version`;
    const { repo, storage, service } = setup(old);
    await storage.put(`${old}/thumb.webp`, Buffer.from('t'), 'image/webp');
    await storage.put(`${old}/full.webp`, Buffer.from('f'), 'image/webp');
    const result = await service.upload(admin, SOUP, file(jpeg), 'c');
    expect(repo.items[0]?.imagePath).not.toBe(old);
    expect([...storage.files.keys()].some((k) => k.startsWith(old))).toBe(false);
    expect(storage.files.size).toBe(2);
    expect(result.oldFilesRemoved).toBe(true);
  });

  it('keeps the new photo when the old files cannot be removed', async () => {
    const old = `menu-items/${SOUP}/old-version`;
    const { repo, storage, service } = setup(old);
    jest
      .spyOn(storage, 'remove')
      .mockRejectedValue(new UpstreamUnavailableException('supabase-storage', 'remove', 'down'));
    const result = await service.upload(admin, SOUP, file(jpeg), 'c');
    expect(result.oldFilesRemoved).toBe(false);
    expect(repo.items[0]?.imagePath).not.toBe(old);
  });

  it.each([
    ['no file', undefined],
    ['an empty file', file(Buffer.alloc(0))],
  ])('refuses %s with 400 IMAGE_REQUIRED', async (_name, upload) => {
    const { service, storage } = setup();
    const err = await failure(service.upload(admin, SOUP, upload, 'c'));
    expect([statusOf(err), codeOf(err)]).toEqual([400, 'IMAGE_REQUIRED']);
    expect(storage.files.size).toBe(0);
  });

  it('refuses a file that is not JPEG, PNG or WebP with 415', async () => {
    const { service } = setup();
    const gif = Buffer.from('GIF89a' + 'x'.repeat(100));
    const err = await failure(service.upload(admin, SOUP, file(gif, 'a.gif', 'image/gif'), 'c'));
    expect([statusOf(err), codeOf(err)]).toEqual([415, 'UNSUPPORTED_IMAGE_TYPE']);
  });

  it.each([
    ['its name', file(Buffer.alloc(0), 'soup.png', 'image/jpeg')],
    ['its declared type', file(Buffer.alloc(0), 'soup.jpg', 'image/png')],
  ])('refuses a JPEG whose %s says otherwise with 415', async (_name, upload) => {
    const { service } = setup();
    const err = await failure(
      service.upload(admin, SOUP, { ...upload, buffer: jpeg, size: jpeg.length }, 'c'),
    );
    expect([statusOf(err), codeOf(err)]).toEqual([415, 'IMAGE_TYPE_MISMATCH']);
  });

  it('accepts .jpeg names and a generic declared type', async () => {
    const { service } = setup();
    await service.upload(admin, SOUP, file(jpeg, 'IMG_0001.JPEG', 'application/octet-stream'), 'c');
  });

  it('refuses an unknown dish with 404 and stores nothing', async () => {
    const { service, storage } = setup();
    const err = await failure(service.upload(admin, UNKNOWN, file(jpeg), 'c'));
    expect([statusOf(err), codeOf(err)]).toEqual([404, 'MENU_ITEM_NOT_FOUND']);
    expect(storage.files.size).toBe(0);
  });

  it('refuses a corrupt picture with 422 and stores nothing', async () => {
    const { service, storage, repo } = setup();
    const corrupt = Buffer.concat([jpeg.subarray(0, 40), Buffer.alloc(300, 1)]);
    const err = await failure(service.upload(admin, SOUP, file(corrupt), 'c'));
    expect([statusOf(err), codeOf(err)]).toEqual([422, 'IMAGE_UNREADABLE']);
    expect(storage.files.size).toBe(0);
    expect(repo.items[0]?.imagePath).toBeNull();
  });

  it('cleans up the first file when the second upload fails, and keeps the old photo', async () => {
    const old = `menu-items/${SOUP}/old-version`;
    const { service, storage, repo, audit } = setup(old);
    storage.failNextPuts(1, 1);
    const err = await failure(service.upload(admin, SOUP, file(jpeg), 'c'));
    expect(err).toBeInstanceOf(UpstreamUnavailableException);
    expect(storage.files.size).toBe(0);
    expect(repo.items[0]?.imagePath).toBe(old);
    expect(audit).toEqual([]);
  });

  it('removes the new files when saving the key fails', async () => {
    const { service, storage, repo } = setup();
    jest
      .spyOn(repo, 'setImagePath')
      .mockRejectedValue(new UpstreamUnavailableException('supabase', 'update', 'down'));
    const err = await failure(service.upload(admin, SOUP, file(jpeg), 'c'));
    expect(err).toBeInstanceOf(UpstreamUnavailableException);
    expect(storage.files.size).toBe(0);
  });
});

describe('MenuImagesService.remove', () => {
  it('removes the photo files and clears the key', async () => {
    const old = `menu-items/${SOUP}/v1`;
    const { service, storage, repo, audit } = setup(old);
    await storage.put(`${old}/thumb.webp`, Buffer.from('t'), 'image/webp');
    await storage.put(`${old}/full.webp`, Buffer.from('f'), 'image/webp');
    await service.remove(admin, SOUP, 'c');
    expect(repo.items[0]?.imagePath).toBeNull();
    expect(storage.files.size).toBe(0);
    expect(audit[0]).toMatchObject({ event: 'menu_item.image_removed', outcome: 'SUCCESS' });
  });

  it('refuses a dish without a photo with 404 IMAGE_NOT_FOUND', async () => {
    const { service } = setup();
    const err = await failure(service.remove(admin, SOUP, 'c'));
    expect([statusOf(err), codeOf(err)]).toEqual([404, 'IMAGE_NOT_FOUND']);
  });

  it('refuses an unknown dish with 404 MENU_ITEM_NOT_FOUND', async () => {
    const { service } = setup();
    const err = await failure(service.remove(admin, UNKNOWN, 'c'));
    expect([statusOf(err), codeOf(err)]).toEqual([404, 'MENU_ITEM_NOT_FOUND']);
  });

  it('keeps the photo when the database cannot be updated', async () => {
    const old = `menu-items/${SOUP}/v1`;
    const { service, storage, repo } = setup(old);
    await storage.put(`${old}/thumb.webp`, Buffer.from('t'), 'image/webp');
    jest
      .spyOn(repo, 'setImagePath')
      .mockRejectedValue(new UpstreamUnavailableException('supabase', 'update', 'down'));
    await failure(service.remove(admin, SOUP, 'c'));
    expect(storage.files.size).toBe(1);
  });
});

describe('MenuImagesService.usage', () => {
  it('reports used bytes against the allowance', async () => {
    const { service, storage } = setup();
    storage.reportedUsage = 805_306_368; // 768 MB of 1024
    await expect(service.usage()).resolves.toEqual({
      usedBytes: 805_306_368,
      allowanceBytes: 1_073_741_824,
      percent: 75,
      nearLimit: true,
    });
  });

  it('is not near the limit below 70%', async () => {
    const { service, storage } = setup();
    storage.reportedUsage = 1000;
    await expect(service.usage()).resolves.toMatchObject({ percent: 0, nearLimit: false });
  });
});
