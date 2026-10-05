import type { AppSessionsRepository, RotateOutcome } from './app-sessions.repository';

interface Row {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** In-memory AppSessionsRepository for unit tests, with the same rules as the SQL function. */
export class InMemoryAppSessionsRepository implements AppSessionsRepository {
  readonly rows: Row[] = [];

  create(input: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }) {
    this.rows.push({ ...input, usedAt: null, revokedAt: null });
    return Promise.resolve();
  }

  rotate(
    tokenHash: string,
    newTokenHash: string,
    newExpiresAt: Date,
    now: Date,
  ): Promise<{ outcome: RotateOutcome; userId: string | null }> {
    const row = this.rows.find((r) => r.tokenHash === tokenHash);
    const result = (outcome: RotateOutcome) =>
      Promise.resolve({ outcome, userId: row?.userId ?? null });
    if (!row) return result('unknown');
    if (row.revokedAt) return result('revoked');
    if (row.usedAt) {
      for (const r of this.rows) if (r.familyId === row.familyId) r.revokedAt ??= now;
      return result('reused');
    }
    if (row.expiresAt <= now) return result('expired');
    row.usedAt = now;
    this.rows.push({
      userId: row.userId,
      familyId: row.familyId,
      tokenHash: newTokenHash,
      expiresAt: newExpiresAt,
      usedAt: null,
      revokedAt: null,
    });
    return result('rotated');
  }

  revokeFamily(tokenHash: string, now: Date): Promise<void> {
    const family = this.rows.find((r) => r.tokenHash === tokenHash)?.familyId;
    for (const r of this.rows) if (family && r.familyId === family) r.revokedAt ??= now;
    return Promise.resolve();
  }
}
