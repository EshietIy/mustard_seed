import { createHmac, timingSafeEqual } from 'node:crypto';

/** Paystack signs webhooks with the hex HMAC-SHA512 of the raw request body. */
export function paystackSignature(rawBody: Buffer, secretKey: string): string {
  return createHmac('sha512', secretKey).update(rawBody).digest('hex');
}

/** Timing-safe check of the x-paystack-signature header against the raw body. */
export function isValidPaystackSignature(
  rawBody: Buffer | undefined,
  header: unknown,
  secretKey: string,
): boolean {
  if (!rawBody || typeof header !== 'string' || !/^[0-9a-f]{128}$/i.test(header)) return false;
  const expected = Buffer.from(paystackSignature(rawBody, secretKey), 'hex');
  const given = Buffer.from(header, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
