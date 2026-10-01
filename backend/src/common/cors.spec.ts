import { createCorsOptions } from './cors';

type OriginFn = (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
) => void;

function check(fn: OriginFn, origin: string | undefined): boolean | undefined {
  let result: boolean | undefined;
  fn(origin, (err, allow) => {
    expect(err).toBeNull();
    result = allow;
  });
  return result;
}

describe('createCorsOptions', () => {
  const onReject = jest.fn();
  const options = createCorsOptions(['https://mustardseed.ng', 'http://localhost:5173'], onReject);
  const origin = options.origin as OriginFn;

  beforeEach(() => onReject.mockReset());

  it('allows an exact listed origin', () => {
    expect(check(origin, 'https://mustardseed.ng')).toBe(true);
    expect(check(origin, 'http://localhost:5173')).toBe(true);
    expect(onReject).not.toHaveBeenCalled();
  });

  it('allows requests with no Origin header (server-to-server)', () => {
    expect(check(origin, undefined)).toBe(true);
  });

  it.each([
    'https://mustardseed.ng.evil.com',
    'https://evilmustardseed.ng',
    'http://mustardseed.ng',
    'https://mustardseed.ng/',
    'https://www.mustardseed.ng',
    'https://MUSTARDSEED.NG',
    'http://localhost:5174',
    'null',
  ])('rejects %s and reports it', (bad) => {
    expect(check(origin, bad)).toBe(false);
    expect(onReject).toHaveBeenCalledWith(bad);
  });

  it('allows only the methods and headers the API uses, with credentials', () => {
    expect(options.methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
    expect(options.allowedHeaders).toEqual(['Content-Type', 'X-Request-Id']);
    expect(options.exposedHeaders).toEqual(['X-Request-Id', 'Retry-After']);
    expect(options.credentials).toBe(true);
  });
});
