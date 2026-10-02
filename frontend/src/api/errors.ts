import { ApiError } from './client';

/** Ensures anything caught from an API call is an ApiError with a friendly message. */
export function asApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError({
        kind: 'unknown',
        message: 'Something unexpected happened. Please try again.',
      });
}
