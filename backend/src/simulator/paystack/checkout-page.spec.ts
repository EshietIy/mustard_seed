import { checkoutCsp, renderCheckoutPage, renderNotFoundPage } from './checkout-page';
import type { SimTransaction } from './simulator.store';

const tx: SimTransaction = {
  reference: 'MS0001-abc',
  accessCode: 'ac',
  email: '<script>alert(1)</script>@x.co',
  amountKobo: 1130000,
  currency: 'NGN',
  status: 'abandoned',
  channel: null,
  callbackUrl: 'http://localhost:5173/orders/o-1',
  metadata: {},
  paidAt: null,
  createdAt: '2026-10-05T11:00:00Z',
};

describe('simulator checkout page', () => {
  it('is clearly a test payment, shows the amount in naira and the four choices', () => {
    const html = renderCheckoutPage(tx, 'n0nce');
    expect(html).toContain('TEST PAYMENT: no real money is charged');
    expect(html).toContain('₦11,300');
    for (const value of ['success', 'failed', 'abandoned', 'ongoing']) {
      expect(html).toContain(`name="outcome" value="${value}"`);
    }
    expect(html).toContain('<style nonce="n0nce">');
  });

  it('escapes user-supplied values', () => {
    const html = renderCheckoutPage(tx, 'n');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('shows a finished payment instead of the choices', () => {
    const html = renderCheckoutPage({ ...tx, status: 'success' }, 'n');
    expect(html).toContain('already <strong>success</strong>');
    expect(html).not.toContain('<form');
  });

  it('renders a not-found page', () => {
    expect(renderNotFoundPage('n')).toContain('Payment not found');
  });

  it('locks the page down, allowing the form to post back and redirect to the callback', () => {
    const csp = checkoutCsp('abc', 'http://localhost:5173/orders/o-1?x=1');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("style-src 'nonce-abc' https://fonts.googleapis.com");
    expect(csp).toContain("form-action 'self' http://localhost:5173");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(checkoutCsp('abc', 'not a url')).toContain("form-action 'self';");
    expect(checkoutCsp('abc', null)).toContain("form-action 'self';");
  });
});
