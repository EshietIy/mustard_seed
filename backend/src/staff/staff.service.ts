import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { StaffRole } from '../auth/auth.types';
import type { StaffDto } from './staff.dto';
import {
  STAFF_REPOSITORY,
  StaffAlreadyExistsError,
  type StaffRepository,
} from './staff.repository';
import type { StaffRecord } from './staff.types';

const toDto = (s: StaffRecord): StaffDto => ({
  id: s.id,
  email: s.email,
  role: s.role,
  isActive: s.isActive,
  createdAt: s.createdAt,
  deactivatedAt: s.deactivatedAt,
});

@Injectable()
export class StaffService {
  constructor(@Inject(STAFF_REPOSITORY) private readonly repo: StaffRepository) {}

  async list(): Promise<StaffDto[]> {
    return (await this.repo.list()).map(toDto);
  }

  async create(
    actor: { id: string },
    input: { email: string; role: StaffRole },
  ): Promise<StaffDto> {
    try {
      return toDto(await this.repo.create({ ...input, createdBy: actor.id }));
    } catch (err) {
      if (err instanceof StaffAlreadyExistsError) {
        throw new ConflictException({
          code: 'STAFF_EXISTS',
          message: 'That email is already on the staff list.',
        });
      }
      throw err;
    }
  }

  async update(
    id: string,
    patch: { role?: StaffRole; isActive?: boolean },
  ): Promise<{ before: StaffDto; after: StaffDto }> {
    const current = await this.repo.findById(id);
    if (!current) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'We could not find that staff member.',
      });
    }
    const losesSuperAdmin =
      current.isActive &&
      current.role === 'super_admin' &&
      (patch.isActive === false || (patch.role !== undefined && patch.role !== 'super_admin'));
    if (losesSuperAdmin && (await this.repo.countActiveSuperAdmins()) <= 1) {
      // Never leave the restaurant without anyone who can manage staff.
      throw new ConflictException({
        code: 'LAST_SUPER_ADMIN',
        message: 'There must always be at least one active super admin.',
      });
    }
    const updated = await this.repo.update(id, patch);
    if (!updated) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'We could not find that staff member.',
      });
    }
    return { before: toDto(current), after: toDto(updated) };
  }
}
