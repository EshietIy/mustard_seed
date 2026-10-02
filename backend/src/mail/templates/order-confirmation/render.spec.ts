import { ALLOWED_COLOURS } from './theme';
import type { OrderConfirmationData } from './order-confirmation.types';
import { renderOrderConfirmation } from './render';

const TOKEN = 'kJ8sP2xQ9vLm3nR7tY1wZ4aB6cD0eF5gH8iJ2kL4mNo';

const delivery = (overrides: Partial<OrderConfirmationData> = {}): OrderConfirmationData => ({
  firstName: 'Ekaette',
  orderNumber: '#MS-0042',
  fulfilment: 'delivery',
  etaLabel: '7:45pm',
  trackingUrl: `https://mustardseed.ng/track/${TOKEN}`,
  items: [
    { quantity: 2, name: 'Edikang Ikong', note: 'with Pounded Yam', lineTotalKobo: 900000 },
    { quantity: 1, name: 'Ekpang Nkukwo', note: 'House signature', lineTotalKobo: 400000 },
    { quantity: 2, name: 'Zobo', note: 'Fresh, no preservatives', lineTotalKobo: 160000 },
  ],
  subtotalKobo: 1460000,
  deliveryFeeKobo: 150000,
  totalKobo: 1610000,
  deliveryArea: 'Calabar',
  paymentChannel: 'Card',
  paidAt: '5 Oct 2026, 6:55pm',
  customer: { fullName: 'Ekaette Bassey', phone: '+234 803 123 4567' },
  deliveryAddress: { streetAddress: '12 Marian Road', city: 'Calabar', state: 'Cross River State' },
  pickupAddress: null,
  helpPhone: '+234 800 000 0000',
  hoursLabel: '8am – 11pm',
  siteUrl: 'https://mustardseed.ng',
  siteDomain: 'mustardseed.ng',
  assetBaseUrl: 'https://mustardseed.ng/email',
  ...overrides,
});

const pickup = (): OrderConfirmationData =>
  delivery({
    fulfilment: 'pickup',
    deliveryFeeKobo: 0,
    totalKobo: 1460000,
    etaLabel: '7:25pm',
    deliveryAddress: null,
    pickupAddress: {
      name: 'Mustard Seed Restaurant & Bar',
      streetAddress: '[CALABAR ADDRESS]',
      city: 'Calabar',
      state: 'Cross River State',
    },
  });

/** Visible text of the HTML (tags stripped, entities decoded enough for assertions). */
const visible = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/&nbsp;|&zwnj;|&#847;/g, ' ')
    .replace(/\s+/g, ' ');

describe('order confirmation email', () => {
  it('has the agreed subject and preview text', () => {
    const email = renderOrderConfirmation(delivery());
    expect(email.subject).toBe('Payment received — your Mustard Seed order #MS-0042');
    expect(email.preheader).toBe('Payment received — the kitchen has your order #MS-0042.');
    expect(email.html).toContain('Payment received — the kitchen has your order #MS-0042.');
  });

  it('renders every field of a delivery order', () => {
    const text = visible(renderOrderConfirmation(delivery()).html);
    for (const expected of [
      'PAYMENT RECEIVED',
      'Amedi, Ekaette! Your order is in the kitchen.',
      'Your food will be handed to our rider as soon as it’s ready.',
      'Order number #MS-0042',
      'Estimated arrival 7:45pm',
      'Track your order live',
      'Confirmed',
      'Preparing',
      'Ready',
      'Delivered',
      'Your order',
      '2× Edikang Ikong with Pounded Yam ₦9,000',
      '1× Ekpang Nkukwo House signature ₦4,000',
      '2× Zobo Fresh, no preservatives ₦1,600',
      'Subtotal ₦14,600',
      'Delivery (anywhere in Calabar) ₦1,500',
      'Total paid ₦16,100',
      'Paid with Paystack · Card · 5 Oct 2026, 6:55pm',
      'DELIVERING TO Ekaette Bassey 12 Marian Road Calabar, Cross River State +234 803 123 4567',
      'NEED HELP? Call or WhatsApp us on +234 800 000 0000 and quote your order number.',
      'Sosongo — thank you for eating with us.',
      'Mustard Seed Restaurant & Bar · Calabar · Uyo · Since 2012',
      'Open daily 8am – 11pm · mustardseed.ng',
      'You’re receiving this because you placed an order at mustardseed.ng with your Google account.',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('renders the pickup variant: no delivery row, PICK UP AT, ready-by time, Collected', () => {
    const text = visible(renderOrderConfirmation(pickup()).html);
    expect(text).not.toContain('Delivery (anywhere in Calabar)');
    expect(text).not.toContain('DELIVERING TO');
    expect(text).not.toContain('rider');
    expect(text).not.toContain('Delivered');
    expect(text).toContain(
      'PICK UP AT Mustard Seed Restaurant & Bar [CALABAR ADDRESS] Calabar, Cross River State',
    );
    expect(text).toContain('Ready for pickup by 7:25pm');
    expect(text).toContain('Collected');
    expect(text).toContain('We’ll have it ready for you to collect.');
    expect(text).toContain('Total paid ₦14,600');
  });

  it('omits the note line when an item has no variant or note', () => {
    const email = renderOrderConfirmation(
      delivery({
        items: [{ quantity: 1, name: 'Afang Soup', note: null, lineTotalKobo: 400000 }],
        subtotalKobo: 400000,
        totalKobo: 550000,
      }),
    );
    expect(email.html).not.toContain('data-note');
    expect(visible(email.html)).toContain('1× Afang Soup ₦4,000');
  });

  it('leaves no unreplaced template placeholders', () => {
    const { html, text } = renderOrderConfirmation(delivery());
    for (const out of [html, text]) {
      expect(out).not.toMatch(
        /\[(PRICE|FIRST NAME|SUBTOTAL|TOTAL|ETA[^\]]*|FULL NAME|STREET ADDRESS|PHONE|DATE, TIME|CARD \/ BANK TRANSFER)\]/,
      );
      expect(out).not.toMatch(/\{\{|\}\}|\$\{|undefined|null|NaN/);
    }
  });

  it('keeps an unsupplied business contact as its configured placeholder', () => {
    const text = visible(
      renderOrderConfirmation(delivery({ helpPhone: '[PHONE / WHATSAPP]' })).html,
    );
    expect(text).toContain('Call or WhatsApp us on [PHONE / WHATSAPP]');
  });

  it('shows the stored total, formatted from kobo with thousands separators', () => {
    const email = renderOrderConfirmation(delivery({ totalKobo: 123456789 }));
    expect(visible(email.html)).toContain('Total paid ₦1,234,567.89');
    expect(email.text).toContain('Total paid: ₦1,234,567.89');
  });

  it('escapes customer-supplied values', () => {
    const evil = '<script>alert("x")</script>';
    const email = renderOrderConfirmation(
      delivery({
        firstName: evil,
        customer: { fullName: `Ada <img src=x onerror=alert(1)>`, phone: '"><b>' },
        deliveryAddress: {
          streetAddress: `12 Road & "Co" <i>`,
          city: 'Calabar',
          state: 'Cross River State',
        },
        items: [
          { quantity: 1, name: '<b>Soup</b>', note: '<a href="evil">x</a>', lineTotalKobo: 1 },
        ],
      }),
    );
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).not.toContain('<b>Soup</b>');
    expect(email.html).not.toContain('href="evil"');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('12 Road &amp; &quot;Co&quot; &lt;i&gt;');
  });

  it('links to tracking with an absolute https URL and the unguessable token, never the order number', () => {
    const { html } = renderOrderConfirmation(delivery());
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const track = hrefs.find((h) => h?.includes('/track/'));
    expect(track).toBe(`https://mustardseed.ng/track/${TOKEN}`);
    expect(track).not.toContain('0042');
    expect(hrefs.every((h) => h?.startsWith('https://'))).toBe(true);
  });

  it('has a plain-text version with the essentials', () => {
    const { text } = renderOrderConfirmation(delivery());
    expect(text).toContain('Amedi, Ekaette! Your order is in the kitchen.');
    expect(text).toContain('Order number: #MS-0042');
    expect(text).toContain('Estimated arrival: 7:45pm');
    expect(text).toContain('2× Edikang Ikong (with Pounded Yam) — ₦9,000');
    expect(text).toContain('Total paid: ₦16,100');
    expect(text).toContain(`Track your order live: https://mustardseed.ng/track/${TOKEN}`);
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('stays well under the Gmail clipping limit, even for long orders', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      quantity: 1,
      name: `Dish number ${i + 1}`,
      note: 'House signature',
      lineTotalKobo: 100000,
    }));
    const { html } = renderOrderConfirmation(delivery({ items }));
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(100 * 1024);
    expect(Buffer.byteLength(renderOrderConfirmation(delivery()).html, 'utf8')).toBeLessThan(
      40 * 1024,
    );
  });

  it('gives every image alt text, explicit size, an absolute https URL and a 2x version', () => {
    const { html } = renderOrderConfirmation(delivery());
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length).toBeGreaterThanOrEqual(4);
    for (const img of imgs) {
      expect(img).toMatch(/\salt="[^"]*"/);
      expect(img).toMatch(/\swidth="\d+"/);
      expect(img).toMatch(/\sheight="\d+"/);
      expect(img).toMatch(/\ssrc="https:\/\/mustardseed\.ng\/email\/[\w-]+@2x\.png"/);
    }
    expect(html).toMatch(/alt="Mustard Seed"/);
    expect(html).toMatch(/alt="Payment received"/);
  });

  it('uses only email-theme colours', () => {
    const { html } = renderOrderConfirmation(delivery());
    const used = new Set([...html.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toUpperCase()));
    for (const colour of used) expect(ALLOWED_COLOURS).toContain(colour);
    expect(html).not.toMatch(/rgba?\(/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3}\b/);
  });

  it('keeps colours readable with images blocked (background colours behind images)', () => {
    const { html } = renderOrderConfirmation(delivery());
    expect(html).toMatch(/bgcolor="#1E221E"/i);
    expect(html).toMatch(/bgcolor="#C5A059"/i);
  });

  it('declares the brand fonts with safe fallbacks and a 600px layout', () => {
    const { html } = renderOrderConfirmation(delivery());
    expect(html).toContain("'Cormorant Garamond', Georgia, 'Times New Roman', serif");
    expect(html).toContain("'Plus Jakarta Sans', Arial, Helvetica, sans-serif");
    expect(html).toMatch(/max-width:\s*600px/);
  });

  it('renders a long order with long names consistently (snapshot)', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      quantity: (i % 3) + 1,
      name:
        i === 0
          ? 'Edikang Ikong with extra periwinkle, kpomo, stockfish and assorted meat (large family pot)'
          : `Dish ${i + 1}`,
      note: i % 2 ? null : 'House signature',
      lineTotalKobo: 123400 * ((i % 3) + 1),
    }));
    const { html, text } = renderOrderConfirmation(
      delivery({
        items,
        customer: {
          fullName: 'Ekaette Abasiama Bassey-Okon Etim-Inyang',
          phone: '+234 803 123 4567',
        },
      }),
    );
    expect((html.match(/data-line=/g) ?? []).length).toBe(12);
    expect(html).toMatch(/word-break:\s*break-word/);
    expect({ html, text }).toMatchSnapshot();
  });
});
