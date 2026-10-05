import { Inject, Injectable } from '@nestjs/common';
import { publicImageUrls } from '../common/image-urls';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import type { MenuDto, MenuItemDto } from './menu.dto';
import { MENU_REPOSITORY, type MenuRepository } from './menu.repository';
import { MENU_CATEGORIES, type MenuItemRecord } from './menu.types';

@Injectable()
export class MenuService {
  constructor(
    @Inject(MENU_REPOSITORY) private readonly repo: MenuRepository,
    @Inject(APP_CONFIG)
    private readonly config: Pick<AppConfig, 'SUPABASE_URL' | 'SUPABASE_STORAGE_BUCKET'>,
  ) {}

  async getMenu(): Promise<MenuDto> {
    const items = [...(await this.repo.listItems())].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    return {
      categories: MENU_CATEGORIES.map(({ id, label }) => ({
        id,
        label,
        items: items.filter((i) => i.category === id).map((i) => this.toDto(i)),
      })),
    };
  }

  private toDto(item: MenuItemRecord): MenuItemDto {
    return {
      id: item.id,
      slug: item.slug,
      name: item.name,
      description: item.description,
      priceKobo: item.priceKobo,
      isHouseSignature: item.isHouseSignature,
      isFreshJuice: item.isFreshJuice,
      isAvailable: item.isAvailable,
      image: publicImageUrls(this.config, item.imagePath),
      optionGroups: item.optionGroups,
    };
  }
}
