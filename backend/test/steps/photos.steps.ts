import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { IMAGE_STORAGE } from '../../src/images/image-storage';
import type { InMemoryImageStorage } from '../../src/images/in-memory-image-storage';
import { ApiWorld } from '../support/world';
import { testDb } from '../support/test-database';
import { req } from './api.steps';
import { resolveRefs } from './options.steps';

function store(world: ApiWorld): InMemoryImageStorage {
  assert.ok(world.app, 'The API is not running');
  return world.app.get<InMemoryImageStorage>(IMAGE_STORAGE);
}

const picture = (format: 'jpeg' | 'png' | 'webp') =>
  sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#c5a059' } })
    [format]()
    .toBuffer();

/** File contents by description, as staff might pick them. */
async function contents(kind: string): Promise<Buffer> {
  switch (kind) {
    case 'JPEG':
    case 'PNG':
    case 'WebP':
      return picture(kind === 'WebP' ? 'webp' : (kind.toLowerCase() as 'jpeg' | 'png'));
    case 'GIF':
      return Buffer.from('GIF89a' + 'x'.repeat(200));
    case 'text':
      return Buffer.from('this is a menu, not a photo');
    case 'damaged JPEG': {
      const jpeg = await picture('jpeg');
      return Buffer.concat([jpeg.subarray(0, 40), Buffer.alloc(500, 1)]);
    }
    case 'empty':
      return Buffer.alloc(0);
    case '2 MB':
      return Buffer.concat([await picture('jpeg'), Buffer.alloc(2 * 1024 * 1024, 7)]);
    default:
      throw new Error(`unknown file kind ${kind}`);
  }
}

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  txt: 'text/plain',
};

When(
  /^I upload a (JPEG|PNG|WebP|GIF|text|damaged JPEG|empty|2 MB) file named "([^"]+)" as the photo of "([^"]+)"$/,
  async function (this: ApiWorld, kind: string, filename: string, dish: string) {
    const url = `/api/v1/admin/menu-items/${await resolveRefs(dish)}/image`;
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    this.response = await req(this, 'post', url).attach('image', await contents(kind), {
      filename,
      contentType: TYPES[ext] ?? 'application/octet-stream',
    });
  },
);

When(
  'I send a photo form without a file for {string}',
  async function (this: ApiWorld, dish: string) {
    const url = `/api/v1/admin/menu-items/${await resolveRefs(dish)}/image`;
    this.response = await req(this, 'post', url).field('note', 'no photo here');
  },
);

Given('{string} has a photo', async function (this: ApiWorld, dish: string) {
  const id = await resolveRefs(`{{item:${dish}}}`);
  const path = `menu-items/${id}/earlier`;
  await store(this).put(`${path}/thumb.webp`, Buffer.from('old thumb'), 'image/webp');
  await store(this).put(`${path}/full.webp`, Buffer.from('old full'), 'image/webp');
  const { error } = await testDb().from('menu_items').update({ image_path: path }).eq('id', id);
  if (error) throw new Error(error.message);
});

Given('photo storage fails the next upload', function (this: ApiWorld) {
  store(this).failNextPuts(1);
});

Given('photo storage fails after storing the thumbnail', function (this: ApiWorld) {
  store(this).failNextPuts(1, 1);
});

Given('photo storage reports {int} bytes used', function (this: ApiWorld, bytes: number) {
  store(this).reportedUsage = bytes;
});

Then('photo storage holds {int} file(s)', function (this: ApiWorld, n: number) {
  assert.equal(store(this).files.size, n, [...store(this).files.keys()].join(', '));
});

Then('photo storage no longer holds the earlier photo', function (this: ApiWorld) {
  const left = [...store(this).files.keys()].filter((k) => k.includes('/earlier/'));
  assert.deepEqual(left, []);
});

Then(
  'photo storage holds a WebP thumbnail and full size for {string}',
  async function (this: ApiWorld, dish: string) {
    const id = await resolveRefs(`{{item:${dish}}}`);
    const files = [...store(this).files.entries()].filter(([k]) =>
      k.startsWith(`menu-items/${id}/`),
    );
    const byName = new Map(files.map(([k, v]) => [k.split('/').pop(), v]));
    for (const [name, width] of [
      ['thumb.webp', 400],
      ['full.webp', 1200],
    ] as const) {
      const file = byName.get(name);
      assert.ok(file, `no ${name} for ${dish}`);
      assert.equal(file.contentType, 'image/webp');
      const meta = await sharp(file.data).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.width, width);
    }
  },
);

interface MenuJson {
  categories: Array<{
    items: Array<{ name: string; image: { thumbnailUrl: string; fullUrl: string } | null }>;
  }>;
}

async function menuImage(world: ApiWorld, dish: string) {
  const res = await req(world, 'get', '/api/v1/menu');
  assert.equal(res.status, 200);
  const item = (res.body as MenuJson).categories
    .flatMap((c) => c.items)
    .find((i) => i.name === dish);
  assert.ok(item, `${dish} is not on the menu`);
  return item.image;
}

Then(
  'the menu shows the uploaded photo for {string}',
  async function (this: ApiWorld, dish: string) {
    const image = await menuImage(this, dish);
    const uploaded = (this.res().body as { image: unknown }).image;
    assert.deepEqual(image, uploaded);
    assert.match(
      image?.thumbnailUrl ?? '',
      /\/storage\/v1\/object\/public\/site-images\/menu-items\/.+\/thumb\.webp$/,
    );
  },
);

Then('the menu shows no photo for {string}', async function (this: ApiWorld, dish: string) {
  assert.equal(await menuImage(this, dish), null);
});

Then(
  'the menu still shows the earlier photo for {string}',
  async function (this: ApiWorld, dish: string) {
    const image = await menuImage(this, dish);
    assert.match(image?.thumbnailUrl ?? '', /\/earlier\/thumb\.webp$/);
  },
);
