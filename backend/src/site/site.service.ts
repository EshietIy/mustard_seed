import { Inject, Injectable } from '@nestjs/common';
import type { SiteInfoDto } from './site.dto';
import { SITE_REPOSITORY, type SiteRepository } from './site.repository';

/** "08:00:00" → "08:00" */
const hhmm = (time: string): string => time.slice(0, 5);

@Injectable()
export class SiteService {
  constructor(@Inject(SITE_REPOSITORY) private readonly repo: SiteRepository) {}

  async getSiteInfo(): Promise<SiteInfoDto> {
    const [info, branches] = await Promise.all([
      this.repo.getRestaurantInfo(),
      this.repo.listBranches(),
    ]);
    if (!info) {
      // Seeded by migration; missing means the database is misconfigured.
      throw new Error('restaurant_info row is missing');
    }
    return {
      name: info.name,
      phoneWhatsapp: info.phoneWhatsapp,
      hours: {
        opensAt: hhmm(info.opensAt),
        closesAt: hhmm(info.closesAt),
        onlineOrdersCloseAt: hhmm(info.onlineOrdersCloseAt),
        timezone: info.timezone,
      },
      delivery: { feeKobo: info.deliveryFeeKobo, area: info.deliveryArea },
      branches,
    };
  }
}
