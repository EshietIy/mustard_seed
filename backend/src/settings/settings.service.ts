import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ORDERS_REPOSITORY, type OrdersRepository } from '../orders/orders.repository';
import {
  SETTINGS_REPOSITORY,
  type SettingsPatch,
  type SettingsRecord,
  type SettingsRepository,
} from './settings.repository';

/** "08:00:00" → "08:00" */
const hhmm = (time: string): string => time.slice(0, 5);

const shown = (r: SettingsRecord): SettingsRecord => ({
  ...r,
  opensAt: hhmm(r.opensAt),
  closesAt: hhmm(r.closesAt),
  onlineOrdersCloseAt: hhmm(r.onlineOrdersCloseAt),
});

const invalidHours = (message: string) =>
  new BadRequestException({ code: 'INVALID_HOURS', message });

/**
 * The delivery fee and opening hours (AGENT.md section 1), changed by a super admin from the
 * Settings screen. Quotes, orders, emails and the website read them fresh, so a change applies
 * to the next order. Orders already placed keep the fee they were charged. Every change is
 * audited with its old and new values.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @Inject(SETTINGS_REPOSITORY) private readonly repo: SettingsRepository,
    @Inject(ORDERS_REPOSITORY) private readonly audit: Pick<OrdersRepository, 'recordAudit'>,
  ) {}

  async get(): Promise<SettingsRecord> {
    const stored = await this.repo.get();
    // Seeded by migration; missing means the database is misconfigured.
    if (!stored) throw new Error('restaurant_info row is missing');
    return shown(stored);
  }

  async update(
    actor: AuthenticatedUser,
    body: SettingsPatch,
    correlationId: string,
  ): Promise<SettingsRecord> {
    // A validated body has every field, with undefined for those not sent.
    const patch = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined),
    ) as SettingsPatch;
    if (Object.keys(patch).length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Change at least one setting.',
      });
    }
    const current = await this.get();
    const next = { ...current, ...patch };
    // Online orders need a window: after opening, and no later than closing.
    if (next.onlineOrdersCloseAt <= next.opensAt) {
      throw invalidHours('The online order cut-off must be after opening time.');
    }
    if (next.onlineOrdersCloseAt > next.closesAt) {
      throw invalidHours('The online order cut-off can’t be after closing time.');
    }

    const keys = (Object.keys(patch) as Array<keyof SettingsPatch>).filter(
      (key) => patch[key] !== current[key],
    );
    if (keys.length === 0) return current;
    const changed = Object.fromEntries(keys.map((key) => [key, patch[key]])) as SettingsPatch;
    const saved = shown(await this.repo.update(changed));

    try {
      await this.audit.recordAudit({
        event: 'settings.updated',
        outcome: 'SUCCESS',
        userId: actor.id,
        correlationId,
        details: {
          changes: Object.fromEntries(
            keys.map((key) => [key, { from: current[key], to: saved[key] }]),
          ),
        },
      });
    } catch (err) {
      // The change is saved; a missing audit row must not turn it into an error for staff.
      this.logger.error(`Failed to record settings.updated audit: ${String(err)}`);
    }
    return saved;
  }
}
