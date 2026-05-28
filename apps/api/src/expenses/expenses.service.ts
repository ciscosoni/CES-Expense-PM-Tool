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
  project: { select: { id: true, code: true, name: true, pmId: true, ownerId: true } },
  trip: { select: { id: true, actualStart: true, actualEnd: true } },
  approver: { select: { id: true, displayName: true, email: true } },
  ownerApprover: { select: { id: true, displayName: true, email: true } },
  rejectedBy: { select: { id: true, displayName: true, email: true } },
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
    /** Slice 2B: pending the Project Owner's first-level approval. */
    pendingForOwnerId?: string | undefined;
    /** Slice 2B: pending Finance's second-level approval. */
    pendingForFinance?: boolean | undefined;
  }) {
    return this.prisma.expense.findMany({
      where: {
        deletedAt: null,
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.pendingForOwnerId
          ? { status: 'SUBMITTED', project: { ownerId: opts.pendingForOwnerId } }
          : {}),
        ...(opts.pendingForFinance ? { status: 'OWNER_APPROVED' } : {}),
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

  /**
   * Two-step approval flow (Slice 2B):
   *   SUBMITTED      → Owner approves    → OWNER_APPROVED
   *   OWNER_APPROVED → Finance approves  → APPROVED (ready to pay)
   *
   * Anyone in the chain can REJECT with a reason; the audit log records who
   * rejected at which step so the submitter sees a clear recovery path.
   */
  async approve(id: string, actor: AuthedUser): Promise<Expense> {
    const before = await this.get(id);

    if (before.status === 'SUBMITTED') {
      this.assertCanOwnerApprove(before, actor);
      const after = await this.prisma.expense.update({
        where: { id },
        data: {
          status: 'OWNER_APPROVED',
          ownerApproverId: actor.id,
          ownerApprovedAt: new Date(),
          rejectReason: null,
          rejectedById: null,
        },
      });
      await this.audit.log({
        entity: ENTITY,
        entityId: id,
        action: 'APPROVE_OWNER',
        actorId: actor.id,
        before,
        after,
      });
      return after;
    }

    if (before.status === 'OWNER_APPROVED') {
      this.assertCanFinanceApprove(actor);
      const after = await this.prisma.expense.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approverId: actor.id,
          approvedAt: new Date(),
          rejectReason: null,
          rejectedById: null,
        },
      });
      await this.audit.log({
        entity: ENTITY,
        entityId: id,
        action: 'APPROVE_FINANCE',
        actorId: actor.id,
        before,
        after,
      });
      return after;
    }

    throw new BadRequestException(
      `Cannot approve from status ${before.status} — expected SUBMITTED (Owner step) or OWNER_APPROVED (Finance step).`,
    );
  }

  async reject(id: string, input: RejectExpenseDto, actor: AuthedUser): Promise<Expense> {
    const before = await this.get(id);
    if (before.status !== 'SUBMITTED' && before.status !== 'OWNER_APPROVED') {
      throw new BadRequestException(`Cannot reject from status ${before.status}`);
    }
    if (before.status === 'SUBMITTED') {
      this.assertCanOwnerApprove(before, actor);
    } else {
      this.assertCanFinanceApprove(actor);
    }
    const after = await this.prisma.expense.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectReason: input.reason,
        rejectedById: actor.id,
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

  /**
   * Owner step: only the project's Owner (or an Admin) can act.
   * PMs no longer approve expenses — that's the founder's redesign.
   */
  private assertCanOwnerApprove(
    e: { project: { ownerId: string | null; pmId: string } | null },
    actor: AuthedUser,
  ): void {
    if (actor.roles.includes('ADMIN')) return;
    if (e.project?.ownerId && e.project.ownerId === actor.id) return;
    throw new ForbiddenException(
      'Owner approval: only the project Owner (or an Admin) can approve at this step.',
    );
  }

  /** Finance step: only Finance (or an Admin) can act. */
  private assertCanFinanceApprove(actor: AuthedUser): void {
    if (actor.roles.includes('ADMIN')) return;
    if (actor.roles.includes('FINANCE')) return;
    throw new ForbiddenException(
      'Finance approval: only FINANCE (or an Admin) can approve at this step.',
    );
  }
}
