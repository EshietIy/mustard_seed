export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Normalised transaction states. 'ongoing' covers Paystack's pending/processing/queued. */
export type GatewayStatus = 'success' | 'failed' | 'abandoned' | 'ongoing';

export interface InitializeInput {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}

export interface InitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export type VerifyResult =
  | { found: false; reference: string }
  | {
      found: true;
      reference: string;
      status: GatewayStatus;
      amountKobo: number;
      currency: string;
      channel: string | null;
      paidAt: string | null;
    };

/**
 * The only way business logic talks to a payment provider (AGENT.md §10). The Paystack
 * implementation serves both real Paystack and the built-in simulator; only the base URL and
 * key differ.
 */
export interface PaymentGateway {
  initialize(input: InitializeInput): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
}
