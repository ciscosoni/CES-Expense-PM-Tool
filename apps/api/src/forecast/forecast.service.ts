import { Injectable } from '@nestjs/common';
import {
  detectExpenseSpike,
  forecastMargin,
  predictUtilizationConflicts,
  recommendStaffing,
  wellbeingSignal,
  type MarginForecast,
  type SpikePoint,
  type StaffingPlan,
  type UtilizationRisk,
  type WellbeingSignal,
} from '@ces/forecast';
import { PrismaService } from '../prisma.service.js';
import { DashboardsService } from '../dashboards/dashboards.service.js';

const RISK_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/**
 * P8 — turns live data into forward-looking risk by feeding it through the pure
 * @ces/forecast models. The service does the I/O; the math stays in the package.
 */
@Injectable()
export class ForecastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboards: DashboardsService,
  ) {}

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** First→last day of next calendar month (UTC). */
  private nextMonthWindow(): { start: Date; end: Date } {
    const now = new Date();
    return {
      start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
      end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0)),
    };
  }

  /** Projected end-of-engagement margin per active project. */
  async marginForecasts(): Promise<(MarginForecast & { projectId: string; code: string; name: string })[]> {
    const portfolio = await this.dashboards.portfolio();
    const active = portfolio.filter((p) => p.status === 'ACTIVE');
    const projects = await this.prisma.project.findMany({
      where: { id: { in: active.map((p) => p.id) } },
      select: { id: true, plannedStart: true, plannedEnd: true },
    });
    const dates = new Map(projects.map((p) => [p.id, p]));
    const asOf = this.today();

    const out = active.map((p) => {
      const d = dates.get(p.id);
      const f = forecastMargin({
        revenue: Number(p.revenue),
        costToDate: Number(p.cost),
        plannedStart: d?.plannedStart?.toISOString().slice(0, 10) ?? asOf,
        plannedEnd: d?.plannedEnd?.toISOString().slice(0, 10) ?? asOf,
        asOf,
      });
      return { projectId: p.id, code: p.code, name: p.name, ...f };
    });
    return out.sort((a, b) => RISK_ORDER[a.riskBand]! - RISK_ORDER[b.riskBand]!);
  }

  /** Engineers projected to be overbooked next month. */
  async utilizationRisk(): Promise<{ window: { start: string; end: string }; risks: UtilizationRisk[] }> {
    const { start, end } = this.nextMonthWindow();
    const allocs = await this.prisma.allocation.findMany({
      where: { periodStart: { lte: end }, periodEnd: { gte: start } },
      include: { user: { select: { displayName: true } } },
    });
    const windows = allocs.map((a) => ({
      userId: a.userId,
      userName: a.user.displayName,
      percent: a.percentAllocation,
      periodStart: a.periodStart.toISOString().slice(0, 10),
      periodEnd: a.periodEnd.toISOString().slice(0, 10),
    }));
    const w = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    return { window: w, risks: predictUtilizationConflicts(windows, w) };
  }

  /**
   * Next-month staffing plan: who's free, and suggested reassignments that
   * relieve overbooked engineers. The math is pure (@ces/forecast); this method
   * only resolves the inputs — active graded engineers with their cost rate
   * effective on the window, and next-month allocations.
   */
  async staffingPlan(): Promise<StaffingPlan> {
    const { start, end } = this.nextMonthWindow();

    const users = await this.prisma.user.findMany({
      where: { active: true, gradeId: { not: null } },
      select: {
        id: true,
        displayName: true,
        gradeId: true,
        grade: { select: { code: true, seniorityOrder: true } },
      },
    });

    // Cost rate per grade effective on the window start (latest effectiveFrom ≤ start).
    const gradeIds = [...new Set(users.map((u) => u.gradeId!).filter(Boolean))];
    const rates = await this.prisma.costRate.findMany({
      where: { gradeId: { in: gradeIds }, effectiveFrom: { lte: start } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const rateByGrade = new Map<string, { ratePerDay: number; currency: string }>();
    for (const r of rates) {
      if (!rateByGrade.has(r.gradeId)) rateByGrade.set(r.gradeId, { ratePerDay: Number(r.ratePerDay), currency: r.currency });
    }

    const engineers = users.map((u) => {
      const rate = u.gradeId ? rateByGrade.get(u.gradeId) : undefined;
      return {
        userId: u.id,
        userName: u.displayName,
        gradeCode: u.grade?.code ?? '—',
        gradeRank: u.grade?.seniorityOrder ?? 0,
        costPerDay: rate?.ratePerDay ?? 0,
        currency: rate?.currency ?? 'INR',
      };
    });

    const allocs = await this.prisma.allocation.findMany({
      where: { periodStart: { lte: end }, periodEnd: { gte: start } },
      include: { project: { select: { code: true } } },
    });
    const allocations = allocs.map((a) => ({
      id: a.id,
      userId: a.userId,
      projectId: a.projectId,
      projectCode: a.project.code,
      percent: a.percentAllocation,
      periodStart: a.periodStart.toISOString().slice(0, 10),
      periodEnd: a.periodEnd.toISOString().slice(0, 10),
    }));

    const window = { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    return recommendStaffing({ engineers, allocations, window });
  }

  /** Org-wide monthly expense trend + spike flag on the latest month. */
  async expenseSpike(): Promise<{ history: SpikePoint[]; result: ReturnType<typeof detectExpenseSpike> }> {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const expenses = await this.prisma.expense.findMany({
      where: { deletedAt: null, incurredOn: { gte: from } },
      select: { incurredOn: true, amount: true },
    });
    const byMonth = new Map<string, number>();
    for (const e of expenses) {
      const k = e.incurredOn.toISOString().slice(0, 7);
      byMonth.set(k, (byMonth.get(k) ?? 0) + Number(e.amount));
    }
    const history: SpikePoint[] = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([period, amount]) => ({ period, amount: Math.round(amount) }));
    return { history, result: detectExpenseSpike(history) };
  }

  /** Overwork risk per engineer from the last ~6 weeks of on-site hours. */
  async wellbeing(): Promise<WellbeingSignal[]> {
    const from = new Date(Date.now() - 6 * 7 * 86_400_000);
    const days = await this.prisma.attendanceDay.findMany({
      where: { date: { gte: from } },
      include: { user: { select: { displayName: true } } },
    });
    const byUser = new Map<string, { name: string; weeks: Map<number, number> }>();
    for (const d of days) {
      const g = byUser.get(d.userId) ?? { name: d.user.displayName, weeks: new Map() };
      const week = Math.floor(d.date.getTime() / (7 * 86_400_000));
      g.weeks.set(week, (g.weeks.get(week) ?? 0) + d.onSiteMinutes / 60);
      byUser.set(d.userId, g);
    }
    const signals = [...byUser.entries()].map(([userId, g]) => {
      const weeklyOnSiteHours = [...g.weeks.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, h]) => Math.round(h));
      return wellbeingSignal({ userId, userName: g.name, weeklyOnSiteHours });
    });
    return signals
      .filter((s) => s.riskLevel !== 'LOW')
      .sort((a, b) => RISK_ORDER[a.riskLevel]! - RISK_ORDER[b.riskLevel]!);
  }

  /** Compact counts for the leadership dashboard's forward-looking panel. */
  async summary(): Promise<{
    marginsEroding: number;
    marginsCritical: number;
    overbookedNextMonth: number;
    benchAvailableNextMonth: number;
    staffingMovesSuggested: number;
    expenseSpike: boolean;
    wellbeingAtRisk: number;
  }> {
    const [margins, util, staffing, spike, wb] = await Promise.all([
      this.marginForecasts(),
      this.utilizationRisk(),
      this.staffingPlan(),
      this.expenseSpike(),
      this.wellbeing(),
    ]);
    return {
      marginsEroding: margins.filter((m) => m.trajectory === 'ERODING').length,
      marginsCritical: margins.filter((m) => m.riskBand === 'CRITICAL').length,
      overbookedNextMonth: util.risks.length,
      benchAvailableNextMonth: staffing.capacity.filter((c) => c.status === 'BENCH' || c.status === 'AVAILABLE').length,
      staffingMovesSuggested: staffing.moves.length,
      expenseSpike: spike.result.isSpike,
      wellbeingAtRisk: wb.length,
    };
  }
}
