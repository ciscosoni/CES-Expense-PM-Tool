import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Milestone } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateMilestoneDto, UpdateMilestoneDto } from './project.dto.js';

const ENTITY = 'Milestone';

@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(projectId: string) {
    return this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { plannedDate: 'asc' },
    });
  }

  async get(id: string) {
    const m = await this.prisma.milestone.findUnique({ where: { id } });
    if (!m) throw new NotFoundException(`Milestone ${id} not found`);
    return m;
  }

  async create(projectId: string, input: CreateMilestoneDto, actorId: string): Promise<Milestone> {
    const created = await this.prisma.milestone.create({
      data: {
        projectId,
        name: input.name,
        value: input.value,
        currency: input.currency,
        plannedDate: new Date(input.plannedDate),
        signedOffDate: input.signedOffDate ? new Date(input.signedOffDate) : null,
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

  async update(id: string, input: UpdateMilestoneDto, actorId: string): Promise<Milestone> {
    const before = await this.get(id);
    const data: Prisma.MilestoneUpdateInput = stripUndefined({
      name: input.name,
      value: input.value,
      currency: input.currency,
      plannedDate: input.plannedDate ? new Date(input.plannedDate) : undefined,
      signedOffDate:
        input.signedOffDate === undefined
          ? undefined
          : input.signedOffDate === null
            ? null
            : new Date(input.signedOffDate),
    });
    const after = await this.prisma.milestone.update({ where: { id }, data });
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
    await this.prisma.milestone.delete({ where: { id } });
    await this.audit.log({ entity: ENTITY, entityId: id, action: 'DELETE', actorId, before });
  }
}
