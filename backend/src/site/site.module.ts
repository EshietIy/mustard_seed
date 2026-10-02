import { Module } from '@nestjs/common';
import { SiteController } from './site.controller';
import { SITE_REPOSITORY } from './site.repository';
import { SiteService } from './site.service';
import { SupabaseSiteRepository } from './supabase-site.repository';

@Module({
  controllers: [SiteController],
  exports: [SITE_REPOSITORY],
  providers: [SiteService, { provide: SITE_REPOSITORY, useClass: SupabaseSiteRepository }],
})
export class SiteModule {}
