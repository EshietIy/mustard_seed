import type { AppConfig } from '../config/env.validation';

export interface ImageUrls {
  thumbnailUrl: string;
  fullUrl: string;
}

/**
 * Builds public image URLs from the stored object key (AGENT.md: only keys are stored, URLs come
 * from config). Each key holds a processed `thumb.webp` (lists) and `full.webp` (detail views).
 */
export function publicImageUrls(
  config: Pick<AppConfig, 'SUPABASE_URL' | 'SUPABASE_STORAGE_BUCKET'>,
  imagePath: string | null,
): ImageUrls | null {
  if (!imagePath) return null;
  const base = config.SUPABASE_URL.replace(/\/+$/, '');
  const key = imagePath.split('/').map(encodeURIComponent).join('/');
  const prefix = `${base}/storage/v1/object/public/${config.SUPABASE_STORAGE_BUCKET}/${key}`;
  return { thumbnailUrl: `${prefix}/thumb.webp`, fullUrl: `${prefix}/full.webp` };
}
