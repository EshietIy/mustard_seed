import sharp from 'sharp';

export type ImageType = 'jpeg' | 'png' | 'webp';

/** Lists use the thumbnail; keep it small for Supabase's free egress (AGENT.md 3.1). */
export const THUMB_TARGET_BYTES = 60 * 1024;
const THUMB_WIDTH = 400;
const FULL_WIDTH = 1200;
/** Tried in turn until the thumbnail fits the target. */
const THUMB_QUALITIES = [72, 60, 48, 36, 25];
const FULL_QUALITY = 80;

export class ImageUnreadableError extends Error {
  constructor(cause: unknown) {
    super(
      `image could not be processed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/** Identifies JPEG, PNG and WebP by their file signature, never by name or declared type. */
export function detectImageType(data: Buffer): ImageType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'jpeg';
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length >= png.length && png.every((b, i) => data[i] === b)) return 'png';
  if (
    data.length >= 12 &&
    data.toString('latin1', 0, 4) === 'RIFF' &&
    data.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export interface ProcessedImage {
  thumb: Buffer;
  full: Buffer;
}

/**
 * Auto-rotates, strips metadata (sharp drops it unless asked to keep it) and converts to WebP:
 * a 400px thumbnail kept under THUMB_TARGET_BYTES and a 1200px full size. Never enlarges.
 */
export async function processImage(data: Buffer): Promise<ProcessedImage> {
  try {
    const upright = await sharp(data, { failOn: 'error' }).rotate().toBuffer();
    const resize = (width: number) => sharp(upright).resize({ width, withoutEnlargement: true });
    const full = await resize(FULL_WIDTH).webp({ quality: FULL_QUALITY }).toBuffer();
    let thumb = Buffer.alloc(0);
    for (const quality of THUMB_QUALITIES) {
      thumb = await resize(THUMB_WIDTH).webp({ quality }).toBuffer();
      if (thumb.length <= THUMB_TARGET_BYTES) break;
    }
    return { thumb, full };
  } catch (err) {
    throw new ImageUnreadableError(err);
  }
}
