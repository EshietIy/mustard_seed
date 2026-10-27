export const SETTINGS_REPOSITORY = Symbol('SETTINGS_REPOSITORY');

/** The restaurant-wide settings a super admin can see (the single restaurant_info row). */
export interface SettingsRecord {
  deliveryFeeKobo: number;
  /** Read-only: delivery is Calabar only (AGENT.md section 1). */
  deliveryArea: string;
  /** Postgres `time` values, e.g. "08:00:00" (written as "HH:MM"). */
  opensAt: string;
  closesAt: string;
  onlineOrdersCloseAt: string;
  /** Read-only: hours are WAT. */
  timezone: string;
}

export type SettingsPatch = Partial<
  Pick<SettingsRecord, 'deliveryFeeKobo' | 'opensAt' | 'closesAt' | 'onlineOrdersCloseAt'>
>;

export interface SettingsRepository {
  get(): Promise<SettingsRecord | null>;
  update(patch: SettingsPatch): Promise<SettingsRecord>;
}
