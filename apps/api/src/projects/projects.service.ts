import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Project, type ProjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { AuthedUser } from '../auth/index.js';
import type { CreateProjectDto, UpdateProjectDto } from './project.dto.js';

const ENTITY = 'Project';
const PROJECT_INCLUDE = {
  client: { select: { id: true, name: true, kind: true } },
  endCustomer: { select: { id: true, name: true, industry: true } },
  pm: { select: { id: true, displayName: true, email: true } },
  owner: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.ProjectInclude;

/**
 * Per-project visibility scope (Slice 2B redesign):
 * - ADMIN / FINANCE: see everything
 * - PROJECT_OWNER: only projects where they're the Owner
 * - PROJECT_MANAGER: only projects where they're the PM
 * - ENGINEER: projects they have tasks/allocations on (read-only summary)
 */
export function visibilityWhere(actor: AuthedUser): Prisma.ProjectWhereInput {
  if (actor.roles.includes('ADMIN') || actor.roles.includes('FINANCE')) {
    return {};
  }
  const or: Prisma.ProjectWhereInput[] = [];
  if (actor.roles.includes('PROJECT_OWNER')) or.push({ ownerId: actor.id });
  if (actor.roles.includes('PROJECT_MANAGER')) or.push({ pmId: actor.id });
  if (actor.roles.includes('ENGINEER')) {
    or.push({ tasks: { some: { assigneeId: actor.id, deletedAt: null } } });
    or.push({ allocations: { some: { userId: actor.id } } });
  }
  if (or.length === 0) {
    // No matching role → no projects visible.
    return { id: { in: [] } };
  }
  return { OR: or };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    actor: AuthedUser,
    opts: {
      status?: ProjectStatus | undefined;
      pmId?: string | undefined;
      ownerId?: string | undefined;
      clientId?: string | undefined;
    } = {},
  ) {
    return this.prisma.project.findMany({
      where: {
        deletedAt: null,
        ...visibilityWhere(actor),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.pmId ? { pmId: opts.pmId } : {}),
        ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
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
          ownerId: input.ownerId ?? null,
          budget: input.budget ?? null,
          budgetCurrency: input.budget ? (input.budgetCurrency ?? input.contractCurrency) : null,
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
      ownerId: input.ownerId,
      budget: input.budget,
      budgetCurrency: input.budgetCurrency,
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
