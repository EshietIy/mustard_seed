import { ServiceUnavailableException } from '@nestjs/common';

/**
 * An upstream dependency (database, payment gateway, mail provider) failed or timed out.
 * Responds 503 with the generic message; the detail here is only ever logged.
 */
export class UpstreamUnavailableException extends ServiceUnavailableException {
  constructor(
    readonly upstream: string,
    readonly operation: string,
    detail: string,
  ) {
    super(`${upstream} ${operation} failed: ${detail}`);
  }
}

/** Wraps an upstream call so any thrown error becomes an UpstreamUnavailableException. */
export async function callUpstream<T>(
  upstream: string,
  operation: string,
  fn: () => PromiseLike<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof UpstreamUnavailableException) throw err;
    throw new UpstreamUnavailableException(
      upstream,
      operation,
      err instanceof Error ? err.message : String(err),
    );
  }
}
