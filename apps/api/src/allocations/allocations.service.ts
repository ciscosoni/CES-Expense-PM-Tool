import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Allocation, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateAllocationDto, UpdateAllocationDto } from './allocation.dto.js';

const ENTITY = 'Allocation';

@Injectable()
export class AllocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { userId?: string | undefined; projectId?: string | undefined }) {
    return this.prisma.allocation.findMany({
      where: {
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
      },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        project: { select: { id: true, code: true, name: true, status: true } },
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  async get(id: string) {
    const a = await this.prisma.allocation.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Allocation ${id} not found`);
    return a;
  }

  async create(input: CreateAllocationDto, actorId: string): Promise<Allocation> {
    await this.assertCapacity({
      userId: input.userId,
      percentAllocation: input.percentAllocation,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    const created = await this.prisma.allocation.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        percentAllocation: input.percentAllocation,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        notes: input.notes ?? null,
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

  async update(id: string, input: UpdateAllocationDto, actorId: string): Promise<Allocation> {
    const before = await this.get(id);
    if (input.percentAllocation !== undefined || input.periodStart || input.periodEnd) {
      await this.assertCapacity({
        userId: input.userId ?? before.userId,
        percentAllocation: input.percentAllocation ?? before.percentAllocation,
        periodStart: input.periodStart ?? before.periodStart.toISOString().slice(0, 10),
        periodEnd: input.periodEnd ?? before.periodEnd.toISOString().slice(0, 10),
        excludeId: id,
      });
    }
    const data: Prisma.AllocationUpdateInput = stripUndefined({
      user: input.userId ? { connect: { id: input.userId } } : undefined,
      project: input.projectId ? { connect: { id: input.projectId } } : undefined,
      percentAllocation: input.percentAllocation,
      periodStart: input.periodStart ? new Date(input.periodStart) : undefined,
      periodEnd: input.periodEnd ? new Date(input.periodEnd) : undefined,
      notes: input.notes,
    });
    const after = await this.prisma.allocation.update({ where: { id }, data });
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
    await this.prisma.allocation.delete({ where: { id } });
    await this.audit.log({ entity: ENTITY, entityId: id, action: 'DELETE', actorId, before });
  }

  /**
   * Conflict detector: sums all overlapping allocations for the user and
   * throws if adding this new/updated one would exceed 100%.
   *
   * Solves the "engineer overlapping in multiple projects" pain point —
   * a PM cannot accidentally double-book a resource.
   */
  private async assertCapacity(args: {
    userId: string;
    percentAllocation: number;
    periodStart: string;
    periodEnd: string;
    excludeId?: string;
  }): Promise<void> {
    const start = new Date(args.periodStart);
    const end = new Date(args.periodEnd);
    if (start > end) {
      throw new BadRequestException('periodStart must be on or before periodEnd');
    }

    const overlapping = await this.prisma.allocation.findMany({
      where: {
        userId: args.userId,
        periodStart: { lte: end },
        periodEnd: { gte: start },
        ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
      },
      select: { id: true, percentAllocation: true, projectId: true },
    });
    const used = overlapping.reduce((sum, a) => sum + a.percentAllocation, 0);
    const total = used + args.percentAllocation;
    if (total > 100) {
      throw new BadRequestException(
        `Allocation conflict: user is already at ${used}% during this period; adding ${args.percentAllocation}% would push to ${total}%`,
      );
    }
  }
}
