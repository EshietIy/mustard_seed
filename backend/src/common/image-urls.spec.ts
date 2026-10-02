import { publicImageUrls } from './image-urls';

const config = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_STORAGE_BUCKET: 'site-images' };

describe('publicImageUrls', () => {
  it('builds absolute thumbnail and full-size URLs from the stored key', () => {
    expect(publicImageUrls(config, 'menu/edikang-ikong/v2')).toEqual({
      thumbnailUrl:
        'https://abc.supabase.co/storage/v1/object/public/site-images/menu/edikang-ikong/v2/thumb.webp',
      fullUrl:
        'https://abc.supabase.co/storage/v1/object/public/site-images/menu/edikang-ikong/v2/full.webp',
    });
  });

  it('returns null when there is no image', () => {
    expect(publicImageUrls(config, null)).toBeNull();
  });

  it('tolerates a trailing slash on the Supabase URL and encodes path segments', () => {
    expect(
      publicImageUrls({ ...config, SUPABASE_URL: 'http://127.0.0.1:54321/' }, 'menu/a b/v1')
        ?.thumbnailUrl,
    ).toBe('http://127.0.0.1:54321/storage/v1/object/public/site-images/menu/a%20b/v1/thumb.webp');
  });
});
