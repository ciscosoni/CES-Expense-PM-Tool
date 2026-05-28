import { Injectable, NotFoundException } from '@nestjs/common';
import {
  calculatePnl,
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
      }));

    const costRates: EffectiveCostRate[] = (
      await this.prisma.costRate.findMany({
        // Only need rates for grades present in this project's time logs.
        where: { gradeId: { in: Array.from(new Set(timeLogEntries.map((l) => l.gradeId))) } },
      })
    ).map((c) => ({
      gradeId: c.gradeId,
      ratePerDay: c.ratePerDay.toString(),
      currency: c.currency,
      effectiveFrom: c.effectiveFrom.toISOString().slice(0, 10),
    }));

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
      tripCosts: [], // wired in Slice 1C
      otherExpenses: [], // wired in Slice 1C
      otherDirectCosts: [],
    });
  }
}
