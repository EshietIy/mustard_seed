import type { BranchRecord, RestaurantInfoRecord } from './site.types';

export const SITE_REPOSITORY = Symbol('SITE_REPOSITORY');

export interface SiteRepository {
  getRestaurantInfo(): Promise<RestaurantInfoRecord | null>;
  listBranches(): Promise<BranchRecord[]>;
}
