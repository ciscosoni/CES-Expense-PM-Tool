import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/index.js';
import { ReportsService } from './reports.service.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private send(res: Response, filename: string, buf: Buffer): void {
    res.set({
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buf.length),
    });
    res.end(buf);
  }

  @Get('portfolio-pnl.xlsx')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Portfolio P&L as .xlsx (revenue/cost/margin per project).' })
  async portfolioPnl(@Res() res: Response): Promise<void> {
    this.send(res, 'portfolio-pnl.xlsx', await this.reports.portfolioPnlXlsx());
  }

  @Get('utilization.xlsx')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Resource utilization (current month) as .xlsx.' })
  async utilization(@Res() res: Response): Promise<void> {
    this.send(res, 'utilization.xlsx', await this.reports.utilizationXlsx());
  }

  @Get('reimbursements.xlsx')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Reimbursement register as .xlsx.' })
  async reimbursements(@Res() res: Response): Promise<void> {
    this.send(res, 'reimbursements.xlsx', await this.reports.reimbursementsXlsx());
  }
}
