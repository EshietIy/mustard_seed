import { Module } from '@nestjs/common';
import { SupabaseUsersRepository } from './supabase-users.repository';
import { USERS_REPOSITORY } from './users.repository';

@Module({
  providers: [{ provide: USERS_REPOSITORY, useClass: SupabaseUsersRepository }],
  exports: [USERS_REPOSITORY],
})
export class UsersModule {}
