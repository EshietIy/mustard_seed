import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { SupabaseImageStorage } from './supabase-image-storage';

type Result = { data: unknown; error: { message: string } | null };

function fakeClient(result: Result | Error) {
  const calls: Array<[string, ...unknown[]]> = [];
  const settle = () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result));
  const bucket = {
    upload: (...args: unknown[]) => (calls.push(['upload', ...args]), settle()),
    remove: (...args: unknown[]) => (calls.push(['remove', ...args]), settle()),
  };
  const client = {
    storage: { from: (name: string) => (calls.push(['from', name]), bucket) },
    rpc: (...args: unknown[]) => (calls.push(['rpc', ...args]), settle()),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const storage = (client: SupabaseClient) =>
  new SupabaseImageStorage(client, { SUPABASE_STORAGE_BUCKET: 'site-images' });

describe('SupabaseImageStorage', () => {
  it('uploads to the bucket with its type, long caching and no overwriting', async () => {
    const { client, calls } = fakeClient({ data: { path: 'k' }, error: null });
    const data = Buffer.from('webp');
    await storage(client).put('menu-items/i1/v1/thumb.webp', data, 'image/webp');
    expect(calls).toEqual([
      ['from', 'site-images'],
      [
        'upload',
        'menu-items/i1/v1/thumb.webp',
        data,
        { contentType: 'image/webp', cacheControl: '31536000', upsert: false },
      ],
    ]);
  });

  it('removes files, and does nothing for an empty list', async () => {
    const { client, calls } = fakeClient({ data: [], error: null });
    await storage(client).remove([]);
    expect(calls).toEqual([]);
    await storage(client).remove(['a/thumb.webp', 'a/full.webp']);
    expect(calls).toEqual([
      ['from', 'site-images'],
      ['remove', ['a/thumb.webp', 'a/full.webp']],
    ]);
  });

  it('reads the bucket total through the database function', async () => {
    const { client, calls } = fakeClient({ data: 123456, error: null });
    await expect(storage(client).usedBytes()).resolves.toBe(123456);
    expect(calls).toEqual([['rpc', 'storage_used_bytes', { bucket_name: 'site-images' }]]);
  });

  it.each([
    ['an error answer', { data: null, error: { message: 'Bucket not found' } }],
    ['a network failure', new Error('fetch failed')],
  ])('turns %s into a 503 upstream failure', async (_name, result) => {
    const { client } = fakeClient(result);
    await expect(storage(client).put('k', Buffer.from('x'), 'image/webp')).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(storage(client).remove(['k'])).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(storage(client).usedBytes()).rejects.toBeInstanceOf(UpstreamUnavailableException);
  });
});
