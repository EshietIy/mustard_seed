import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Roles } from '../auth/guards/roles.decorator';
import { SalesReportDto, SalesReportQueryDto } from './reports.dto';
import { ReportsService, type SalesReport } from './reports.service';

/** Sales reports for planning (AGENT.md 3.4: reports are super_admin only). */
@ApiTags('admin')
@ApiCookieAuth()
@ApiForbiddenResponse({ description: 'Not allowed for this role' })
@Roles('super_admin')
@Controller({ path: 'admin/reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @ApiOkResponse({ type: SalesReportDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_FAILED or INVALID_DATE_RANGE' })
  async sales(@Query() query: SalesReportQueryDto, @Req() req: Request): Promise<SalesReport> {
    const report = await this.reports.sales(query.from, query.to);
    req.log.info(
      {
        event: 'report.sales_viewed',
        outcome: 'SUCCESS',
        actorUserId: (req.user as AuthenticatedUser).id,
        from: query.from,
        to: query.to,
        orders: report.summary.orders,
      },
      'Sales report viewed',
    );
    return report;
  }
}
