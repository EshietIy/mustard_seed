import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { pinoHttp, HttpLogger } from 'pino-http';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

type Outcome = 'SUCCESS' | 'FAILED';

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
    customSuccessObject: (_req, res, val: Record<string, unknown>) => ({
      ...val,
      statusCode: res.statusCode,
      outcome: outcomeOf(res),
    }),
    customErrorObject: (_req, res, _err, val: Record<string, unknown>) => ({
      ...val,
      statusCode: res.statusCode,
      outcome: 'FAILED',
    }),
    customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
    // Never log full headers or bodies: they can carry tokens and personal data.
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
