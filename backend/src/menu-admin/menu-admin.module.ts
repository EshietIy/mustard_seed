import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { APP_CONFIG } from '../config/app-config.token';
import type { AppConfig } from '../config/env.validation';
import { ImagesModule } from '../images/images.module';
import { OrdersModule } from '../orders/orders.module';
import { MenuAdminController } from './menu-admin.controller';
import { MENU_ADMIN_REPOSITORY } from './menu-admin.repository';
import { MenuAdminService } from './menu-admin.service';
import { MenuImagesController } from './menu-images.controller';
import { MenuImagesService } from './menu-images.service';
import { SupabaseMenuAdminRepository } from './supabase-menu-admin.repository';

@Module({
  imports: [
    OrdersModule,
    ImagesModule,
    // No storage or dest: multer keeps uploads in memory, never on disk. They stop at
    // MAX_IMAGE_UPLOAD_MB with a 413.
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        limits: { fileSize: config.MAX_IMAGE_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 },
      }),
    }),
  ],
  controllers: [MenuAdminController, MenuImagesController],
  providers: [
    MenuAdminService,
    MenuImagesService,
    { provide: MENU_ADMIN_REPOSITORY, useClass: SupabaseMenuAdminRepository },
  ],
})
export class MenuAdminModule {}
