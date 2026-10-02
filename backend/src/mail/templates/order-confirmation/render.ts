import { formatNaira } from '../../../common/money';
import type { OrderConfirmationData, RenderedEmail } from './order-confirmation.types';
import { brand, fonts, tints } from './theme';

/** Escapes every value that goes into HTML (text or attribute). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

const e = escapeHtml;
const BODY = `font-family:${fonts.body};`;
const HEADING = `font-family:${fonts.heading};`;

/** A full-width zigzag strip; the gold cell keeps the trim colour when images are blocked. */
function zigzag(asset: string): string {
  return `<tr><td bgcolor="${brand.gold}" style="background-color:${brand.gold};line-height:0;font-size:0;height:8px;">
<img src="${asset}/zigzag@2x.png" width="600" height="8" alt="" style="display:block;width:100%;max-width:600px;height:8px;border:0;">
</td></tr>`;
}

function band(): string {
  return `<tr><td bgcolor="${brand.cream}" style="background-color:${brand.cream};height:8px;line-height:8px;font-size:8px;">&nbsp;</td></tr>`;
}

function itemRows(d: OrderConfirmationData): string {
  return d.items
    .map(
      (item, i) => `<tr data-line="${i + 1}">
<td valign="top" width="36" style="${BODY}padding:12px 0;border-bottom:1px solid ${tints.border};color:${brand.crimson};font-weight:700;font-size:15px;">${item.quantity}×</td>
<td valign="top" style="${BODY}padding:12px 8px 12px 0;border-bottom:1px solid ${tints.border};color:${brand.charcoal};font-size:15px;font-weight:600;word-break:break-word;overflow-wrap:anywhere;">${e(item.name)}${
        item.note
          ? `<br><span data-note style="font-weight:400;font-size:13px;color:${tints.textMuted};">${e(item.note)}</span>`
          : ''
      }</td>
<td valign="top" align="right" style="${BODY}padding:12px 0;border-bottom:1px solid ${tints.border};color:${brand.charcoal};font-size:15px;font-weight:700;white-space:nowrap;">${formatNaira(item.lineTotalKobo)}</td>
</tr>`,
    )
    .join('\n');
}

function totalRow(label: string, value: string, strong = false): string {
  const weight = strong ? 'font-weight:700;font-size:18px;' : 'font-size:15px;';
  const colour = strong ? brand.charcoal : tints.textMuted;
  const border = strong
    ? `border-top:2px solid ${brand.charcoal};padding-top:12px;`
    : 'padding-top:8px;padding-bottom:8px;';
  return `<tr>
<td colspan="2" style="${BODY}${weight}${border}color:${colour};">${label}</td>
<td align="right" style="${BODY}${weight}${border}color:${colour};white-space:nowrap;">${value}</td>
</tr>`;
}

function progress(d: OrderConfirmationData): string {
  const steps = [
    'Confirmed',
    'Preparing',
    'Ready',
    d.fulfilment === 'delivery' ? 'Delivered' : 'Collected',
  ];
  const cells = steps
    .map((label, i) => {
      const active = i === 0;
      const bar = active ? brand.crimson : tints.progressTrack;
      return `<td width="25%" valign="top" style="padding:0 ${i < 3 ? '6px' : '0'} 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${bar}" style="background-color:${bar};height:5px;line-height:5px;font-size:5px;border-radius:3px;">&nbsp;</td></tr></table>
<p style="${BODY}margin:8px 0 0;font-size:12px;color:${active ? brand.charcoal : tints.textMuted};font-weight:${active ? 700 : 400};">${label}</p>
</td>`;
    })
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

function destination(d: OrderConfirmationData): { heading: string; lines: string[] } {
  if (d.fulfilment === 'delivery' && d.deliveryAddress) {
    return {
      heading: 'DELIVERING TO',
      lines: [
        d.customer.fullName,
        d.deliveryAddress.streetAddress,
        `${d.deliveryAddress.city}, ${d.deliveryAddress.state}`,
        d.customer.phone,
      ],
    };
  }
  const p = d.pickupAddress;
  return {
    heading: 'PICK UP AT',
    lines: p
      ? [p.name, p.streetAddress, `${p.city}, ${p.state}`]
      : ['Mustard Seed Restaurant & Bar'],
  };
}

function copy(d: OrderConfirmationData) {
  const isDelivery = d.fulfilment === 'delivery';
  return {
    intro: isDelivery
      ? 'We’ve started cooking. Your food will be handed to our rider as soon as it’s ready.'
      : 'We’ve started cooking. We’ll have it ready for you to collect.',
    etaLabel: isDelivery ? 'Estimated arrival' : 'Ready for pickup by',
  };
}

export function renderOrderConfirmation(d: OrderConfirmationData): RenderedEmail {
  const subject = `Payment received — your Mustard Seed order ${d.orderNumber}`;
  const preheader = `Payment received — the kitchen has your order ${d.orderNumber}.`;
  const asset = d.assetBaseUrl.replace(/\/+$/, '');
  const c = copy(d);
  const dest = destination(d);
  const isDelivery = d.fulfilment === 'delivery';

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${e(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,500&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  img { border:0; outline:none; text-decoration:none; }
  @media (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:20px !important; padding-right:20px !important; }
    .stack { display:block !important; width:100% !important; box-sizing:border-box !important; }
    .stack-box-top { border-radius:12px 12px 0 0 !important; }
    .stack-box-bottom { border-radius:0 0 12px 12px !important; }
    .stack-gap { padding-top:20px !important; }
    .h1 { font-size:28px !important; }
  }
</style>
</head>
<body bgcolor="${brand.cream}" style="margin:0;padding:0;background-color:${brand.cream};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${e(preheader)}${'&zwnj;&nbsp;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${brand.cream}" style="background-color:${brand.cream};">
<tr><td align="center" style="padding:0;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${brand.white}" style="width:600px;max-width:600px;background-color:${brand.white};">
${zigzag(asset)}
<tr><td bgcolor="${brand.charcoal}" align="center" style="background-color:${brand.charcoal};padding:24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:12px;"><img src="${asset}/logo@2x.png" width="36" height="36" alt="Mustard Seed" style="display:block;width:36px;height:36px;"></td>
<td valign="middle" style="${HEADING}color:${brand.cream};font-size:24px;font-weight:600;line-height:1;">Mustard Seed<br><span style="${BODY}color:${brand.gold};font-size:10px;font-weight:700;letter-spacing:2px;">RESTAURANT &amp; BAR</span></td>
</tr></table>
</td></tr>

<tr><td class="px" align="center" style="padding:36px 40px 8px;">
<img src="${asset}/check@2x.png" width="44" height="44" alt="Payment received" style="display:block;width:44px;height:44px;margin:0 auto;">
<p style="${BODY}margin:16px 0 8px;color:${brand.crimson};font-size:12px;font-weight:700;letter-spacing:2px;">PAYMENT RECEIVED</p>
<h1 class="h1" style="${HEADING}margin:0;color:${brand.charcoal};font-size:34px;line-height:1.15;font-weight:600;word-break:break-word;">Amedi, ${e(d.firstName)}!<br>Your order is in the kitchen.</h1>
<p style="${BODY}margin:16px auto 0;max-width:420px;color:${tints.textMuted};font-size:15px;line-height:1.6;">${c.intro}</p>
</td></tr>

<tr><td class="px" style="padding:24px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${tints.border};border-radius:12px;border-collapse:separate;">
<tr>
<td class="stack stack-box-top" width="50%" bgcolor="${brand.white}" style="background-color:${brand.white};padding:16px;border-radius:12px 0 0 12px;">
<p style="${BODY}margin:0;color:${tints.textMuted};font-size:12px;">Order number</p>
<p style="${BODY}margin:4px 0 0;color:${brand.charcoal};font-size:18px;font-weight:700;">${e(d.orderNumber)}</p>
</td>
<td class="stack stack-box-bottom" width="50%" bgcolor="${brand.charcoal}" style="background-color:${brand.charcoal};padding:16px;border-radius:0 12px 12px 0;">
<p style="${BODY}margin:0;color:${brand.gold};font-size:12px;">${c.etaLabel}</p>
<p style="${BODY}margin:4px 0 0;color:${brand.cream};font-size:18px;font-weight:700;">${e(d.etaLabel)}</p>
</td>
</tr></table>
</td></tr>

<tr><td class="px" style="padding:20px 40px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${brand.crimson}" style="background-color:${brand.crimson};border-radius:999px;">
<a href="${e(d.trackingUrl)}" style="${BODY}display:block;padding:14px 24px;color:${brand.white};font-size:16px;font-weight:700;text-decoration:none;border-radius:999px;">Track your order live</a>
</td></tr></table>
</td></tr>

<tr><td class="px" style="padding:24px 40px 28px;">${progress(d)}</td></tr>

${band()}

<tr><td class="px" style="padding:28px 40px;">
<h2 style="${HEADING}margin:0 0 8px;color:${brand.charcoal};font-size:26px;font-weight:600;">Your order</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${itemRows(d)}
${totalRow('Subtotal', formatNaira(d.subtotalKobo))}
${isDelivery ? totalRow(`Delivery (anywhere in ${e(d.deliveryArea)})`, formatNaira(d.deliveryFeeKobo)) : ''}
${totalRow('Total paid', formatNaira(d.totalKobo), true)}
</table>
<p style="${BODY}margin:12px 0 0;color:${tints.textMuted};font-size:12px;">Paid with Paystack · ${e(d.paymentChannel)} · ${e(d.paidAt)}</p>
</td></tr>

${band()}

<tr><td class="px" style="padding:28px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="stack" width="50%" valign="top" style="padding-right:16px;">
<p style="${BODY}margin:0 0 8px;color:${brand.crimson};font-size:12px;font-weight:700;letter-spacing:2px;">${dest.heading}</p>
<p style="${BODY}margin:0;color:${brand.charcoal};font-size:15px;line-height:1.6;word-break:break-word;">${dest.lines.map(e).join('<br>')}</p>
</td>
<td class="stack stack-gap" width="50%" valign="top">
<p style="${BODY}margin:0 0 8px;color:${brand.crimson};font-size:12px;font-weight:700;letter-spacing:2px;">NEED HELP?</p>
<p style="${BODY}margin:0;color:${brand.charcoal};font-size:15px;line-height:1.6;">Call or WhatsApp us on ${e(d.helpPhone)} and quote your order number.</p>
</td>
</tr></table>
</td></tr>

<tr><td bgcolor="${brand.charcoal}" align="center" class="px" style="background-color:${brand.charcoal};padding:28px 40px;">
<p style="${HEADING}margin:0 0 12px;color:${brand.gold};font-size:20px;font-style:italic;">Sosongo — thank you for eating with us.</p>
<p style="${BODY}margin:0;color:${tints.footerText};font-size:13px;line-height:1.6;">Mustard Seed Restaurant &amp; Bar · Calabar · Uyo · Since 2012<br>Open daily ${e(d.hoursLabel)} · <a href="${e(d.siteUrl)}" style="color:${tints.footerText};text-decoration:none;">${e(d.siteDomain)}</a></p>
<p style="${BODY}margin:16px 0 0;color:${tints.footerSubtle};font-size:12px;line-height:1.5;">You’re receiving this because you placed an order at ${e(d.siteDomain)} with your Google account.</p>
</td></tr>
${zigzag(asset)}
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `PAYMENT RECEIVED`,
    ``,
    `Amedi, ${d.firstName}! Your order is in the kitchen.`,
    c.intro,
    ``,
    `Order number: ${d.orderNumber}`,
    `${c.etaLabel}: ${d.etaLabel}`,
    `Track your order live: ${d.trackingUrl}`,
    ``,
    `YOUR ORDER`,
    ...d.items.map(
      (i) =>
        `${i.quantity}× ${i.name}${i.note ? ` (${i.note})` : ''} — ${formatNaira(i.lineTotalKobo)}`,
    ),
    ``,
    `Subtotal: ${formatNaira(d.subtotalKobo)}`,
    ...(isDelivery
      ? [`Delivery (anywhere in ${d.deliveryArea}): ${formatNaira(d.deliveryFeeKobo)}`]
      : []),
    `Total paid: ${formatNaira(d.totalKobo)}`,
    `Paid with Paystack · ${d.paymentChannel} · ${d.paidAt}`,
    ``,
    dest.heading,
    ...dest.lines,
    ``,
    `NEED HELP?`,
    `Call or WhatsApp us on ${d.helpPhone} and quote your order number.`,
    ``,
    `Sosongo — thank you for eating with us.`,
    `Mustard Seed Restaurant & Bar · Calabar · Uyo · Since 2012`,
    `Open daily ${d.hoursLabel} · ${d.siteDomain}`,
    ``,
    `You’re receiving this because you placed an order at ${d.siteDomain} with your Google account.`,
  ].join('\n');

  return { subject, preheader, html, text };
}
