export const SIMULATOR_STORE = Symbol('SIMULATOR_STORE');

export type SimStatus = 'abandoned' | 'ongoing' | 'success' | 'failed';

export interface SimTransaction {
  reference: string;
  accessCode: string;
  email: string;
  amountKobo: number;
  currency: string;
  /** Like real Paystack, a new transaction reports 'abandoned' until the customer pays. */
  status: SimStatus;
  channel: string | null;
  callbackUrl: string | null;
  metadata: Record<string, unknown>;
  paidAt: string | null;
  createdAt: string;
}

export interface SimulatorStore {
  /** Returns false if the reference already exists. */
  create(tx: SimTransaction): Promise<boolean>;
  findByReference(reference: string): Promise<SimTransaction | null>;
  findByAccessCode(accessCode: string): Promise<SimTransaction | null>;
  update(
    reference: string,
    patch: Partial<Pick<SimTransaction, 'status' | 'channel' | 'paidAt'>>,
  ): Promise<SimTransaction | null>;
  reset(): Promise<void>;
}
