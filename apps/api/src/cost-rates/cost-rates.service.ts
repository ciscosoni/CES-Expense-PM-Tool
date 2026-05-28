import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type CostRate } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateCostRateDto, UpdateCostRateDto } from './cost-rate.dto.js';

const ENTITY = 'CostRate';

@Injectable()
export class CostRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { gradeId?: string | undefined } = {}): Promise<CostRate[]> {
    return this.prisma.costRate.findMany({
      where: { ...(opts.gradeId ? { gradeId: opts.gradeId } : {}) },
      orderBy: [{ gradeId: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async get(id: string): Promise<CostRate> {
    const r = await this.prisma.costRate.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(`CostRate ${id} not found`);
    return r;
  }

  async create(input: CreateCostRateDto, actorId: string): Promise<CostRate> {
    await this.assertGradeExists(input.gradeId);
    const created = await this.prisma.costRate.create({
      data: {
        gradeId: input.gradeId,
        ratePerDay: input.ratePerDay,
        currency: input.currency,
        effectiveFrom: new Date(input.effectiveFrom),
      },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorId,
      after: created,
    });
    return created;
  }

  async update(id: string, input: UpdateCostRateDto, actorId: string): Promise<CostRate> {
    const before = await this.get(id);
    if (input.gradeId) await this.assertGradeExists(input.gradeId);
    const data: Prisma.CostRateUpdateInput = stripUndefined({
      grade: input.gradeId ? { connect: { id: input.gradeId } } : undefined,
      ratePerDay: input.ratePerDay,
      currency: input.currency,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
    });
    const after = await this.prisma.costRate.update({ where: { id }, data });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorId,
      before,
      after,
    });
    return after;
  }

  async delete(id: string, actorId: string): Promise<void> {
    const before = await this.get(id);
    await this.prisma.costRate.delete({ where: { id } });
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
