import { redactUrl } from './redact-url';

describe('redactUrl', () => {
  it('hides the tracking token in a tracking URL', () => {
    expect(redactUrl('/api/v1/orders/track/abcDEF123_-xyz')).toBe(
      '/api/v1/orders/track/[REDACTED]',
    );
    expect(redactUrl('/api/v1/orders/track/abc?x=1')).toBe('/api/v1/orders/track/[REDACTED]?x=1');
  });

  it('leaves other URLs alone', () => {
    expect(redactUrl('/api/v1/orders/3f2b8c1e')).toBe('/api/v1/orders/3f2b8c1e');
    expect(redactUrl('/health')).toBe('/health');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});
