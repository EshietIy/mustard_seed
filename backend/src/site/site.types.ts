export interface RestaurantInfoRecord {
  name: string;
  /** null until supplied: rendered as the [PHONE / WHATSAPP] placeholder. */
  phoneWhatsapp: string | null;
  /** Postgres `time` values, e.g. "08:00:00". */
  opensAt: string;
  closesAt: string;
  onlineOrdersCloseAt: string;
  timezone: string;
  deliveryFeeKobo: number;
  deliveryArea: string;
}

export interface BranchRecord {
  id: string;
  city: string;
  state: string;
  role: 'headquarters' | 'branch';
  /** null until supplied: rendered as a placeholder such as [CALABAR ADDRESS]. */
  streetAddress: string | null;
  onlineOrderingEnabled: boolean;
}
