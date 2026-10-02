import { execSync } from 'node:child_process';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface TestSupabaseEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

let cached: TestSupabaseEnv | undefined;

/**
 * Connection details of the LOCAL Supabase used by the BDD suite. Taken from
 * TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY, or read from `supabase status`.
 * Refuses anything that is not localhost so tests can never touch a real project.
 */
export function testSupabaseEnv(): TestSupabaseEnv {
  if (cached) return cached;
  let url = process.env.TEST_SUPABASE_URL;
  let key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    let status: Record<string, string>;
    try {
      status = JSON.parse(
        execSync('pnpm exec supabase status -o json', {
          stdio: ['ignore', 'pipe', 'ignore'],
        }).toString(),
      ) as Record<string, string>;
    } catch {
      throw new Error('Local Supabase is not running. Start it with: pnpm db:start');
    }
    url = status.API_URL;
    key = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  }
  if (!url || !key) throw new Error('Could not determine the local Supabase URL and key');
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    throw new Error(`Refusing to run tests against non-local Supabase at ${host}`);
  }
  cached = { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key };
  return cached;
}

let admin: SupabaseClient | undefined;

export function testDb(): SupabaseClient {
  if (!admin) {
    const env = testSupabaseEnv();
    admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

async function must(p: PromiseLike<{ error: { message: string } | null }>): Promise<void> {
  const { error } = await p;
  if (error) throw new Error(`Test database reset failed: ${error.message}`);
}

/** Puts every table back to its migrated default state, with an empty menu. */
export async function resetTestDatabase(): Promise<void> {
  const db = testDb();
  await must(db.from('menu_items').delete().not('id', 'is', null));
  await must(
    db.from('branches').upsert([
      {
        id: 'calabar',
        city: 'Calabar',
        state: 'Cross River State',
        role: 'headquarters',
        street_address: null,
        online_ordering_enabled: true,
        sort_order: 1,
      },
      {
        id: 'uyo',
        city: 'Uyo',
        state: 'Akwa Ibom State',
        role: 'branch',
        street_address: '97 Tunde Ukpehe (Mitama), Uyo',
        online_ordering_enabled: false,
        sort_order: 2,
      },
    ]),
  );
  await must(
    db.from('restaurant_info').upsert({
      id: true,
      name: 'Mustard Seed Restaurant & Bar',
      phone_whatsapp: null,
      opens_at: '08:00',
      closes_at: '23:00',
      online_orders_close_at: '22:30',
      timezone: 'Africa/Lagos',
      delivery_fee_kobo: 150000,
      delivery_area: 'Calabar',
    }),
  );
}
