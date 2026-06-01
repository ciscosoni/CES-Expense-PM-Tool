import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import {
  calculatePnl,
  type EffectiveBillRate,
  type EffectiveCostRate,
  type PnlResult,
  type TimeLogEntry,
} from '@ces/pnl-engine';
import { PrismaService } from '../prisma.service.js';

/**
 * Wires the persisted project data + time logs + cost rates into the pure
 * `@ces/pnl-engine`. The engine itself stays I/O-free and unit-tested —
 * this service is the thin loader.
 *
 * v1 is services-only (no hardware/OEM pass-through). When `tripCosts` and
 * `otherExpenses` modules land in Slice 1C, those rows feed into here too.
 */
@Injectable()
export class PnlService {
  constructor(private readonly prisma: PrismaService) {}

  async forProject(projectId: string): Promise<PnlResult> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { milestones: true },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);

    // Time logs joined with assignee grade so the engine can pick the right cost rate row.
    const timeLogs = await this.prisma.timeLog.findMany({
      where: { task: { projectId, deletedAt: null } },
      include: {
        user: { select: { gradeId: true } },
      },
    });

    const timeLogEntries: TimeLogEntry[] = timeLogs
      .filter((l) => l.user.gradeId !== null)
      .map((l) => ({
        gradeId: l.user.gradeId!,
        date: l.date.toISOString().slice(0, 10),
        hours: Number(l.hours.toString()),
        billable: l.billable,
      }));

    const gradeIds = Array.from(new Set(timeLogEntries.map((l) => l.gradeId)));
    const mapRate = (r: { gradeId: string; ratePerDay: { toString(): string }; currency: string; effectiveFrom: Date }) => ({
      gradeId: r.gradeId,
      ratePerDay: r.ratePerDay.toString(),
      currency: r.currency,
      effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
    });

    const [costRows, billRows] = await Promise.all([
      this.prisma.costRate.findMany({ where: { gradeId: { in: gradeIds } } }),
      this.prisma.billRate.findMany({ where: { gradeId: { in: gradeIds } } }),
    ]);
    const costRates: EffectiveCostRate[] = costRows.map(mapRate);
    const billRates: EffectiveBillRate[] = billRows.map(mapRate);

    // Closed trips + approved expenses on the project (same basis as the dashboard
    // portfolio P&L — otherwise the per-project cost would understate by these).
    const ccy = project.contractCurrency;
    const trips = await this.prisma.trip.findMany({
      where: { travelRequest: { projectId, status: { in: ['CLOSED', 'COMPLETED'] } } },
    });
    const tripCosts = trips.map((t) => ({
      travel: t.travelActualCost.toString(),
      lodging: t.lodgingActualCost.toString(),
      da: (t.daAmount ?? new Decimal(0)).toString(),
      localConveyance: t.localConveyanceActualCost.toString(),
      currency: t.daCurrency ?? ccy,
    }));
    const expenseRows = await this.prisma.expense.findMany({
      where: { projectId, status: { in: ['APPROVED', 'REIMBURSED'] }, deletedAt: null },
      select: { amount: true, currency: true },
    });
    // The engine requires same-currency inputs; only sum matching-currency rows here.
    const otherExpenses = expenseRows
      .filter((e) => e.currency === ccy)
      .map((e) => ({ amount: e.amount.toString(), currency: e.currency }));

    return calculatePnl({
      reportingCurrency: project.contractCurrency,
      billingModel: project.billingModel,
      contractValue: project.contractValue.toString(),
      milestones: project.milestones.map((m) => ({
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
      billRates,
      tripCosts,
      otherExpenses,
      otherDirectCosts: [],
    });
  }
}
