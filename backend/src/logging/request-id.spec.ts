import { resolveRequestId } from './request-id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('reuses a valid incoming UUID', () => {
    const id = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
    expect(resolveRequestId(id)).toBe(id);
  });

  it('lower-cases an upper-case UUID', () => {
    expect(resolveRequestId('3F2B8C1E-9A4D-4E6F-8B7A-1C2D3E4F5A6B')).toBe(
      '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b',
    );
  });

  it.each([undefined, '', 'abc', '<script>', 'x'.repeat(500), ['a', 'b']])(
    'generates a fresh UUID for %p',
    (incoming) => {
      expect(resolveRequestId(incoming)).toMatch(UUID_RE);
    },
  );

  it('generates different ids each time', () => {
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });
});
