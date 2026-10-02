import { randomUUID } from 'node:crypto';
import type { GoogleIdentity } from '../auth/google/google-id-token.verifier';
import type { UsersRepository } from './users.repository';
import type { UserRecord } from './users.types';

/** In-memory UsersRepository for unit tests. */
export class InMemoryUsersRepository implements UsersRepository {
  private readonly users = new Map<string, UserRecord>();

  all(): UserRecord[] {
    return [...this.users.values()];
  }

  upsertFromGoogle(identity: GoogleIdentity): Promise<{ user: UserRecord; created: boolean }> {
    const existing = this.all().find((u) => u.googleSub === identity.sub);
    const user: UserRecord = {
      id: existing?.id ?? randomUUID(),
      googleSub: identity.sub,
      email: identity.email,
      firstName: identity.firstName,
      fullName: identity.fullName,
      avatarUrl: identity.avatarUrl,
    };
    this.users.set(user.id, user);
    return Promise.resolve({ user, created: !existing });
  }

  findById(id: string): Promise<UserRecord | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }
}
