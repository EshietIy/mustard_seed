import { existsSync } from 'node:fs';
import { emailDomain } from '../auth/auth.types';
import { validateEnv } from '../config/env.validation';
import { createSupabaseClient } from '../database/supabase.client';
import { createRootLogger } from '../logging/logger';
import type { StaffRepository } from '../staff/staff.repository';
import { SupabaseStaffRepository } from '../staff/supabase-staff.repository';
import type { StaffRecord } from '../staff/staff.types';

interface InfoLogger {
  info(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Creates (or re-activates and promotes) the first super admin. Idempotent: safe to run on
 * every deploy. Staff can only otherwise be added by an existing super admin.
 */
export async function seedSuperAdmin(
  repo: StaffRepository,
  email: string,
  log: InfoLogger,
): Promise<StaffRecord> {
  const { staff, created } = await repo.upsertSuperAdmin(email);
  log.info(
    {
      event: 'staff.seeded',
      outcome: 'SUCCESS',
      staffId: staff.id,
      role: staff.role,
      emailDomain: emailDomain(email),
      created,
    },
    created ? 'Super admin created' : 'Super admin already present; ensured active',
  );
  return staff;
}

/* istanbul ignore next -- CLI entry point, exercised manually and in BDD */
async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = validateEnv(process.env);
  if (!config.SEED_SUPER_ADMIN_EMAIL) {
    throw new Error('SEED_SUPER_ADMIN_EMAIL must be set to seed the first super admin');
  }
  const logger = createRootLogger(config);
  const repo = new SupabaseStaffRepository(createSupabaseClient(config));
  await seedSuperAdmin(repo, config.SEED_SUPER_ADMIN_EMAIL, logger);
  logger.flush();
}

/* istanbul ignore next */
if (require.main === module) {
  main().catch((err: unknown) => {
    process.stderr.write(`Seeding failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
