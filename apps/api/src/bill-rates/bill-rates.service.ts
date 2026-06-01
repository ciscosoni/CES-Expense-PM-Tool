import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type BillRate } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateBillRateDto, UpdateBillRateDto } from './bill-rate.dto.js';

const ENTITY = 'BillRate';

/**
 * Bill rates (P9) — what we charge the client per grade per day. Time-versioned,
 * exactly like CostRate; the P&L engine uses them to turn billable time into
 * T&M revenue.
 */
@Injectable()
export class BillRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { gradeId?: string | undefined } = {}): Promise<BillRate[]> {
    return this.prisma.billRate.findMany({
      where: { ...(opts.gradeId ? { gradeId: opts.gradeId } : {}) },
      orderBy: [{ gradeId: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async get(id: string): Promise<BillRate> {
    const r = await this.prisma.billRate.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(`BillRate ${id} not found`);
    return r;
  }

  async create(input: CreateBillRateDto, actorId: string): Promise<BillRate> {
    await this.assertGradeExists(input.gradeId);
    const created = await this.prisma.billRate.create({
      data: {
        gradeId: input.gradeId,
        ratePerDay: input.ratePerDay,
        currency: input.currency,
        effectiveFrom: new Date(input.effectiveFrom),
      },
    });
    await this.audit.log({ entity: ENTITY, entityId: created.id, action: 'CREATE', actorId, after: created });
    return created;
  }

  async update(id: string, input: UpdateBillRateDto, actorId: string): Promise<BillRate> {
    const before = await this.get(id);
    if (input.gradeId) await this.assertGradeExists(input.gradeId);
    const data: Prisma.BillRateUpdateInput = stripUndefined({
      grade: input.gradeId ? { connect: { id: input.gradeId } } : undefined,
      ratePerDay: input.ratePerDay,
      currency: input.currency,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
    });
    const after = await this.prisma.billRate.update({ where: { id }, data });
    await this.audit.log({ entity: ENTITY, entityId: id, action: 'UPDATE', actorId, before, after });
    return after;
  }

  async delete(id: string, actorId: string): Promise<void> {
    const before = await this.get(id);
    await this.prisma.billRate.delete({ where: { id } });
    await this.audit.log({ entity: ENTITY, entityId: id, action: 'DELETE', actorId, before });
  }

  private async assertGradeExists(gradeId: string): Promise<void> {
    const exists = await this.prisma.grade.findFirst({
      where: { id: gradeId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException(`Grade ${gradeId} not found or deleted`);
  }
}
