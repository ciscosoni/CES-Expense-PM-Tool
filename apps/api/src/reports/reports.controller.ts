import { Controller, Get, Query, Res } from '@nestjs/common';
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

  @Get('attendance.xlsx')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Current-month attendance summary as .xlsx.' })
  async attendance(@Res() res: Response): Promise<void> {
    this.send(res, 'attendance.xlsx', await this.reports.attendanceSummaryXlsx());
  }

  @Get('travel-spend.xlsx')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Travel spend (per trip, with cost breakdown) as .xlsx.' })
  async travelSpend(@Res() res: Response): Promise<void> {
    this.send(res, 'travel-spend.xlsx', await this.reports.travelSpendXlsx());
  }

  @Get('payslips.xlsx')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Payslip register for a period (?period=YYYY-MM, default current month) as .xlsx.' })
  async payslips(@Res() res: Response, @Query('period') period?: string): Promise<void> {
    this.send(res, 'payslips.xlsx', await this.reports.payslipRegisterXlsx(period));
  }

  @Get('reimbursements-tally.xml')
  @Roles('ADMIN', 'FINANCE')
  @ApiOperation({ summary: 'Reimbursements as Tally-importable XML payment vouchers.' })
  async reimbursementsTally(@Res() res: Response): Promise<void> {
    const xml = await this.reports.reimbursementsTallyXml();
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="reimbursements-tally.xml"',
    });
    res.end(xml);
  }
}
