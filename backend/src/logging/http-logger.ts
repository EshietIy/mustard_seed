import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { pinoHttp, HttpLogger } from 'pino-http';
import { redactUrl } from './redact-url';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

type Outcome = 'SUCCESS' | 'FAILED';

/** Set by AuthGuard; logged as an ID only, never the token. */
const userIdOf = (req: IncomingMessage): string | null =>
  (req as IncomingMessage & { user?: { id: string } }).user?.id ?? null;

const outcomeOf = (res: ServerResponse): Outcome => (res.statusCode < 400 ? 'SUCCESS' : 'FAILED');

/**
 * Global HTTP logging. Mounted as the very first middleware so every request is logged, including
 * ones rejected by CORS, the rate limiter or routing (404).
 */
export function createHttpLogger(logger: Logger): HttpLogger {
  return pinoHttp({
    logger,
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = resolveRequestId(req.headers[REQUEST_ID_HEADER.toLowerCase()]);
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    customSuccessObject: (req, res, val: Record<string, unknown>) => ({
      ...val,
      statusCode: res.statusCode,
      outcome: outcomeOf(res),
      userId: userIdOf(req),
    }),
    customErrorObject: (req, res, _err, val: Record<string, unknown>) => ({
      ...val,
      statusCode: res.statusCode,
      outcome: 'FAILED',
      userId: userIdOf(req),
    }),
    customSuccessMessage: (req, res) => `${req.method} ${redactUrl(req.url)} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${redactUrl(req.url)} ${res.statusCode}`,
    // Never log full headers or bodies: they can carry tokens and personal data.
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: redactUrl(req.url),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
