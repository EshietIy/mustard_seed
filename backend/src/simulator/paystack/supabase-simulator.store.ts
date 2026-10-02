import { Inject, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../database/supabase.token';
import type { SimStatus, SimTransaction, SimulatorStore } from './simulator.store';

const TABLE = 'simulator_paystack_transactions';

interface Row {
  reference: string;
  access_code: string;
  email: string;
  amount_kobo: number;
  currency: string;
  status: SimStatus;
  channel: string | null;
  callback_url: string | null;
  metadata: Record<string, unknown>;
  paid_at: string | null;
  created_at: string;
}

const toTx = (r: Row): SimTransaction => ({
  reference: r.reference,
  accessCode: r.access_code,
  email: r.email,
  amountKobo: r.amount_kobo,
  currency: r.currency,
  status: r.status,
  channel: r.channel,
  callbackUrl: r.callback_url,
  metadata: r.metadata,
  paidAt: r.paid_at,
  createdAt: r.created_at,
});

/** Simulator state in the dev/test-only table (supabase/dev/simulator_paystack.sql). */
@Injectable()
export class SupabaseSimulatorStore implements SimulatorStore {
  constructor(@Inject(SUPABASE_CLIENT) private readonly db: SupabaseClient) {}

  async create(tx: SimTransaction): Promise<boolean> {
    const { error } = await this.db.from(TABLE).insert({
      reference: tx.reference,
      access_code: tx.accessCode,
      email: tx.email,
      amount_kobo: tx.amountKobo,
      currency: tx.currency,
      status: tx.status,
      channel: tx.channel,
      callback_url: tx.callbackUrl,
      metadata: tx.metadata,
      paid_at: tx.paidAt,
    });
    if (error?.code === '23505') return false;
    if (error) throw new Error(`simulator store: ${error.message}`);
    return true;
  }

  findByReference(reference: string): Promise<SimTransaction | null> {
    return this.findOne('reference', reference);
  }

  findByAccessCode(accessCode: string): Promise<SimTransaction | null> {
    return this.findOne('access_code', accessCode);
  }

  async update(
    reference: string,
    patch: Partial<Pick<SimTransaction, 'status' | 'channel' | 'paidAt'>>,
  ): Promise<SimTransaction | null> {
    const changes: Record<string, unknown> = {};
    if (patch.status !== undefined) changes.status = patch.status;
    if (patch.channel !== undefined) changes.channel = patch.channel;
    if (patch.paidAt !== undefined) changes.paid_at = patch.paidAt;
    const { data, error } = await this.db
      .from(TABLE)
      .update(changes)
      .eq('reference', reference)
      .select('*')
      .maybeSingle<Row>();
    if (error) throw new Error(`simulator store: ${error.message}`);
    return data ? toTx(data) : null;
  }

  async reset(): Promise<void> {
    const { error } = await this.db.from(TABLE).delete().not('reference', 'is', null);
    if (error) throw new Error(`simulator store: ${error.message}`);
  }

  private async findOne(column: string, value: string): Promise<SimTransaction | null> {
    const { data, error } = await this.db
      .from(TABLE)
      .select('*')
      .eq(column, value)
      .maybeSingle<Row>();
    if (error) throw new Error(`simulator store: ${error.message}`);
    return data ? toTx(data) : null;
  }
}
