import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AnomalyKind,
  type Anomaly,
  type AnomalyRule,
  type AnomalySeverity,
  type Prisma,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { calculatePnl, type EffectiveCostRate, type TimeLogEntry } from '@ces/pnl-engine';
import { PrismaService } from '../prisma.service.js';
import type { AuthedUser } from '../auth/index.js';
import type { ResolveAnomalyDto, UpdateAnomalyRuleDto } from './anomalies.dto.js';

interface DetectionContext extends Record<string, unknown> {
  fingerprint: string;
  kind: AnomalyKind;
  severity: AnomalySeverity;
  entityKind: string;
  entityId: string;
  detail: string;
  context: Record<string, unknown>;
}

@Injectable()
export class AnomaliesService {
  constructor(private readonly prisma: PrismaService) {}

  // ----- Rules CRUD -----

  listRules() {
    return this.prisma.anomalyRule.findMany({ orderBy: { kind: 'asc' } });
  }

  async updateRule(id: string, input: UpdateAnomalyRuleDto): Promise<AnomalyRule> {
    const before = await this.prisma.anomalyRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`AnomalyRule ${id} not found`);
    const data: Prisma.AnomalyRuleUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.severity !== undefined) data.severity = input.severity;
    if (input.config !== undefined) data.config = input.config as Prisma.InputJsonValue;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    return this.prisma.anomalyRule.update({ where: { id }, data });
  }

  // ----- Anomaly listing -----

  listOpen() {
    return this.prisma.anomaly.findMany({
      where: { resolvedAt: null },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
      take: 200,
    });
  }

  async resolve(id: string, input: ResolveAnomalyDto, actor: AuthedUser): Promise<Anomaly> {
    const before = await this.prisma.anomaly.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Anomaly ${id} not found`);
    return this.prisma.anomaly.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
        resolvedById: actor.id,
        resolutionNote: input.note,
      },
    });
  }

  // ----- Detector -----

  /**
   * Idempotent detector. Re-runs each enabled rule and upserts Anomaly rows
   * by `fingerprint`. Existing open Anomalies for the same fingerprint are
   * left alone; new ones are inserted. Cleared anomalies (no longer matching)
   * are not auto-closed in v1 — admins close them manually with a note.
   */
  async runDetector(): Promise<{ inserted: number; total: number }> {
    const rules = await this.prisma.anomalyRule.findMany({ where: { enabled: true } });
    const findings: DetectionContext[] = [];
    for (const rule of rules) {
      try {
        findings.push(...(await this.detect(rule)));
      } catch (e) {
        // Detector should never throw aggregate — log and continue.
        console.warn(`[anomalies] rule ${rule.kind} failed:`, e);
      }
    }

    let inserted = 0;
    for (const f of findings) {
      try {
        await this.prisma.anomaly.create({
          data: {
            kind: f.kind,
            severity: f.severity,
            entityKind: f.entityKind,
            entityId: f.entityId,
            fingerprint: f.fingerprint,
            detail: f.detail,
            context: f.context as Prisma.InputJsonValue,
          },
        });
        inserted++;
      } catch (e) {
        // Unique-constraint hit ⇒ already exists; that's the idempotency.
        if (e instanceof Error && e.message.includes('Unique constraint')) continue;
        console.warn(`[anomalies] insert failed for ${f.fingerprint}:`, e);
      }
    }

    const total = await this.prisma.anomaly.count({ where: { resolvedAt: null } });
    return { inserted, total };
  }

  private async detect(rule: AnomalyRule): Promise<DetectionContext[]> {
    switch (rule.kind) {
      case 'RECEIPT_DUPLICATE':
        return this.detectReceiptDuplicates(rule);
      case 'RECEIPT_AMOUNT_MISMATCH':
        return this.detectAmountMismatch(rule);
      case 'ALLOCATION_OVERBOOK':
        return this.detectOverbook(rule);
      case 'PROJECT_OVER_BUDGET':
        return this.detectOverBudget(rule);
      case 'PROJECT_MARGIN_RED':
        return this.detectMarginRed(rule);
      case 'ATTENDANCE_REGULARIZATION_STALE':
        return this.detectStaleRegularizations(rule);
      default:
        return [];
    }
  }

  private async detectReceiptDuplicates(rule: AnomalyRule): Promise<DetectionContext[]> {
    const dups = await this.prisma.$queryRaw<Array<{ contentHash: string; count: bigint }>>`
      SELECT "contentHash", count(*) as count
      FROM "Receipt"
      GROUP BY "contentHash"
      HAVING count(*) > 1
    `;
    const out: DetectionContext[] = [];
    for (const d of dups) {
      const receipts = await this.prisma.receipt.findMany({
        where: { contentHash: d.contentHash },
        include: {
          expense: {
            select: {
              id: true,
              amount: true,
              currency: true,
              user: { select: { displayName: true } },
            },
          },
        },
      });
      for (const r of receipts) {
        out.push({
          fingerprint: `${rule.kind}:${r.id}`,
          kind: rule.kind,
          severity: rule.severity,
          entityKind: 'RECEIPT',
          entityId: r.id,
          detail: `${receipts.length} receipts share contentHash ${d.contentHash.slice(0, 8)}…`,
          context: {
            duplicates: receipts.length,
            expenseAmount: r.expense.amount.toString(),
            expenseCurrency: r.expense.currency,
            submitter: r.expense.user.displayName,
          },
        });
      }
    }
    return out;
  }

  private async detectAmountMismatch(rule: AnomalyRule): Promise<DetectionContext[]> {
    const tol = Number((rule.config as Record<string, unknown>).tolerancePercent ?? 5);
    const receipts = await this.prisma.receipt.findMany({
      where: { ocrAmount: { not: null } },
      include: { expense: { select: { id: true, amount: true, currency: true } } },
    });
    return receipts
      .filter((r) => {
        const claimed = new Decimal(r.expense.amount);
        const ocr = new Decimal(r.ocrAmount!);
        if (ocr.isZero()) return false;
        const diffPct = claimed.minus(ocr).abs().div(ocr).mul(100).toNumber();
        return claimed.greaterThan(ocr) && diffPct > tol;
      })
      .map<DetectionContext>((r) => ({
        fingerprint: `${rule.kind}:${r.id}`,
        kind: rule.kind,
        severity: rule.severity,
        entityKind: 'RECEIPT',
        entityId: r.id,
        detail: `Claimed ${r.expense.amount.toString()} > OCR ${r.ocrAmount!.toString()} (tol ${tol}%).`,
        context: {
          claimed: r.expense.amount.toString(),
          ocr: r.ocrAmount!.toString(),
          currency: r.expense.currency,
        },
      }));
  }

  private async detectOverbook(rule: AnomalyRule): Promise<DetectionContext[]> {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const rows = await this.prisma.allocation.findMany({
      where: { periodStart: { lte: monthEnd }, periodEnd: { gte: monthStart } },
      include: { user: { select: { id: true, displayName: true } } },
    });
    const byUser = new Map<string, { name: string; total: number }>();
    for (const a of rows) {
      const e = byUser.get(a.userId) ?? { name: a.user.displayName, total: 0 };
      e.total += a.percentAllocation;
      byUser.set(a.userId, e);
    }
    const out: DetectionContext[] = [];
    for (const [userId, e] of byUser) {
      if (e.total > 100) {
        const yyyymm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
        out.push({
          fingerprint: `${rule.kind}:${userId}:${yyyymm}`,
          kind: rule.kind,
          severity: rule.severity,
          entityKind: 'USER',
          entityId: userId,
          detail: `${e.name} allocated to ${e.total}% this month (>100%).`,
          context: { user: e.name, totalAllocation: e.total },
        });
      }
    }
    return out;
  }

  private async detectOverBudget(rule: AnomalyRule): Promise<DetectionContext[]> {
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, status: { in: ['ACTIVE', 'ON_HOLD'] }, budget: { not: null } },
      include: { milestones: true },
    });
    const out: DetectionContext[] = [];
    for (const p of projects) {
      const cost = await this.computeProjectCost(p);
      const budget = new Decimal(p.budget!);
      if (cost.greaterThan(budget)) {
        out.push({
          fingerprint: `${rule.kind}:${p.id}`,
          kind: rule.kind,
          severity: rule.severity,
          entityKind: 'PROJECT',
          entityId: p.id,
          detail: `Cost ${cost.toFixed(2)} ${p.contractCurrency} > budget ${budget.toFixed(2)}.`,
          context: {
            code: p.code,
            name: p.name,
            cost: cost.toFixed(2),
            budget: budget.toFixed(2),
            currency: p.contractCurrency,
          },
        });
      }
    }
    return out;
  }

  private async detectMarginRed(rule: AnomalyRule): Promise<DetectionContext[]> {
    const threshold = Number((rule.config as Record<string, unknown>).marginPercentBelow ?? 10);
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      include: { milestones: true },
    });
    const out: DetectionContext[] = [];
    for (const p of projects) {
      const { margin, cost, revenue } = await this.computeProjectPnl(p);
      if (margin !== null && margin < threshold) {
        out.push({
          fingerprint: `${rule.kind}:${p.id}`,
          kind: rule.kind,
          severity: rule.severity,
          entityKind: 'PROJECT',
          entityId: p.id,
          detail: `Margin ${margin.toFixed(1)}% below threshold ${threshold}%.`,
          context: {
            code: p.code,
            name: p.name,
            margin,
            cost: cost.toFixed(2),
            revenue: revenue.toFixed(2),
            threshold,
          },
        });
      }
    }
    return out;
  }

  private async detectStaleRegularizations(rule: AnomalyRule): Promise<DetectionContext[]> {
    const days = Number((rule.config as Record<string, unknown>).thresholdDays ?? 3);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.attendanceRegularization.findMany({
      where: { status: 'SUBMITTED', createdAt: { lt: cutoff }, deletedAt: null },
      include: { user: { select: { displayName: true } } },
    });
    return rows.map<DetectionContext>((r) => ({
      fingerprint: `${rule.kind}:${r.id}`,
      kind: rule.kind,
      severity: rule.severity,
      entityKind: 'ATTENDANCE_REGULARIZATION',
      entityId: r.id,
      detail: `${r.user.displayName}'s regularization for ${r.date.toISOString().slice(0, 10)} stuck > ${days} days.`,
      context: {
        user: r.user.displayName,
        date: r.date.toISOString().slice(0, 10),
        ageDays: Math.floor((Date.now() - r.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      },
    }));
  }

  // --- helpers shared with detectors ---

  private async computeProjectPnl(
    project: ProjectForPnl,
  ): Promise<{ revenue: Decimal; cost: Decimal; margin: number | null }> {
    const timeLogs = await this.prisma.timeLog.findMany({
      where: { task: { projectId: project.id, deletedAt: null } },
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

    const pnl = calculatePnl({
      reportingCurrency: project.contractCurrency,
      billingModel: project.billingModel as 'FIXED_PRICE' | 'T_AND_M' | 'MILESTONE',
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
      tripCosts: [],
      otherExpenses: [],
      otherDirectCosts: [],
    });

    return {
      revenue: new Decimal(pnl.revenue.amount),
      cost: new Decimal(pnl.cost.amount),
      margin: pnl.marginPercent,
    };
  }

  private async computeProjectCost(p: ProjectForPnl): Promise<Decimal> {
    const { cost } = await this.computeProjectPnl(p);
    return cost;
  }
}

interface ProjectForPnl {
  id: string;
  contractCurrency: string;
  billingModel: string;
  contractValue: Decimal;
  milestones: Array<{
    id: string;
    projectId: string;
    name: string;
    value: Decimal;
    currency: string;
    plannedDate: Date;
    signedOffDate: Date | null;
  }>;
}
