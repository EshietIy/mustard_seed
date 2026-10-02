export interface OrderConfirmationLine {
  quantity: number;
  name: string;
  /** e.g. a chosen variant, "House signature" or "Fresh, no preservatives"; null = no line. */
  note: string | null;
  lineTotalKobo: number;
}

/** Everything the confirmation email shows. Built from the paid order by OrderEmailBuilder. */
export interface OrderConfirmationData {
  firstName: string;
  orderNumber: string;
  fulfilment: 'delivery' | 'pickup';
  /** Clock time in WAT, e.g. "7:45pm". */
  etaLabel: string;
  /** Absolute https link with the order's unguessable tracking token. */
  trackingUrl: string;
  items: OrderConfirmationLine[];
  subtotalKobo: number;
  deliveryFeeKobo: number;
  totalKobo: number;
  deliveryArea: string;
  /** e.g. "Card" or "Bank transfer". */
  paymentChannel: string;
  /** e.g. "5 Oct 2026, 12:05pm" (WAT). */
  paidAt: string;
  customer: { fullName: string; phone: string };
  /** Delivery only. */
  deliveryAddress: { streetAddress: string; city: string; state: string } | null;
  /** Pickup only: the branch address (or its placeholder). */
  pickupAddress: { name: string; streetAddress: string; city: string; state: string } | null;
  /** Call/WhatsApp number, or its placeholder until supplied. */
  helpPhone: string;
  /** e.g. "8am – 11pm". */
  hoursLabel: string;
  siteUrl: string;
  siteDomain: string;
  /** Where email images are hosted (the site, not Supabase), e.g. https://mustardseed.ng/email */
  assetBaseUrl: string;
}

export interface RenderedEmail {
  subject: string;
  preheader: string;
  html: string;
  text: string;
}
