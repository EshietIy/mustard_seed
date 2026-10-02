import type { SimTransaction } from './simulator.store';

const escape = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );

const naira = (kobo: number): string =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(kobo / 100);

/** The simulator's hosted checkout page. Brand tokens are defined once at :root. */
export function renderCheckoutPage(tx: SimTransaction, nonce: string): string {
  const done = tx.status === 'success' || tx.status === 'failed';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>TEST PAYMENT · Mustard Seed</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap">
<style nonce="${nonce}">
:root{--crimson:#9F2D2D;--gold:#C5A059;--charcoal:#1E221E;--cream:#F4F2EE;--white:#FFFFFF}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1rem;background:var(--cream);color:var(--charcoal);font:16px/1.5 'Plus Jakarta Sans',Arial,Helvetica,sans-serif}
.card{width:min(28rem,100%);background:var(--white);border-radius:1rem;overflow:hidden;border:1px solid rgba(30,34,30,.12)}
.banner{padding:.75rem 1rem;background:var(--charcoal);color:var(--gold);font-weight:700;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;text-align:center}
.body{padding:1.5rem}
h1{margin:0 0 .25rem;font:600 2rem 'Cormorant Garamond',Georgia,serif}
.amount{font-size:1.75rem;font-weight:700;color:var(--crimson);margin:.5rem 0}
dl{display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;font-size:.875rem;margin:1rem 0 1.5rem}
dt{color:rgba(30,34,30,.7)}dd{margin:0;word-break:break-all}
.actions{display:grid;gap:.5rem}
button{min-height:2.75rem;border-radius:999px;font:600 .9375rem 'Plus Jakarta Sans',Arial,sans-serif;cursor:pointer;border:1px solid rgba(30,34,30,.25);background:var(--white);color:var(--charcoal)}
button.primary{background:var(--crimson);border-color:var(--crimson);color:var(--white)}
button:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.note{font-size:.75rem;color:rgba(30,34,30,.7);margin-top:1rem;text-align:center}
</style>
</head>
<body>
<main class="card">
<div class="banner" role="status">TEST PAYMENT: no real money is charged</div>
<div class="body">
<h1>Mustard Seed</h1>
<div class="amount">${escape(naira(tx.amountKobo))}</div>
<dl>
<dt>Reference</dt><dd>${escape(tx.reference)}</dd>
<dt>Email</dt><dd>${escape(tx.email)}</dd>
<dt>Status</dt><dd>${escape(tx.status)}</dd>
</dl>
${
  done
    ? `<p>This test payment is already <strong>${escape(tx.status)}</strong>.</p>`
    : `<form method="post" class="actions">
<button class="primary" name="outcome" value="success">Pay successfully</button>
<button name="outcome" value="failed">Card declined</button>
<button name="outcome" value="abandoned">Cancel</button>
<button name="outcome" value="ongoing">Leave pending</button>
</form>`
}
<p class="note">Paystack Simulator · test environments only</p>
</div>
</main>
</body>
</html>`;
}

export function renderNotFoundPage(nonce: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TEST PAYMENT</title><style nonce="${nonce}">body{font-family:Arial,sans-serif;padding:2rem}</style></head><body><h1>Payment not found</h1><p>This test checkout link is unknown or was reset.</p></body></html>`;
}

/** Locked-down CSP for the page: only its own nonce'd styles, Google Fonts and posting back. */
export function checkoutCsp(nonce: string, callbackUrl: string | null): string {
  let formAction = "'self'";
  if (callbackUrl) {
    try {
      formAction += ` ${new URL(callbackUrl).origin}`;
    } catch {
      // Ignore a malformed callback; the redirect simply won't be allowed.
    }
  }
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}' https://fonts.googleapis.com`,
    'font-src https://fonts.gstatic.com',
    `form-action ${formAction}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
}
