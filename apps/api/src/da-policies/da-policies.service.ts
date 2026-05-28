import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type DaPolicy } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateDaPolicyDto, UpdateDaPolicyDto } from './da-policy.dto.js';

const ENTITY = 'DaPolicy';

@Injectable()
export class DaPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<DaPolicy[]> {
    return this.prisma.daPolicy.findMany({ orderBy: { effectiveFrom: 'desc' } });
  }

  async get(id: string): Promise<DaPolicy> {
    const p = await this.prisma.daPolicy.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`DaPolicy ${id} not found`);
    return p;
  }

  /**
   * Creates a new time-versioned policy row. The DA engine picks the row with
   * the latest effectiveFrom ≤ trip date, so new rows supersede older ones from
   * their effective date forward — old rows stay queryable for historical trips.
   */
  async create(input: CreateDaPolicyDto, actorId: string): Promise<DaPolicy> {
    const created = await this.prisma.daPolicy.create({
      data: {
        name: input.name,
        partialDayPercent: input.partialDayPercent.toString(),
        intraCitySameDayPaysDa: input.intraCitySameDayPaysDa,
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

  async update(id: string, input: UpdateDaPolicyDto, actorId: string): Promise<DaPolicy> {
    const before = await this.get(id);
    const data: Prisma.DaPolicyUpdateInput = stripUndefined({
      name: input.name,
      partialDayPercent: input.partialDayPercent?.toString(),
      intraCitySameDayPaysDa: input.intraCitySameDayPaysDa,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
    });
    const after = await this.prisma.daPolicy.update({ where: { id }, data });
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
    await this.prisma.daPolicy.delete({ where: { id } });
    await this.audit.log({ entity: ENTITY, entityId: id, action: 'DELETE', actorId, before });
  }
}
