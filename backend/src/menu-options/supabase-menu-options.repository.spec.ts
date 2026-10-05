import type { SupabaseClient } from '@supabase/supabase-js';
import { UpstreamUnavailableException } from '../common/errors/upstream-unavailable.exception';
import { fakeSupabase } from '../database/testing/fake-supabase';
import { OptionNameTakenError } from './menu-options.repository';
import { SupabaseMenuOptionsRepository } from './supabase-menu-options.repository';

const ok = (data: unknown) => ({ data, error: null });
const taken = { data: null, error: { message: 'duplicate key', code: '23505' } };
const down = { data: null, error: { message: 'fetch failed', code: '' } };

function withRpc(fake: ReturnType<typeof fakeSupabase>, result: unknown) {
  (fake.client as Record<string, unknown>).rpc = (fn: string, args: unknown) => {
    fake.calls.log.push(['rpc', fn, args]);
    return Promise.resolve(result);
  };
  return fake;
}

const repo = (client: unknown) => new SupabaseMenuOptionsRepository(client as SupabaseClient);

describe('SupabaseMenuOptionsRepository', () => {
  it('loads every group, option, link and override, archived ones included', async () => {
    const { client, calls } = fakeSupabase(
      ok([
        { id: 'g1', name: 'P', min_choices: 1, max_choices: 1, sort_order: 0, archived_at: 'x' },
      ]),
      ok([]),
      ok([]),
      ok([]),
    );
    const rows = await repo(client).loadAll();
    expect(calls.from).toEqual([
      'option_groups',
      'options',
      'menu_item_option_groups',
      'menu_item_option_overrides',
    ]);
    expect(rows.groups).toEqual([
      { id: 'g1', name: 'P', minChoices: 1, maxChoices: 1, sortOrder: 0, archived: true },
    ]);
  });

  it('creates a group and maps a duplicate name to OptionNameTakenError', async () => {
    const created = fakeSupabase(ok({ id: 'g1' }));
    await expect(
      repo(created.client).createGroup({ name: 'P', minChoices: 1, maxChoices: 1, sortOrder: 0 }),
    ).resolves.toBe('g1');
    expect(created.calls.insert?.[0]).toEqual({
      name: 'P',
      min_choices: 1,
      max_choices: 1,
      sort_order: 0,
    });
    await expect(
      repo(fakeSupabase(taken).client).createGroup({
        name: 'P',
        minChoices: 1,
        maxChoices: 1,
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(OptionNameTakenError);
  });

  it('archives by setting archived_at, and restores by clearing it', async () => {
    const { client, calls } = fakeSupabase(ok(null));
    await repo(client).updateGroup('g1', { archived: true, maxChoices: 2 });
    await repo(client).updateGroup('g1', { archived: false });
    const [archive, restore] = calls.update as Array<Record<string, unknown>>;
    expect(archive).toMatchObject({ max_choices: 2 });
    expect(typeof archive.archived_at).toBe('string');
    expect(restore).toEqual({ archived_at: null });
  });

  it('creates an option and its exclusions through one database function', async () => {
    const fake = withRpc(fakeSupabase(ok(null)), ok('o1'));
    await expect(
      repo(fake.client).createOption('g1', { name: 'Beef', priceDeltaKobo: 0, sortOrder: 10 }, [
        'i2',
      ]),
    ).resolves.toBe('o1');
    expect(fake.calls.log.find((c) => c[0] === 'rpc')).toEqual([
      'rpc',
      'create_option',
      {
        p_group_id: 'g1',
        p_name: 'Beef',
        p_price_delta_kobo: 0,
        p_sort_order: 10,
        p_exclude_item_ids: ['i2'],
      },
    ]);
    const dup = withRpc(fakeSupabase(ok(null)), taken);
    await expect(
      repo(dup.client).createOption('g1', { name: 'Beef', priceDeltaKobo: 0, sortOrder: 0 }, []),
    ).rejects.toBeInstanceOf(OptionNameTakenError);
  });

  it('updates an option, mapping availability and archiving', async () => {
    const { client, calls } = fakeSupabase(ok(null));
    await repo(client).updateOption('o1', { isAvailable: false, priceDeltaKobo: 500 });
    expect(calls.update?.[0]).toEqual({ is_available: false, price_delta_kobo: 500 });
  });

  it('replaces item groups atomically, and upserts and deletes overrides', async () => {
    const fake = withRpc(fakeSupabase(ok(null)), ok(null));
    await repo(fake.client).setItemGroups('i1', ['g1', 'g2']);
    expect(fake.calls.log.find((c) => c[0] === 'rpc')).toEqual([
      'rpc',
      'set_item_option_groups',
      { p_item_id: 'i1', p_group_ids: ['g1', 'g2'] },
    ]);
    await repo(fake.client).upsertOverride('i1', 'o1', { isExcluded: true, priceDeltaKobo: null });
    expect(fake.calls.upsert?.[0]).toEqual({
      menu_item_id: 'i1',
      option_id: 'o1',
      is_excluded: true,
      price_delta_kobo: null,
    });
    await expect(
      repo(fakeSupabase(ok([{ option_id: 'o1' }])).client).deleteOverride('i1', 'o1'),
    ).resolves.toBe(true);
    await expect(repo(fakeSupabase(ok([])).client).deleteOverride('i1', 'o1')).resolves.toBe(false);
  });

  it('maps database failures to 503', async () => {
    await expect(repo(fakeSupabase(down).client).listMenuItemIds()).rejects.toBeInstanceOf(
      UpstreamUnavailableException,
    );
    await expect(
      repo(fakeSupabase(down).client).updateOption('o1', { isAvailable: true }),
    ).rejects.toBeInstanceOf(UpstreamUnavailableException);
  });
});
