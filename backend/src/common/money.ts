const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Integer kobo → "₦12,500" (display only; money stays in kobo everywhere else). */
export function formatNaira(kobo: number): string {
  return naira.format(kobo / 100);
}
