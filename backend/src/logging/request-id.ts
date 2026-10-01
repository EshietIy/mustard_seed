import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Reuses a well-formed incoming correlation ID, otherwise generates a new one. */
export function resolveRequestId(incoming: unknown): string {
  if (typeof incoming === 'string' && UUID.test(incoming)) {
    return incoming.toLowerCase();
  }
  return randomUUID();
}
