import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UpstreamUnavailableException } from '../errors/upstream-unavailable.exception';

export interface FilterLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

const DEFAULTS: Record<number, [code: string, message: string]> = {
  400: ['BAD_REQUEST', 'The request was not valid.'],
  401: ['UNAUTHORIZED', 'Please sign in to continue.'],
  403: ['FORBIDDEN', 'You do not have access to this.'],
  404: ['NOT_FOUND', 'We could not find that.'],
  405: ['METHOD_NOT_ALLOWED', 'That action is not allowed here.'],
  409: ['CONFLICT', 'That conflicts with something that already exists.'],
  413: ['PAYLOAD_TOO_LARGE', 'That upload is too large.'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'That file type is not supported.'],
  422: ['UNPROCESSABLE', 'We could not process that request.'],
  429: ['RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'],
  502: ['UPSTREAM_ERROR', 'A service we depend on failed. Please try again.'],
  503: ['SERVICE_UNAVAILABLE', 'The service is temporarily unavailable. Please try again.'],
  504: ['UPSTREAM_TIMEOUT', 'A service we depend on timed out. Please try again.'],
};
const INTERNAL: [string, string] = [
  'INTERNAL_ERROR',
  'Something went wrong on our side. Please try again.',
];

function explicitBody(response: unknown): Omit<ErrorBody, 'requestId'> | undefined {
  if (typeof response !== 'object' || response === null) return undefined;
  const r = response as Record<string, unknown>;
  if (typeof r.code !== 'string' || typeof r.message !== 'string') return undefined;
  return r.details === undefined
    ? { code: r.code, message: r.message }
    : { code: r.code, message: r.message, details: r.details };
}

/**
 * Global exception filter: one safe error shape, never a stack trace or internal message.
 * 4xx are logged at warn (expected failures), everything else at error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: FilterLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request & { id?: string; log?: FilterLogger }>();
    const res = http.getResponse<Response>();
    // Prefer the request-scoped logger so the line carries the correlation ID.
    const log = req.log ?? this.logger;
    if (res.headersSent) return;

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const isServerError = status >= 500;
    const explicit =
      exception instanceof HttpException && !isServerError
        ? explicitBody(exception.getResponse())
        : undefined;
    const [code, message] = DEFAULTS[status] ?? (isServerError ? INTERNAL : DEFAULTS[400]);
    const body: ErrorBody = { ...(explicit ?? { code, message }), requestId: req.id };

    const logFields = {
      outcome: 'FAILED',
      statusCode: status,
      errorCode: body.code,
      method: req.method,
      url: req.originalUrl,
      userId: req.user?.id ?? null,
    };
    const reason = exception instanceof Error ? exception.message : String(exception);
    if (isServerError) {
      res.err = exception instanceof Error ? exception : new Error(reason);
      const upstream =
        exception instanceof UpstreamUnavailableException
          ? { upstream: exception.upstream, operation: exception.operation }
          : {};
      log.error(
        { ...logFields, ...upstream, reason, err: exception },
        'Request failed with server error',
      );
    } else {
      log.warn({ ...logFields, reason }, 'Request rejected');
    }

    res.status(status).json({ error: body });
  }
}
