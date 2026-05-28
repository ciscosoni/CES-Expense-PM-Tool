import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Project, type ProjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateProjectDto, UpdateProjectDto } from './project.dto.js';

const ENTITY = 'Project';
const PROJECT_INCLUDE = {
  client: { select: { id: true, name: true, kind: true } },
  endCustomer: { select: { id: true, name: true, industry: true } },
  pm: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    opts: {
      status?: ProjectStatus | undefined;
      pmId?: string | undefined;
      clientId?: string | undefined;
    } = {},
  ) {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.pmId ? { pmId: opts.pmId } : {}),
        ...(opts.clientId ? { clientId: opts.clientId } : {}),
      },
      include: PROJECT_INCLUDE,
      orderBy: [{ status: 'asc' }, { plannedStart: 'desc' }],
    });
  }

  async get(id: string) {
    const proj = await this.prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...PROJECT_INCLUDE,
        milestones: { orderBy: { plannedDate: 'asc' } },
        sites: true,
      },
    });
    if (!proj) throw new NotFoundException(`Project ${id} not found`);
    return proj;
  }

  async create(input: CreateProjectDto, actorId: string): Promise<Project> {
    try {
      const created = await this.prisma.project.create({
        data: {
          code: input.code,
          name: input.name,
          clientId: input.clientId,
          endCustomerId: input.endCustomerId,
          whiteLabel: input.whiteLabel,
          category: input.category,
          billingModel: input.billingModel,
          contractValue: input.contractValue,
          contractCurrency: input.contractCurrency,
          includesPassthrough: input.includesPassthrough,
          pmId: input.pmId,
          plannedStart: new Date(input.plannedStart),
          plannedEnd: new Date(input.plannedEnd),
          status: input.status,
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
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Project code "${input.code}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateProjectDto, actorId: string): Promise<Project> {
    const before = await this.get(id);
    const data: Prisma.ProjectUpdateInput = stripUndefined({
      code: input.code,
      name: input.name,
      clientId: input.clientId,
      endCustomerId: input.endCustomerId,
      whiteLabel: input.whiteLabel,
      category: input.category,
      billingModel: input.billingModel,
      contractValue: input.contractValue,
      contractCurrency: input.contractCurrency,
      includesPassthrough: input.includesPassthrough,
      pmId: input.pmId,
      plannedStart: input.plannedStart ? new Date(input.plannedStart) : undefined,
      plannedEnd: input.plannedEnd ? new Date(input.plannedEnd) : undefined,
      status: input.status,
    });
    const after = await this.prisma.project.update({ where: { id }, data });
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

  async softDelete(id: string, actorId: string): Promise<Project> {
    const before = await this.get(id);
    const after = await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'CANCELLED' },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'DELETE',
      actorId,
      before,
      after,
    });
    return after;
  }
}
