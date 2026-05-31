import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import type { Prisma, Reimbursement } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { AuthedUser } from '../auth/index.js';
import type { CreateReimbursementDto, MarkPaidDto } from './reimbursement.dto.js';

const ENTITY = 'Reimbursement';

const R_INCLUDE = {
  user: { select: { id: true, displayName: true, email: true } },
  expenses: {
    select: {
      id: true,
      category: true,
      amount: true,
      currency: true,
      incurredOn: true,
      notes: true,
      project: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.ReimbursementInclude;

@Injectable()
export class ReimbursementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(status?: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED') {
    return this.prisma.reimbursement.findMany({
      where: status ? { status } : {},
      include: R_INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Lists APPROVED expenses (not yet attached to any reimbursement) grouped
   * by user — the natural unit of payout. This is what the Finance queue
   * UI reads to build a batch.
   */
  async listEligibleExpensesByUser() {
    const rows = await this.prisma.expense.findMany({
      where: { status: 'APPROVED', reimbursementId: null, deletedAt: null },
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ userId: 'asc' }, { incurredOn: 'asc' }],
    });
    const grouped = new Map<
      string,
      {
        user: { id: string; displayName: string; email: string };
        totalAmount: Decimal;
        currency: string;
        expenses: typeof rows;
      }
    >();
    for (const row of rows) {
      const existing = grouped.get(row.userId);
      if (existing) {
        existing.expenses.push(row);
        existing.totalAmount = existing.totalAmount.plus(row.amount);
      } else {
        grouped.set(row.userId, {
          user: row.user,
          totalAmount: new Decimal(row.amount),
          currency: row.currency,
          expenses: [row],
        });
      }
    }
    return Array.from(grouped.values()).map((g) => ({
      ...g,
      totalAmount: g.totalAmount.toFixed(2),
    }));
  }

  async get(id: string) {
    const r = await this.prisma.reimbursement.findUnique({
      where: { id },
      include: R_INCLUDE,
    });
    if (!r) throw new NotFoundException(`Reimbursement ${id} not found`);
    return r;
  }

  async create(input: CreateReimbursementDto, actor: AuthedUser): Promise<Reimbursement> {
    const expenses = await this.prisma.expense.findMany({
      where: {
        id: { in: input.expenseIds },
        deletedAt: null,
      },
    });
    if (expenses.length !== input.expenseIds.length) {
      throw new BadRequestException('Some expenses not found or deleted');
    }
    const userIds = new Set(expenses.map((e) => e.userId));
    if (userIds.size !== 1) {
      throw new BadRequestException('All expenses must belong to the same user');
    }
    const currencies = new Set(expenses.map((e) => e.currency));
    if (currencies.size !== 1) {
      throw new BadRequestException('All expenses must use the same currency');
    }
    const notApproved = expenses.filter((e) => e.status !== 'APPROVED');
    if (notApproved.length > 0) {
      throw new BadRequestException(
        `All expenses must be APPROVED — found ${notApproved.length} in other statuses`,
      );
    }
    const already = expenses.filter((e) => e.reimbursementId !== null);
    if (already.length > 0) {
      throw new BadRequestException(`${already.length} expense(s) already in a reimbursement`);
    }

    const total = expenses.reduce((s, e) => s.plus(e.amount), new Decimal(0));

    const created = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reimbursement.create({
        data: {
          userId: [...userIds][0]!,
          totalAmount: total.toFixed(2),
          currency: [...currencies][0]!,
          status: 'PENDING',
        },
      });
      await tx.expense.updateMany({
        where: { id: { in: input.expenseIds } },
        data: { reimbursementId: r.id },
      });
      return r;
    });

    await this.audit.log({
      entity: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorId: actor.id,
      after: { ...created, expenseIds: input.expenseIds },
    });
    return created;
  }

  async markPaid(id: string, input: MarkPaidDto, actor: AuthedUser): Promise<Reimbursement> {
    const before = await this.get(id);
    if (before.status === 'PAID') {
      throw new BadRequestException('Already marked PAID');
    }
    if (before.status === 'CANCELLED') {
      throw new BadRequestException('Cannot pay a CANCELLED reimbursement');
    }
    const after = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reimbursement.update({
        where: { id },
        data: {
          status: 'PAID',
          paidOn: new Date(input.paidOn),
          reference: input.reference,
        },
      });
      await tx.expense.updateMany({
        where: { reimbursementId: id },
        data: { status: 'REIMBURSED' },
      });
      return r;
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'PAID',
      actorId: actor.id,
      before,
      after,
    });

    await this.notifications.notify({
      userId: before.userId,
      kind: 'REIMBURSEMENT_PAID',
      title: `Reimbursement paid — ${before.currency} ${before.totalAmount}`,
      body: input.reference ? `Reference: ${input.reference}` : undefined,
      severity: 'INFO',
      entityKind: 'REIMBURSEMENT',
      entityId: id,
      linkPath: '/expenses',
    });
    return after;
  }

  async cancel(id: string, actor: AuthedUser): Promise<Reimbursement> {
    const before = await this.get(id);
    if (before.status === 'PAID') {
      throw new BadRequestException('Cannot cancel a PAID reimbursement');
    }
    const after = await this.prisma.$transaction(async (tx) => {
      const r = await tx.reimbursement.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
      // Detach the expenses so they can be regrouped into a new batch.
      await tx.expense.updateMany({
        where: { reimbursementId: id },
        data: { reimbursementId: null },
      });
      return r;
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'CANCEL',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }
}
