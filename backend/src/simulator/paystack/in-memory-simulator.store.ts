import type { SimTransaction, SimulatorStore } from './simulator.store';

/** In-memory simulator state, for unit tests. */
export class InMemorySimulatorStore implements SimulatorStore {
  private readonly rows = new Map<string, SimTransaction>();

  create(tx: SimTransaction): Promise<boolean> {
    if (this.rows.has(tx.reference)) return Promise.resolve(false);
    this.rows.set(tx.reference, { ...tx });
    return Promise.resolve(true);
  }

  findByReference(reference: string): Promise<SimTransaction | null> {
    return Promise.resolve(this.rows.get(reference) ?? null);
  }

  findByAccessCode(accessCode: string): Promise<SimTransaction | null> {
    return Promise.resolve(
      [...this.rows.values()].find((t) => t.accessCode === accessCode) ?? null,
    );
  }

  update(
    reference: string,
    patch: Partial<Pick<SimTransaction, 'status' | 'channel' | 'paidAt'>>,
  ): Promise<SimTransaction | null> {
    const row = this.rows.get(reference);
    if (!row) return Promise.resolve(null);
    Object.assign(row, patch);
    return Promise.resolve({ ...row });
  }

  reset(): Promise<void> {
    this.rows.clear();
    return Promise.resolve();
  }
}
