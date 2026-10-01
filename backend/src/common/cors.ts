import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Exact-match CORS (AGENT.md §3.3): no wildcards, no patterns, never reflects an unknown Origin.
 * Requests without an Origin header (server-to-server, uptime checks) are not browser CORS
 * requests and pass through.
 */
export function createCorsOptions(
  allowedOrigins: readonly string[],
  onReject: (origin: string) => void,
): CorsOptions {
  const allowed = new Set(allowedOrigins);
  return {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (origin === undefined || allowed.has(origin)) {
        cb(null, true);
        return;
      }
      onReject(origin);
      cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    credentials: true,
    maxAge: 600,
  };
}
