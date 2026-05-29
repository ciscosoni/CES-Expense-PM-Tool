import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type ChangeRequest, type ChangeRequestStatus, type Project } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { AuthedUser } from '../auth/index.js';
import type {
  CreateChangeRequestDto,
  RejectChangeRequestDto,
  UpdateChangeRequestDto,
} from './change-requests.dto.js';

const ENTITY = 'ChangeRequest';

const CR_INCLUDE = {
  project: { select: { id: true, code: true, name: true, pmId: true, ownerId: true } },
  createdBy: { select: { id: true, displayName: true, email: true } },
  approver: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.ChangeRequestInclude;

@Injectable()
export class ChangeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForProject(projectId: string) {
    return this.prisma.changeRequest.findMany({
      where: { projectId, deletedAt: null },
      include: CR_INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async listInbox(actor: AuthedUser) {
    if (actor.roles.includes('ADMIN')) {
      return this.prisma.changeRequest.findMany({
        where: { status: 'SUBMITTED', deletedAt: null },
        include: CR_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    }
    if (actor.roles.includes('PROJECT_OWNER')) {
      return this.prisma.changeRequest.findMany({
        where: {
          status: 'SUBMITTED',
          deletedAt: null,
          project: { ownerId: actor.id },
        },
        include: CR_INCLUDE,
        orderBy: { createdAt: 'desc' },
      });
    }
    return [];
  }

  async get(id: string) {
    const cr = await this.prisma.changeRequest.findFirst({
      where: { id, deletedAt: null },
      include: CR_INCLUDE,
    });
    if (!cr) throw new NotFoundException(`ChangeRequest ${id} not found`);
    return cr;
  }

  async create(input: CreateChangeRequestDto, actor: AuthedUser): Promise<ChangeRequest> {
    const project = await this.prisma.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) throw new NotFoundException(`Project ${input.projectId} not found`);
    this.assertCanCreate(project, actor);
    await this.ensureBaseline(project);

    const code = await this.nextCode(input.projectId);
    const created = await this.prisma.changeRequest.create({
      data: {
        projectId: input.projectId,
        code,
        title: input.title,
        type: input.type,
        reason: input.reason,
        contractValueDelta: input.contractValueDelta,
        budgetDelta: input.budgetDelta,
        daysDelta: input.daysDelta,
        scopeDelta: input.scopeDelta,
        status: 'DRAFT',
        createdById: actor.id,
      },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorId: actor.id,
      after: created,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateChangeRequestDto,
    actor: AuthedUser,
  ): Promise<ChangeRequest> {
    const before = await this.get(id);
    if (before.status !== 'DRAFT' && before.status !== 'REJECTED') {
      throw new BadRequestException(`Cannot edit from status ${before.status}`);
    }
    if (before.createdById !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the author can edit this change request.');
    }
    const data: Prisma.ChangeRequestUpdateInput = stripUndefined({
      title: input.title,
      type: input.type,
      reason: input.reason,
      contractValueDelta: input.contractValueDelta,
      budgetDelta: input.budgetDelta,
      daysDelta: input.daysDelta,
      scopeDelta: input.scopeDelta,
    });
    const after = await this.prisma.changeRequest.update({ where: { id }, data });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'UPDATE',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  async submit(id: string, actor: AuthedUser): Promise<ChangeRequest> {
    const before = await this.get(id);
    if (before.status !== 'DRAFT' && before.status !== 'REJECTED') {
      throw new BadRequestException(`Cannot submit from status ${before.status}`);
    }
    if (before.createdById !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the author can submit this change request.');
    }
    const after = await this.prisma.changeRequest.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedAt: new Date(), rejectReason: null },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'SUBMIT',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  /**
   * Approve a SUBMITTED CR. Applies its deltas to the project (contractValue,
   * budget, plannedEnd) and writes the resulting "current" snapshot onto the
   * CR so the baseline-vs-current view is reconstructable from the audit
   * trail.
   *
   * Only the project Owner (or an Admin) can approve.
   */
  async approve(id: string, actor: AuthedUser): Promise<ChangeRequest> {
    const before = await this.get(id);
    if (before.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot approve from status ${before.status}`);
    }
    if (
      !actor.roles.includes('ADMIN') &&
      !(actor.roles.includes('PROJECT_OWNER') && before.project.ownerId === actor.id)
    ) {
      throw new ForbiddenException('Only the project Owner (or an Admin) can approve.');
    }
    const project = await this.prisma.project.findFirstOrThrow({
      where: { id: before.projectId },
    });

    const newContract = new Decimal(project.contractValue).plus(
      new Decimal(before.contractValueDelta ?? 0),
    );
    const newBudget = project.budget
      ? new Decimal(project.budget).plus(new Decimal(before.budgetDelta ?? 0))
      : before.budgetDelta
        ? new Decimal(before.budgetDelta)
        : null;
    const newEnd = new Date(project.plannedEnd);
    if (before.daysDelta) newEnd.setUTCDate(newEnd.getUTCDate() + before.daysDelta);

    const snapshot = {
      contractValue: newContract.toString(),
      contractCurrency: project.contractCurrency,
      budget: newBudget ? newBudget.toString() : null,
      budgetCurrency: newBudget ? (project.budgetCurrency ?? project.contractCurrency) : null,
      plannedEnd: newEnd.toISOString().slice(0, 10),
    };

    const after = await this.prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({
        where: { id: project.id },
        data: {
          contractValue: newContract,
          budget: newBudget,
          budgetCurrency: newBudget ? (project.budgetCurrency ?? project.contractCurrency) : null,
          plannedEnd: newEnd,
        },
      });
      void updatedProject;
      return tx.changeRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approverId: actor.id,
          decidedAt: new Date(),
          appliedSnapshot: snapshot,
        },
      });
    });

    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'APPROVE',
      actorId: actor.id,
      before,
      after,
    });
    await this.audit.log({
      entity: 'Project',
      entityId: project.id,
      action: 'CR_APPLIED',
      actorId: actor.id,
      before: { contractValue: project.contractValue.toString(), plannedEnd: project.plannedEnd },
      after: snapshot,
    });
    return after;
  }

  async reject(
    id: string,
    input: RejectChangeRequestDto,
    actor: AuthedUser,
  ): Promise<ChangeRequest> {
    const before = await this.get(id);
    if (before.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot reject from status ${before.status}`);
    }
    if (
      !actor.roles.includes('ADMIN') &&
      !(actor.roles.includes('PROJECT_OWNER') && before.project.ownerId === actor.id)
    ) {
      throw new ForbiddenException('Only the project Owner (or an Admin) can reject.');
    }
    const after = await this.prisma.changeRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approverId: actor.id,
        decidedAt: new Date(),
        rejectReason: input.reason,
      },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'REJECT',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  async withdraw(id: string, actor: AuthedUser): Promise<ChangeRequest> {
    const before = await this.get(id);
    if (before.status !== 'SUBMITTED' && before.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot withdraw from status ${before.status}`);
    }
    if (before.createdById !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the author can withdraw this change request.');
    }
    const after = await this.prisma.changeRequest.update({
      where: { id },
      data: { status: 'WITHDRAWN' },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'WITHDRAW',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  // ---------- Baseline & helpers ----------

  /**
   * Returns baseline + current snapshot for a project. Current is just the
   * project's live fields; baseline is the snapshot taken at first save.
   * If no baseline exists yet (legacy projects pre-2D), one is created here.
   */
  async baseline(projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      include: { milestones: { orderBy: { plannedDate: 'asc' } } },
    });
    if (!project) throw new NotFoundException(`Project ${projectId} not found`);
    const baseline = await this.ensureBaseline(project);
    const totalContractDelta = await this.aggregateApprovedDelta(projectId, 'contractValueDelta');
    const totalBudgetDelta = await this.aggregateApprovedDelta(projectId, 'budgetDelta');
    const totalDaysDelta = await this.aggregateApprovedIntDelta(projectId);
    return {
      baseline: {
        contractValue: baseline.contractValue.toString(),
        contractCurrency: baseline.contractCurrency,
        budget: baseline.budget ? baseline.budget.toString() : null,
        budgetCurrency: baseline.budgetCurrency,
        plannedStart: baseline.plannedStart.toISOString().slice(0, 10),
        plannedEnd: baseline.plannedEnd.toISOString().slice(0, 10),
        snapshotAt: baseline.snapshotAt.toISOString(),
      },
      current: {
        contractValue: project.contractValue.toString(),
        contractCurrency: project.contractCurrency,
        budget: project.budget ? project.budget.toString() : null,
        budgetCurrency: project.budgetCurrency,
        plannedStart: project.plannedStart.toISOString().slice(0, 10),
        plannedEnd: project.plannedEnd.toISOString().slice(0, 10),
      },
      delta: {
        contractValue: totalContractDelta,
        budget: totalBudgetDelta,
        days: totalDaysDelta,
      },
    };
  }

  private async ensureBaseline(project: Project) {
    const existing = await this.prisma.projectBaseline.findUnique({
      where: { projectId: project.id },
    });
    if (existing) return existing;
    const milestones = await this.prisma.milestone.findMany({ where: { projectId: project.id } });
    return this.prisma.projectBaseline.create({
      data: {
        projectId: project.id,
        contractValue: project.contractValue,
        contractCurrency: project.contractCurrency,
        budget: project.budget,
        budgetCurrency: project.budgetCurrency,
        plannedStart: project.plannedStart,
        plannedEnd: project.plannedEnd,
        scopeSummary: `Baseline auto-captured at first CR.`,
        milestonesJson: milestones.map((m) => ({
          name: m.name,
          value: m.value.toString(),
          currency: m.currency,
          plannedDate: m.plannedDate.toISOString().slice(0, 10),
        })),
      },
    });
  }

  private async nextCode(projectId: string): Promise<string> {
    const last = await this.prisma.changeRequest.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { code: true },
    });
    if (!last) return 'CR-001';
    const m = last.code.match(/^CR-(\d+)$/);
    const n = m ? parseInt(m[1]!, 10) + 1 : 1;
    return `CR-${n.toString().padStart(3, '0')}`;
  }

  private async aggregateApprovedDelta(
    projectId: string,
    field: 'contractValueDelta' | 'budgetDelta',
  ): Promise<string> {
    const rows = await this.prisma.changeRequest.findMany({
      where: { projectId, status: 'APPROVED', deletedAt: null },
      select: { [field]: true } as Prisma.ChangeRequestSelect,
    });
    const sum = rows.reduce((acc: Decimal, r) => {
      const v = (r as Record<string, unknown>)[field];
      return v ? acc.plus(new Decimal(v as string | number)) : acc;
    }, new Decimal(0));
    return sum.toString();
  }

  private async aggregateApprovedIntDelta(projectId: string): Promise<number> {
    const rows = await this.prisma.changeRequest.findMany({
      where: { projectId, status: 'APPROVED', deletedAt: null },
      select: { daysDelta: true },
    });
    return rows.reduce((acc, r) => acc + (r.daysDelta ?? 0), 0);
  }

  private assertCanCreate(project: Project, actor: AuthedUser): void {
    if (actor.roles.includes('ADMIN')) return;
    if (actor.roles.includes('PROJECT_OWNER') && project.ownerId === actor.id) return;
    if (actor.roles.includes('PROJECT_MANAGER') && project.pmId === actor.id) return;
    throw new ForbiddenException(
      'Only the project Owner, PM, or an Admin can create a change request.',
    );
  }

  // Surface the status enum for the controller (avoids a separate import there).
  readonly statuses: ChangeRequestStatus[] = [
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'WITHDRAWN',
  ];
}
