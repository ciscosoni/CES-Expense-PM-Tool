import { Injectable } from '@nestjs/common';
import { exportRowsToBuffer } from '@ces/excel';
import { PrismaService } from '../prisma.service.js';
import { DashboardsService } from '../dashboards/dashboards.service.js';

/**
 * P7 reporting. Every report is .xlsx (non-negotiable #6) via @ces/excel, built
 * from the same live computations the dashboards use — so an exported number
 * always matches what leadership sees on screen.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboards: DashboardsService,
  ) {}

  /** Portfolio P&L — one row per project, with revenue/cost/GP/margin. */
  async portfolioPnlXlsx(): Promise<Buffer> {
    const rows = await this.dashboards.portfolio();
    return exportRowsToBuffer({
      sheetName: 'Portfolio P&L',
      columns: [
        { header: 'Code', key: 'code', width: 18 },
        { header: 'Project', key: 'name', width: 34 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Currency', key: 'contractCurrency', width: 10 },
        { header: 'Contract value', key: 'contractValue', width: 16 },
        { header: 'Revenue', key: 'revenue', width: 16 },
        { header: 'Cost', key: 'cost', width: 16 },
        { header: 'Gross profit', key: 'grossProfit', width: 16 },
        {
          header: 'Margin %',
          key: 'marginPercent',
          width: 12,
          format: (v) => (v == null ? '—' : (v as number)),
        },
      ],
      rows,
    });
  }

  /** Resource utilization — one row per engineer for the current month. */
  async utilizationXlsx(): Promise<Buffer> {
    const util = await this.dashboards.utilization();
    const rows = util.map((u) => ({
      name: u.user.displayName,
      email: u.user.email,
      totalAllocation: u.totalAllocation,
      conflict: u.conflict ? 'OVERBOOKED' : '',
      projects: u.allocations.map((a) => `${a.projectCode} (${a.percent}%)`).join(', '),
    }));
    return exportRowsToBuffer({
      sheetName: 'Utilization',
      columns: [
        { header: 'Engineer', key: 'name', width: 26 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Allocation %', key: 'totalAllocation', width: 14 },
        { header: 'Flag', key: 'conflict', width: 14 },
        { header: 'Projects', key: 'projects', width: 50 },
      ],
      rows,
    });
  }

  /** Reimbursement register — one row per reimbursement batch. */
  async reimbursementsXlsx(): Promise<Buffer> {
    const rs = await this.prisma.reimbursement.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        user: { select: { displayName: true, email: true } },
        _count: { select: { expenses: true } },
      },
    });
    const rows = rs.map((r) => ({
      reference: r.reference ?? r.id.slice(0, 8),
      user: r.user.displayName,
      email: r.user.email,
      amount: r.totalAmount.toString(),
      currency: r.currency,
      status: r.status,
      expenses: r._count.expenses,
      paidOn: r.paidOn ? r.paidOn.toISOString().slice(0, 10) : '',
    }));
    return exportRowsToBuffer({
      sheetName: 'Reimbursements',
      columns: [
        { header: 'Reference', key: 'reference', width: 18 },
        { header: 'Employee', key: 'user', width: 26 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Amount', key: 'amount', width: 16 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Expenses', key: 'expenses', width: 10 },
        { header: 'Paid on', key: 'paidOn', width: 14 },
      ],
      rows,
    });
  }
}
