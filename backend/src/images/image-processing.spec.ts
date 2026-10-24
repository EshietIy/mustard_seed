import sharp from 'sharp';
import {
  detectImageType,
  ImageUnreadableError,
  processImage,
  THUMB_TARGET_BYTES,
} from './image-processing';

/** A solid-colour test image in the given format. */
function solid(format: 'jpeg' | 'png' | 'webp', width = 1600, height = 1000): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#9f2d2d' } })
    [format]()
    .toBuffer();
}

/** Random pixels: the worst case for compression. */
function noise(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = Math.floor(Math.random() * 256);
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe('detectImageType', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('recognises a real %s by its contents', async (f) => {
    expect(detectImageType(await solid(f, 10, 10))).toBe(f);
  });

  it.each([
    ['a GIF', Buffer.from('GIF89a........')],
    ['plain text', Buffer.from('hello, this is not a picture')],
    ['a PDF', Buffer.from('%PDF-1.7\n')],
    ['a RIFF file that is not WebP', Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt ', 'latin1')],
    ['an empty file', Buffer.alloc(0)],
    ['two bytes', Buffer.from([0xff, 0xd8])],
  ])('refuses %s', (_name, data) => {
    expect(detectImageType(data)).toBeNull();
  });
});

describe('processImage', () => {
  it('makes a 400px thumbnail and a 1200px full size, both WebP', async () => {
    const result = await processImage(await solid('jpeg'));
    for (const [out, width] of [
      [result.thumb, 400],
      [result.full, 1200],
    ] as const) {
      const meta = await sharp(out).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(width);
    }
  });

  it('never enlarges a small photo', async () => {
    const result = await processImage(await solid('png', 300, 200));
    expect((await sharp(result.thumb).metadata()).width).toBe(300);
    expect((await sharp(result.full).metadata()).width).toBe(300);
  });

  it('turns a photo upright from its camera orientation, then drops the metadata', async () => {
    // 600x300 stored, EXIF orientation 6 = shown rotated 90 degrees, so 300 wide when upright.
    const sideways = await sharp({
      create: { width: 600, height: 300, channels: 3, background: '#c5a059' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await processImage(sideways);
    const meta = await sharp(result.full).metadata();
    expect([meta.width, meta.height]).toEqual([300, 600]);
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
  });

  // Encodes random noise several times: slow, so it gets more time than the default.
  it('keeps even a worst-case thumbnail under the size target', async () => {
    const result = await processImage(await noise(800, 600));
    expect(result.thumb.length).toBeLessThanOrEqual(THUMB_TARGET_BYTES);
  }, 30_000);

  it('reports a file it cannot read as unreadable', async () => {
    const jpeg = await solid('jpeg');
    const broken = Buffer.concat([jpeg.subarray(0, 40), Buffer.alloc(200, 7)]);
    await expect(processImage(broken)).rejects.toBeInstanceOf(ImageUnreadableError);
  });
});
