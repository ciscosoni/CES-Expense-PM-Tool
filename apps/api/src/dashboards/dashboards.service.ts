import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { calculatePnl, type EffectiveCostRate, type TimeLogEntry } from '@ces/pnl-engine';
import { PrismaService } from '../prisma.service.js';

export interface PortfolioRow {
  id: string;
  code: string;
  name: string;
  status: string;
  contractValue: string;
  contractCurrency: string;
  revenue: string;
  cost: string;
  grossProfit: string;
  marginPercent: number | null;
}

export interface ResourceUtilizationRow {
  user: { id: string; displayName: string; email: string };
  totalAllocation: number;
  allocations: Array<{
    projectId: string;
    projectCode: string;
    projectName: string;
    percent: number;
    periodStart: string;
    periodEnd: string;
  }>;
  conflict: boolean;
}

export interface LeadershipKpis {
  activeProjects: number;
  portfolioRevenue: string;
  portfolioCost: string;
  portfolioMargin: number | null;
  pendingApprovals: number;
  pendingReimbursementAmount: string;
  reimbursedThisMonth: string;
  flaggedReceipts: number;
}

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async kpis(): Promise<LeadershipKpis> {
    const [activeProjects, pendingTravelApprovals, pendingExpenseApprovals, pendingReimb, flagged] =
      await Promise.all([
        this.prisma.project.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        this.prisma.travelRequest.count({ where: { status: 'SUBMITTED', deletedAt: null } }),
        this.prisma.expense.count({ where: { status: 'SUBMITTED', deletedAt: null } }),
        this.prisma.reimbursement.aggregate({
          where: { status: 'PENDING' },
          _sum: { totalAmount: true },
        }),
        this.prisma.receiptFlag.count({ where: { severity: { in: ['WARN', 'BLOCK'] } } }),
      ]);

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const paidThisMonth = await this.prisma.reimbursement.aggregate({
      where: { status: 'PAID', paidOn: { gte: monthStart } },
      _sum: { totalAmount: true },
    });

    const portfolio = await this.portfolio();
    const revenue = portfolio.reduce((s, p) => s.plus(p.revenue), new Decimal(0));
    const cost = portfolio.reduce((s, p) => s.plus(p.cost), new Decimal(0));
    const margin = revenue.isZero()
      ? null
      : Number(revenue.minus(cost).div(revenue).mul(100).toFixed(2));

    return {
      activeProjects,
      portfolioRevenue: revenue.toFixed(2),
      portfolioCost: cost.toFixed(2),
      portfolioMargin: margin,
      pendingApprovals: pendingTravelApprovals + pendingExpenseApprovals,
      pendingReimbursementAmount: (pendingReimb._sum.totalAmount ?? new Decimal(0)).toFixed(2),
      reimbursedThisMonth: (paidThisMonth._sum.totalAmount ?? new Decimal(0)).toFixed(2),
      flaggedReceipts: flagged,
    };
  }

  async portfolio(): Promise<PortfolioRow[]> {
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, status: { in: ['ACTIVE', 'ON_HOLD', 'CLOSED'] } },
      include: { milestones: true },
      orderBy: [{ status: 'asc' }, { plannedStart: 'desc' }],
    });

    const out: PortfolioRow[] = [];
    for (const p of projects) {
      const timeLogs = await this.prisma.timeLog.findMany({
        where: { task: { projectId: p.id, deletedAt: null } },
        include: { user: { select: { gradeId: true } } },
      });
      const timeLogEntries: TimeLogEntry[] = timeLogs
        .filter((l) => l.user.gradeId !== null)
        .map((l) => ({
          gradeId: l.user.gradeId!,
          date: l.date.toISOString().slice(0, 10),
          hours: Number(l.hours.toString()),
        }));
      const costRates: EffectiveCostRate[] = (
        await this.prisma.costRate.findMany({
          where: { gradeId: { in: Array.from(new Set(timeLogEntries.map((l) => l.gradeId))) } },
        })
      ).map((c) => ({
        gradeId: c.gradeId,
        ratePerDay: c.ratePerDay.toString(),
        currency: c.currency,
        effectiveFrom: c.effectiveFrom.toISOString().slice(0, 10),
      }));

      const trips = await this.prisma.trip.findMany({
        where: {
          travelRequest: { projectId: p.id, status: { in: ['CLOSED', 'COMPLETED'] } },
        },
      });
      const tripCosts = trips.map((t) => ({
        travel: t.travelActualCost.toString(),
        lodging: t.lodgingActualCost.toString(),
        da: (t.daAmount ?? new Decimal(0)).toString(),
        localConveyance: t.localConveyanceActualCost.toString(),
        currency: t.daCurrency ?? p.contractCurrency,
      }));

      const expenses = await this.prisma.expense.findMany({
        where: { projectId: p.id, status: { in: ['APPROVED', 'REIMBURSED'] }, deletedAt: null },
      });
      const otherExpenses = expenses.map((e) => ({
        amount: e.amount.toString(),
        currency: e.currency,
      }));

      const pnl = calculatePnl({
        reportingCurrency: p.contractCurrency,
        billingModel: p.billingModel,
        contractValue: p.contractValue.toString(),
        milestones: p.milestones.map((m) => ({
          id: m.id,
          projectId: m.projectId,
          name: m.name,
          value: m.value.toString(),
          currency: m.currency,
          plannedDate: m.plannedDate.toISOString().slice(0, 10),
          signedOffDate: m.signedOffDate ? m.signedOffDate.toISOString().slice(0, 10) : null,
        })),
        timeLogs: timeLogEntries,
        costRates,
        tripCosts,
        otherExpenses,
        otherDirectCosts: [],
      });

      out.push({
        id: p.id,
        code: p.code,
        name: p.name,
        status: p.status,
        contractValue: p.contractValue.toString(),
        contractCurrency: p.contractCurrency,
        revenue: pnl.revenue.amount,
        cost: pnl.cost.amount,
        grossProfit: pnl.grossProfit.amount,
        marginPercent: pnl.marginPercent,
      });
    }
    return out;
  }

  /** Engineer-level resource utilization for the current month. */
  async utilization(): Promise<ResourceUtilizationRow[]> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

    const allocations = await this.prisma.allocation.findMany({
      where: { periodStart: { lte: monthEnd }, periodEnd: { gte: monthStart } },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        project: { select: { id: true, code: true, name: true } },
      },
    });

    const byUser = new Map<string, ResourceUtilizationRow>();
    for (const a of allocations) {
      let row = byUser.get(a.userId);
      if (!row) {
        row = { user: a.user, totalAllocation: 0, allocations: [], conflict: false };
        byUser.set(a.userId, row);
      }
      row.totalAllocation += a.percentAllocation;
      row.allocations.push({
        projectId: a.projectId,
        projectCode: a.project.code,
        projectName: a.project.name,
        percent: a.percentAllocation,
        periodStart: a.periodStart.toISOString().slice(0, 10),
        periodEnd: a.periodEnd.toISOString().slice(0, 10),
      });
    }
    return Array.from(byUser.values()).map((r) => ({
      ...r,
      conflict: r.totalAllocation > 100,
    }));
  }

  async anomalies() {
    const flags = await this.prisma.receiptFlag.findMany({
      where: { severity: { in: ['WARN', 'BLOCK'] } },
      include: {
        receipt: {
          include: {
            expense: {
              select: {
                id: true,
                amount: true,
                currency: true,
                user: { select: { id: true, displayName: true, email: true } },
                project: { select: { id: true, code: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const utilRows = await this.utilization();
    const overbooked = utilRows.filter((u) => u.conflict);

    return {
      receiptFlags: flags.map((f) => ({
        id: f.id,
        kind: f.kind,
        severity: f.severity,
        detail: f.detail,
        createdAt: f.createdAt.toISOString(),
        expense: {
          id: f.receipt.expense.id,
          amount: f.receipt.expense.amount.toString(),
          currency: f.receipt.expense.currency,
        },
        user: f.receipt.expense.user,
        project: f.receipt.expense.project,
      })),
      overbookedEngineers: overbooked.map((u) => ({
        user: u.user,
        totalAllocation: u.totalAllocation,
        projects: u.allocations.map((a) => `${a.projectCode} ${a.percent}%`).join(', '),
      })),
    };
  }
}
