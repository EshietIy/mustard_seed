import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ROLES_KEY } from '../auth/guards/roles.decorator';
import { ReportsController } from './reports.controller';
import type { ReportsService, SalesReport } from './reports.service';

const admin = { id: 'admin-1', role: 'super_admin' } as AuthenticatedUser;
const report = { summary: { orders: 7 } } as SalesReport;

describe('ReportsController', () => {
  it('is for super admins only', () => {
    expect(new Reflector().get<string[]>(ROLES_KEY, ReportsController)).toEqual(['super_admin']);
  });

  it('returns the sales report and logs who viewed which period', async () => {
    const service = { sales: jest.fn().mockResolvedValue(report) } as unknown as ReportsService;
    const log = { info: jest.fn() };
    const req = { log, user: admin } as unknown as Request;
    const controller = new ReportsController(service);
    await expect(controller.sales({ from: '2026-10-01', to: '2026-10-31' }, req)).resolves.toBe(
      report,
    );
    expect(service.sales).toHaveBeenCalledWith('2026-10-01', '2026-10-31');
    expect(log.info).toHaveBeenCalledWith(
      {
        event: 'report.sales_viewed',
        outcome: 'SUCCESS',
        actorUserId: 'admin-1',
        from: '2026-10-01',
        to: '2026-10-31',
        orders: 7,
      },
      expect.any(String),
    );
  });
});
