import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { STAFF_REPOSITORY } from './staff.repository';
import { StaffService } from './staff.service';
import { SupabaseStaffRepository } from './supabase-staff.repository';

@Module({
  controllers: [StaffController],
  providers: [StaffService, { provide: STAFF_REPOSITORY, useClass: SupabaseStaffRepository }],
  exports: [STAFF_REPOSITORY],
})
export class StaffModule {}
