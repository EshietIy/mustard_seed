import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { REPORTS_REPOSITORY } from './reports.repository';
import { ReportsService } from './reports.service';
import { SupabaseReportsRepository } from './supabase-reports.repository';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, { provide: REPORTS_REPOSITORY, useClass: SupabaseReportsRepository }],
})
export class ReportsModule {}
