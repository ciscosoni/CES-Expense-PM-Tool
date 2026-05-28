import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma.service.js';

export interface PayslipLine {
  kind: 'EARNED_DAYS_EFFORT' | 'DA_EARNED' | 'REIMBURSEMENT' | 'BASE_SALARY';
  description: string;
  amount: string;
  currency: string;
  /// Pointer to the source record so the line is auditable (Principle #3).
  sourceKind?: string;
  sourceId?: string;
  sourceDetail?: Record<string, unknown>;
}

export interface PayslipDerivation {
  userId: string;
  user: { id: string; displayName: string; email: string };
  period: string; // YYYY-MM
  currency: string;
  lines: PayslipLine[];
  totals: {
    earnedDaysCost: string;
    daEarned: string;
    reimbursements: string;
    grandTotal: string;
  };
}

@Injectable()
export class PayslipsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the payslip derivation for (user, YYYY-MM). Every line points to its
   * source record so the engineer can tap and see exactly where each number
   * came from — kills the "unnecessary deductions" / "wrong calculation" pain
   * points (Principle #3 — Computed, never entered twice).
   */
  async derive(userId: string, period: string): Promise<PayslipDerivation> {
    const [year, month] = period.split('-').map(Number);
    const start = new Date(Date.UTC(year!, month! - 1, 1));
    const end = new Date(Date.UTC(year!, month!, 0));

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, displayName: true, email: true, gradeId: true },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const currency = 'INR';
    const lines: PayslipLine[] = [];

    // 1. Effort cost (time logs × cost rate effective on the log date).
    if (user.gradeId) {
      const logs = await this.prisma.timeLog.findMany({
        where: { userId, date: { gte: start, lte: end } },
        include: {
          task: { select: { id: true, name: true, project: { select: { code: true } } } },
        },
        orderBy: { date: 'asc' },
      });
      const rates = await this.prisma.costRate.findMany({
        where: { gradeId: user.gradeId },
        orderBy: { effectiveFrom: 'desc' },
      });
      for (const log of logs) {
        const rate = rates.find((r) => r.effectiveFrom <= log.date);
        if (!rate) continue;
        const days = new Decimal(log.hours).div(8);
        const amount = days.mul(rate.ratePerDay);
        lines.push({
          kind: 'EARNED_DAYS_EFFORT',
          description: `${log.task.project.code} · ${log.task.name} · ${log.date.toISOString().slice(0, 10)} · ${log.hours}h × ${rate.ratePerDay.toString()}/day`,
          amount: amount.toFixed(2),
          currency: rate.currency,
          sourceKind: 'TimeLog',
          sourceId: log.id,
          sourceDetail: {
            rateId: rate.id,
            ratePerDay: rate.ratePerDay.toString(),
            hours: log.hours.toString(),
          },
        });
      }
    }

    // 2. DA earned this month (from closed trips).
    const trips = await this.prisma.trip.findMany({
      where: {
        travelRequest: { userId, status: { in: ['CLOSED', 'COMPLETED'] } },
        actualEnd: { gte: start, lte: end },
      },
      include: {
        travelRequest: {
          include: { project: { select: { code: true } }, fromCity: true, toCity: true },
        },
      },
      orderBy: { actualEnd: 'asc' },
    });
    for (const trip of trips) {
      if (!trip.daAmount) continue;
      lines.push({
        kind: 'DA_EARNED',
        description: `DA · ${trip.travelRequest.project.code} · ${trip.travelRequest.fromCity.name}→${trip.travelRequest.toCity.name} · ${trip.daEligibleDays?.toString() ?? '0'} days`,
        amount: trip.daAmount.toString(),
        currency: trip.daCurrency ?? currency,
        sourceKind: 'Trip',
        sourceId: trip.id,
        sourceDetail: {
          breakdown: trip.daBreakdown,
        },
      });
    }

    // 3. Reimbursements paid this month.
    const reimbs = await this.prisma.reimbursement.findMany({
      where: { userId, status: 'PAID', paidOn: { gte: start, lte: end } },
      orderBy: { paidOn: 'asc' },
    });
    for (const r of reimbs) {
      lines.push({
        kind: 'REIMBURSEMENT',
        description: `Reimbursement ref ${r.reference ?? '—'} (${r.paidOn?.toISOString().slice(0, 10)})`,
        amount: r.totalAmount.toString(),
        currency: r.currency,
        sourceKind: 'Reimbursement',
        sourceId: r.id,
      });
    }

    const earnedDaysCost = lines
      .filter((l) => l.kind === 'EARNED_DAYS_EFFORT')
      .reduce((s, l) => s.plus(l.amount), new Decimal(0));
    const daEarned = lines
      .filter((l) => l.kind === 'DA_EARNED')
      .reduce((s, l) => s.plus(l.amount), new Decimal(0));
    const reimbursements = lines
      .filter((l) => l.kind === 'REIMBURSEMENT')
      .reduce((s, l) => s.plus(l.amount), new Decimal(0));
    const grand = earnedDaysCost.plus(daEarned).plus(reimbursements);

    return {
      userId: user.id,
      user: { id: user.id, displayName: user.displayName, email: user.email },
      period,
      currency,
      lines,
      totals: {
        earnedDaysCost: earnedDaysCost.toFixed(2),
        daEarned: daEarned.toFixed(2),
        reimbursements: reimbursements.toFixed(2),
        grandTotal: grand.toFixed(2),
      },
    };
  }

  async listUsersForPeriod() {
    return this.prisma.user.findMany({
      where: { active: true, deletedAt: null, gradeId: { not: null } },
      select: { id: true, displayName: true, email: true, gradeId: true },
      orderBy: { displayName: 'asc' },
    });
  }
}
