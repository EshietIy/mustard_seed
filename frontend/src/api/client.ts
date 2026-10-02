/**
 * Single API client for the app (AGENT.md §7). Every failure is normalised into an ApiError with a
 * friendly message, so no raw error or backend internals ever reach the customer.
 */

export type ApiErrorKind =
  | 'offline'
  | 'network'
  | 'timeout'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'server'
  | 'unknown';

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  code?: string;
  fieldErrors?: Record<string, string[]>;
  retryAfter?: number;
  requestId?: string;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly fieldErrors?: Record<string, string[]>;
  readonly retryAfter?: number;
  readonly requestId?: string;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors;
    this.retryAfter = init.retryAfter;
    this.requestId = init.requestId;
  }
}

const MESSAGES: Record<ApiErrorKind, string> = {
  offline: 'You appear to be offline. Check your connection and try again.',
  network: 'We could not reach Mustard Seed right now. Please try again.',
  timeout: 'This is taking longer than usual. Please try again.',
  validation: 'Please check the highlighted fields.',
  unauthorized: 'Your session has expired. Please sign in again.',
  forbidden: 'You do not have access to this.',
  notFound: 'We could not find that.',
  conflict: 'That has changed since you last looked. Please refresh and try again.',
  rateLimited: 'Too many attempts. Please wait a moment and try again.',
  server: 'Something went wrong on our side. Please try again.',
  unknown: 'Something unexpected happened. Please try again.',
};

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'server';
  return 'unknown';
}

interface ServerErrorBody {
  code?: string;
  message?: string;
  details?: Array<{ field: string; messages: string[] }>;
  requestId?: string;
}

async function readErrorBody(res: Response): Promise<ServerErrorBody> {
  try {
    const body = (await res.json()) as { error?: ServerErrorBody };
    return body.error ?? {};
  } catch {
    return {};
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = await readErrorBody(res);
  const kind = kindForStatus(res.status);
  const retryAfterHeader = Number(res.headers.get('Retry-After'));
  const fieldErrors = body.details?.length
    ? Object.fromEntries(body.details.map((d) => [d.field, d.messages]))
    : undefined;
  // Server messages for 4xx are written for customers; 5xx messages are never shown.
  const useServerMessage = res.status < 500 && typeof body.message === 'string';
  return new ApiError({
    kind,
    status: res.status,
    code: body.code,
    message: useServerMessage ? (body.message as string) : MESSAGES[kind],
    fieldErrors,
    retryAfter:
      Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : undefined,
    requestId: body.requestId ?? res.headers.get('X-Request-Id') ?? undefined,
  });
}

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  isOnline?: () => boolean;
  /** Called for every 401 (e.g. to show "session expired, please sign in"). */
  onUnauthorized?: (path: string) => void;
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const isOnline = options.isOnline ?? (() => navigator.onLine);
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      const kind: ApiErrorKind = aborted ? 'timeout' : isOnline() ? 'network' : 'offline';
      throw new ApiError({ kind, message: MESSAGES[kind] });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const error = await toApiError(res);
      if (error.kind === 'unauthorized') options.onUnauthorized?.(path);
      throw error;
    }
    if (res.status === 204) return undefined as T;
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError({
        kind: 'unknown',
        status: res.status,
        message: MESSAGES.unknown,
        requestId: res.headers.get('X-Request-Id') ?? undefined,
      });
    }
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  };
}

let unauthorizedHandler: ((path: string) => void) | undefined;

/** Registers the app-wide 401 handler used by the shared `api` client. */
export function setUnauthorizedHandler(handler: ((path: string) => void) | undefined): void {
  unauthorizedHandler = handler;
}

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  onUnauthorized: (path) => unauthorizedHandler?.(path),
});
