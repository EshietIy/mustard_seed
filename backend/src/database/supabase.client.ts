import { createClient } from '@supabase/supabase-js';
import type { AppConfig } from '../config/env.validation';

/**
 * Server-side Supabase client using the service-role key. Never exposed to the frontend.
 * Every request carries a timeout so a slow database fails fast instead of hanging requests.
 */
export function createSupabaseClient(
  config: Pick<AppConfig, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'SUPABASE_TIMEOUT_MS'>,
) {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: withTimeout(config.SUPABASE_TIMEOUT_MS) },
  });
}

/** fetch that aborts after `ms`, combined with any caller-supplied signal. */
export function withTimeout(ms: number, baseFetch: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return baseFetch(input, { ...init, signal });
  };
}
