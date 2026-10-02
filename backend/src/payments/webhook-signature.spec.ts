import { createHmac } from 'node:crypto';
import { isValidPaystackSignature, paystackSignature } from './webhook-signature';

const secret = 'sk_sim_0123456789abcdef';
const body = Buffer.from('{"event":"charge.success","data":{"reference":"r-1","amount":5000}}');

describe('Paystack webhook signature', () => {
  it('is the hex HMAC-SHA512 of the raw body', () => {
    expect(paystackSignature(body, secret)).toBe(
      createHmac('sha512', secret).update(body).digest('hex'),
    );
  });

  it('accepts the correct signature', () => {
    expect(isValidPaystackSignature(body, paystackSignature(body, secret), secret)).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['wrong', paystackSignature(body, 'sk_sim_other_secret_key')],
    ['truncated', paystackSignature(body, secret).slice(0, 64)],
    ['not hex', 'z'.repeat(128)],
    ['an array', ['a', 'b']],
  ])('rejects a %s signature', (_label, header) => {
    expect(isValidPaystackSignature(body, header, secret)).toBe(false);
  });

  it('rejects a signature for a different body (tampered amount)', () => {
    const tampered = Buffer.from(body.toString().replace('5000', '1'));
    expect(isValidPaystackSignature(tampered, paystackSignature(body, secret), secret)).toBe(false);
  });

  it('rejects when there is no raw body', () => {
    expect(isValidPaystackSignature(undefined, 'abc', secret)).toBe(false);
  });
});
