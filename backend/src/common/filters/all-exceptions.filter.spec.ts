import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { validationExceptionFactory } from '../validation';

function makeHost() {
  const res = {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const req = { id: 'req-123', method: 'GET', originalUrl: '/api/v1/thing' };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('AllExceptionsFilter', () => {
  const logger = { warn: jest.fn(), error: jest.fn() };
  const filter = new AllExceptionsFilter(logger);

  beforeEach(() => jest.clearAllMocks());

  it('maps a 404 to the safe error shape and logs at warn', () => {
    const { host, res } = makeHost();
    filter.catch(new NotFoundException('Cannot GET /secret/path'), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'NOT_FOUND', message: 'We could not find that.', requestId: 'req-123' },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'FAILED', errorCode: 'NOT_FOUND', statusCode: 404 }),
      expect.any(String),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('passes through validation details', () => {
    const { host, res } = makeHost();
    const ex = validationExceptionFactory([
      { property: 'email', constraints: { isEmail: 'email must be an email' }, children: [] },
    ]);
    filter.catch(ex, host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Some fields are invalid.',
        details: [{ field: 'email', messages: ['email must be an email'] }],
        requestId: 'req-123',
      },
    });
  });

  it('honours an explicit {code, message} body on HttpExceptions', () => {
    const { host, res } = makeHost();
    filter.catch(
      new HttpException({ code: 'ITEM_UNAVAILABLE', message: 'That dish is sold out.' }, 422),
      host,
    );
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'ITEM_UNAVAILABLE', message: 'That dish is sold out.', requestId: 'req-123' },
    });
  });

  it('does not leak framework messages for plain 4xx exceptions', () => {
    const { host, res } = makeHost();
    filter.catch(new BadRequestException('Unexpected token } in JSON at position 3'), host);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'BAD_REQUEST', message: 'The request was not valid.', requestId: 'req-123' },
    });
  });

  it('maps 403 and 429', () => {
    const a = makeHost();
    filter.catch(new ForbiddenException(), a.host);
    expect(a.res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'FORBIDDEN' }),
    });
    const b = makeHost();
    filter.catch(new ThrottlerException(), b.host);
    expect(b.res.status).toHaveBeenCalledWith(429);
    expect(b.res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: 'RATE_LIMITED' }),
    });
  });

  it('turns unknown errors into a generic 500 with no stack trace, logged at error', () => {
    const { host, res } = makeHost();
    const boom = new Error('db password is hunter2');
    filter.catch(boom, host);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = JSON.stringify(res.json.mock.calls[0][0]);
    expect(body).not.toContain('hunter2');
    expect(body).not.toContain('at ');
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side. Please try again.',
        requestId: 'req-123',
      },
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'FAILED', errorCode: 'INTERNAL_ERROR', err: boom }),
      expect.any(String),
    );
  });

  it('logs through the request-scoped logger when present', () => {
    const { host } = makeHost();
    const reqLog = { warn: jest.fn(), error: jest.fn() };
    const req = host.switchToHttp().getRequest<{ log?: typeof reqLog }>();
    req.log = reqLog;
    filter.catch(new ForbiddenException(), host);
    expect(reqLog.warn).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does nothing if headers were already sent', () => {
    const { host, res } = makeHost();
    res.headersSent = true;
    filter.catch(new Error('late'), host);
    expect(res.status).not.toHaveBeenCalled();
  });
});
