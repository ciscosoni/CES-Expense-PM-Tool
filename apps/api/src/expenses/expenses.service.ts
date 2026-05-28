import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Expense, ExpenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { AuthedUser } from '../auth/index.js';
import type { CreateExpenseDto, RejectExpenseDto, UpdateExpenseDto } from './expense.dto.js';

const ENTITY = 'Expense';

const EXPENSE_INCLUDE = {
  user: { select: { id: true, displayName: true, email: true } },
  project: { select: { id: true, code: true, name: true, pmId: true } },
  trip: { select: { id: true, actualStart: true, actualEnd: true } },
  approver: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.ExpenseInclude;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: {
    userId?: string | undefined;
    projectId?: string | undefined;
    status?: ExpenseStatus | undefined;
    pendingForApproverId?: string | undefined;
  }) {
    return this.prisma.expense.findMany({
      where: {
        deletedAt: null,
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.pendingForApproverId
          ? { status: 'SUBMITTED', project: { pmId: opts.pendingForApproverId } }
          : {}),
      },
      include: EXPENSE_INCLUDE,
      orderBy: [{ status: 'asc' }, { incurredOn: 'desc' }],
    });
  }

  async get(id: string) {
    const e = await this.prisma.expense.findFirst({
      where: { id, deletedAt: null },
      include: EXPENSE_INCLUDE,
    });
    if (!e) throw new NotFoundException(`Expense ${id} not found`);
    return e;
  }

  async create(input: CreateExpenseDto, actor: AuthedUser): Promise<Expense> {
    const created = await this.prisma.expense.create({
      data: {
        userId: actor.id,
        projectId: input.projectId,
        tripId: input.tripId,
        category: input.category,
        amount: input.amount,
        currency: input.currency,
        incurredOn: new Date(input.incurredOn),
        receiptUrl: input.receiptUrl,
        notes: input.notes ?? null,
        status: 'DRAFT',
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

  async update(id: string, input: UpdateExpenseDto, actor: AuthedUser): Promise<Expense> {
    const before = await this.get(id);
    if (before.userId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the submitter can edit this expense');
    }
    if (before.status !== 'DRAFT' && before.status !== 'REJECTED') {
      throw new BadRequestException(`Cannot edit from status ${before.status}`);
    }
    const data: Prisma.ExpenseUpdateInput = stripUndefined({
      project: input.projectId ? { connect: { id: input.projectId } } : undefined,
      trip:
        input.tripId === undefined
          ? undefined
          : input.tripId === null
            ? { disconnect: true }
            : { connect: { id: input.tripId } },
      category: input.category,
      amount: input.amount,
      currency: input.currency,
      incurredOn: input.incurredOn ? new Date(input.incurredOn) : undefined,
      receiptUrl: input.receiptUrl,
      notes: input.notes,
    });
    const after = await this.prisma.expense.update({ where: { id }, data });
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

  async submit(id: string, actor: AuthedUser): Promise<Expense> {
    const before = await this.get(id);
    if (before.userId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the submitter can submit this expense');
    }
    if (before.status !== 'DRAFT' && before.status !== 'REJECTED') {
      throw new BadRequestException(`Cannot submit from status ${before.status}`);
    }
    const after = await this.prisma.expense.update({
      where: { id },
      data: { status: 'SUBMITTED', rejectReason: null },
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

  async approve(id: string, actor: AuthedUser): Promise<Expense> {
    const before = await this.get(id);
    this.assertCanApprove(before, actor);
    if (before.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot approve from status ${before.status}`);
    }
    const after = await this.prisma.expense.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approverId: actor.id,
        approvedAt: new Date(),
        rejectReason: null,
      },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'APPROVE',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  async reject(id: string, input: RejectExpenseDto, actor: AuthedUser): Promise<Expense> {
    const before = await this.get(id);
    this.assertCanApprove(before, actor);
    if (before.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot reject from status ${before.status}`);
    }
    const after = await this.prisma.expense.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approverId: actor.id,
        approvedAt: new Date(),
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

  async delete(id: string, actor: AuthedUser): Promise<void> {
    const before = await this.get(id);
    if (before.userId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the submitter can delete this expense');
    }
    if (before.status === 'REIMBURSED') {
      throw new BadRequestException('Cannot delete a reimbursed expense');
    }
    await this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'DELETE',
      actorId: actor.id,
      before,
    });
  }

  private assertCanApprove(e: { project: { pmId: string } | null }, actor: AuthedUser): void {
    if (actor.roles.includes('ADMIN')) return;
    if (actor.roles.includes('FINANCE')) return;
    if (e.project && e.project.pmId === actor.id) return;
    throw new ForbiddenException(
      'Only the project PM, FINANCE, or ADMIN can approve/reject this expense',
    );
  }
}
