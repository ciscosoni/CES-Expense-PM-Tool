import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
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

  /**
   * Reimbursements as Tally-importable XML payment vouchers (P7 integration).
   * One Payment voucher per non-cancelled reimbursement: debit the reimbursements
   * ledger, credit the bank ledger. Ledger names are env-overridable and must
   * match the client's Tally chart of accounts.
   */
  async reimbursementsTallyXml(): Promise<string> {
    const expenseLedger = process.env.TALLY_REIMBURSEMENT_LEDGER ?? 'Employee Reimbursements';
    const bankLedger = process.env.TALLY_BANK_LEDGER ?? 'Bank';
    const rs = await this.prisma.reimbursement.findMany({
      where: { status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { displayName: true } } },
    });

    const vouchers = rs
      .map((r) => {
        const amount = r.totalAmount.toFixed(2);
        const date = (r.paidOn ?? r.createdAt).toISOString().slice(0, 10).replace(/-/g, '');
        const ref = r.reference ?? r.id.slice(0, 8);
        const narration = esc(`Reimbursement to ${r.user.displayName} (${r.status})`);
        return `      <TALLYMESSAGE xmlns:UDF="TallyUDF">
        <VOUCHER VCHTYPE="Payment" ACTION="Create">
          <DATE>${date}</DATE>
          <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
          <VOUCHERNUMBER>${esc(ref)}</VOUCHERNUMBER>
          <NARRATION>${narration}</NARRATION>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${esc(expenseLedger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
            <AMOUNT>-${amount}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
          <ALLLEDGERENTRIES.LIST>
            <LEDGERNAME>${esc(bankLedger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>${amount}</AMOUNT>
          </ALLLEDGERENTRIES.LIST>
        </VOUCHER>
      </TALLYMESSAGE>`;
      })
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }

  /** Attendance summary for the current month — one row per engineer. */
  async attendanceSummaryXlsx(): Promise<Buffer> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const days = await this.prisma.attendanceDay.findMany({
      where: { date: { gte: monthStart, lte: monthEnd } },
      include: { user: { select: { displayName: true, email: true } } },
    });
    const byUser = new Map<
      string,
      { name: string; email: string; activeDays: number; onSiteDays: number; minutes: number; last: string }
    >();
    for (const d of days) {
      const g = byUser.get(d.userId) ?? {
        name: d.user.displayName,
        email: d.user.email,
        activeDays: 0,
        onSiteDays: 0,
        minutes: 0,
        last: '',
      };
      g.activeDays += 1;
      if (d.status === 'ON_SITE') g.onSiteDays += 1;
      g.minutes += d.onSiteMinutes;
      const dk = d.date.toISOString().slice(0, 10);
      if (dk > g.last) g.last = dk;
      byUser.set(d.userId, g);
    }
    const rows = [...byUser.values()].map((g) => ({
      name: g.name,
      email: g.email,
      activeDays: g.activeDays,
      onSiteDays: g.onSiteDays,
      onSiteHours: Math.round((g.minutes / 60) * 10) / 10,
      lastDay: g.last,
    }));
    return exportRowsToBuffer({
      sheetName: `Attendance ${monthStart.toISOString().slice(0, 7)}`,
      columns: [
        { header: 'Engineer', key: 'name', width: 26 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Active days', key: 'activeDays', width: 12 },
        { header: 'On-site days', key: 'onSiteDays', width: 12 },
        { header: 'On-site hours', key: 'onSiteHours', width: 14 },
        { header: 'Last activity', key: 'lastDay', width: 14 },
      ],
      rows,
    });
  }

  /** Travel spend — one row per closed/active trip with cost breakdown. */
  async travelSpendXlsx(): Promise<Buffer> {
    const trips = await this.prisma.trip.findMany({
      orderBy: { actualStart: 'desc' },
      include: {
        travelRequest: {
          select: {
            user: { select: { displayName: true } },
            project: { select: { code: true } },
            fromCity: { select: { name: true } },
            toCity: { select: { name: true } },
          },
        },
      },
    });
    const rows = trips.map((t) => {
      const da = t.daAmount ?? new Decimal(0);
      const total = new Decimal(t.travelActualCost)
        .plus(t.lodgingActualCost)
        .plus(t.localConveyanceActualCost)
        .plus(da);
      return {
        traveller: t.travelRequest.user.displayName,
        project: t.travelRequest.project?.code ?? '—',
        route: `${t.travelRequest.fromCity?.name ?? '?'} → ${t.travelRequest.toCity?.name ?? '?'}`,
        start: t.actualStart.toISOString().slice(0, 10),
        end: t.actualEnd ? t.actualEnd.toISOString().slice(0, 10) : '',
        travel: t.travelActualCost.toString(),
        lodging: t.lodgingActualCost.toString(),
        da: da.toString(),
        local: t.localConveyanceActualCost.toString(),
        total: total.toFixed(2),
        currency: t.daCurrency ?? 'INR',
      };
    });
    return exportRowsToBuffer({
      sheetName: 'Travel spend',
      columns: [
        { header: 'Traveller', key: 'traveller', width: 24 },
        { header: 'Project', key: 'project', width: 16 },
        { header: 'Route', key: 'route', width: 28 },
        { header: 'Start', key: 'start', width: 12 },
        { header: 'End', key: 'end', width: 12 },
        { header: 'Travel', key: 'travel', width: 14 },
        { header: 'Lodging', key: 'lodging', width: 14 },
        { header: 'DA', key: 'da', width: 14 },
        { header: 'Local', key: 'local', width: 14 },
        { header: 'Total', key: 'total', width: 16 },
        { header: 'Currency', key: 'currency', width: 10 },
      ],
      rows,
    });
  }
}

/** Minimal XML text escaping for Tally exports. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
