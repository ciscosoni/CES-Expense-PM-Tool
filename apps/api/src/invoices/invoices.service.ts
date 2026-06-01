import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import type { Invoice } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthedUser } from '../auth/index.js';

const HOURS_PER_DAY = 8;

/**
 * P9-B — client invoicing. Generates an invoice from a project's billable time in
 * a period: groups billable hours by grade, prices each at the effective bill
 * rate, and writes line items. The money loop the tool was missing.
 */
@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(opts: { projectId?: string | undefined } = {}): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: { ...(opts.projectId ? { projectId: opts.projectId } : {}) },
      include: { project: { select: { code: true } }, client: { select: { name: true } }, lines: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    const inv = await this.prisma.invoice.findUnique({
      where: { id },
      include: { project: { select: { code: true, name: true } }, client: true, lines: true },
    });
    if (!inv) throw new NotFoundException(`Invoice ${id} not found`);
    return inv;
  }

  /** Build a draft invoice from billable time logged on a project in [from, to]. */
  async generateFromTime(
    input: { projectId: string; from: string; to: string; taxPercent?: number | undefined },
    actor: AuthedUser,
  ): Promise<Invoice> {
    const project = await this.prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
      select: { id: true, code: true, clientId: true, contractCurrency: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const fromD = new Date(input.from);
    const toD = new Date(input.to);
    const logs = await this.prisma.timeLog.findMany({
      where: { billable: true, date: { gte: fromD, lte: toD }, task: { projectId: project.id, deletedAt: null } },
      include: { user: { select: { gradeId: true, grade: { select: { code: true } } } } },
    });
    if (!logs.length) throw new BadRequestException('No billable time in that period for this project.');

    // hours by grade
    const byGrade = new Map<string, { code: string; hours: Decimal }>();
    for (const l of logs) {
      const gid = l.user.gradeId ?? 'ungraded';
      const code = l.user.grade?.code ?? 'Ungraded';
      const g = byGrade.get(gid) ?? { code, hours: new Decimal(0) };
      g.hours = g.hours.plus(l.hours);
      byGrade.set(gid, g);
    }

    const billRates = await this.prisma.billRate.findMany({
      where: { gradeId: { in: [...byGrade.keys()].filter((k) => k !== 'ungraded') } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const rateFor = (gradeId: string): Decimal => {
      const r = billRates.find((b) => b.gradeId === gradeId);
      return r ? new Decimal(r.ratePerDay) : new Decimal(0);
    };

    const lines = [...byGrade.entries()].map(([gid, g]) => {
      const unitRate = rateFor(gid).div(HOURS_PER_DAY); // per hour
      const amount = g.hours.mul(unitRate);
      return {
        description: `${g.code} — ${g.hours.toFixed(2)}h`,
        quantity: g.hours.toFixed(2),
        unitRate: unitRate.toFixed(4),
        amount: amount.toFixed(4),
      };
    });
    const subtotal = lines.reduce((s, l) => s.plus(l.amount), new Decimal(0));
    const taxPercent = new Decimal(input.taxPercent ?? 0);
    const total = subtotal.plus(subtotal.mul(taxPercent).div(100));

    const count = await this.prisma.invoice.count();
    const number = `INV-${project.code}-${String(count + 1).padStart(4, '0')}`;

    const created = await this.prisma.invoice.create({
      data: {
        number,
        projectId: project.id,
        clientId: project.clientId,
        status: 'DRAFT',
        currency: project.contractCurrency,
        subtotal: subtotal.toFixed(4),
        taxPercent: taxPercent.toFixed(2),
        total: total.toFixed(4),
        issueDate: new Date(),
        source: 'TIME',
        createdById: actor.id,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await this.audit.log({ entity: 'Invoice', entityId: created.id, action: 'GENERATE', actorId: actor.id, after: { number, total: total.toFixed(2) } });
    return created;
  }

  async setStatus(id: string, status: 'SENT' | 'PAID' | 'CANCELLED', actor: AuthedUser): Promise<Invoice> {
    const before = await this.get(id);
    const after = await this.prisma.invoice.update({
      where: { id },
      data: { status, ...(status === 'PAID' ? { paidOn: new Date() } : {}) },
    });
    await this.audit.log({ entity: 'Invoice', entityId: id, action: `STATUS_${status}`, actorId: actor.id, before, after });
    return after;
  }
}
