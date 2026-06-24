import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, type AutoApprovalPolicy } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthedUser } from '../auth/index.js';
import type { UpdateAutoApprovalPolicyDto } from './agents.dto.js';

export interface AutoApproveSuggestion {
  expenseId: string;
  amount: string;
  currency: string;
  submitter: string;
  project: string;
  reasons: string[];
}

/**
 * Auto-approval against an admin-editable policy. Two modes:
 *  - SUGGEST-ONLY (P6, always on when `enabled`): surfaces clean expenses for a
 *    human to one-click approve. Never changes status.
 *  - CONFIDENT (P10 #4, opt-in via `autoApprove`, default OFF): auto-advances
 *    clean, in-policy, under-cap expenses through the OWNER step only
 *    (SUBMITTED → OWNER_APPROVED). FINANCE still does the final human review, so
 *    no money becomes payable without a person. Every auto-action writes an audit
 *    row with a null (system) actor; admins can disable instantly. The eligibility
 *    rule is the same deterministic {@link evaluate} used for suggestions — no AI
 *    decides money.
 */
@Injectable()
export class AutoApprovalService {
  private readonly logger = new Logger(AutoApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private schedulerEnabled(): boolean {
    return process.env.SCHEDULER_DISABLED !== 'true';
  }

  /** The single active policy; lazily seeded with a conservative default. */
  async getPolicy(): Promise<AutoApprovalPolicy> {
    const existing = await this.prisma.autoApprovalPolicy.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.autoApprovalPolicy.create({
      data: { enabled: true, maxAmount: '2000', currency: 'INR' },
    });
  }

  async updatePolicy(input: UpdateAutoApprovalPolicyDto, actor: AuthedUser): Promise<AutoApprovalPolicy> {
    const policy = await this.getPolicy();
    // Build the patch without undefined keys (exactOptionalPropertyTypes).
    const data: Prisma.AutoApprovalPolicyUpdateInput = { updatedById: actor.id };
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.autoApprove !== undefined) data.autoApprove = input.autoApprove;
    if (input.maxAmount !== undefined) data.maxAmount = input.maxAmount;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.requireReceipt !== undefined) data.requireReceipt = input.requireReceipt;
    if (input.requireNoFlags !== undefined) data.requireNoFlags = input.requireNoFlags;
    const updated = await this.prisma.autoApprovalPolicy.update({
      where: { id: policy.id },
      data,
    });
    await this.audit.log({
      entity: 'AutoApprovalPolicy',
      entityId: policy.id,
      action: 'UPDATED',
      actorId: actor.id,
      before: { ...policy, maxAmount: policy.maxAmount.toString() },
      after: { ...updated, maxAmount: updated.maxAmount.toString() },
    });
    return updated;
  }

  /**
   * Clean expenses in the actor's approval queue that pass the policy. Owners see
   * SUBMITTED expenses on their projects; Finance/Admin see OWNER_APPROVED ones.
   */
  async suggestionsFor(actor: AuthedUser): Promise<{
    policy: { enabled: boolean; maxAmount: string; currency: string };
    suggestions: AutoApproveSuggestion[];
  }> {
    const policy = await this.getPolicy();
    const policyOut = {
      enabled: policy.enabled,
      maxAmount: policy.maxAmount.toString(),
      currency: policy.currency,
    };
    if (!policy.enabled) return { policy: policyOut, suggestions: [] };

    const isFinance = actor.roles.includes('FINANCE') || actor.roles.includes('ADMIN');
    const isOwner = actor.roles.includes('PROJECT_OWNER');
    if (!isFinance && !isOwner) return { policy: policyOut, suggestions: [] };

    const where = isFinance
      ? { deletedAt: null, status: 'OWNER_APPROVED' as const }
      : { deletedAt: null, status: 'SUBMITTED' as const, project: { ownerId: actor.id } };

    const expenses = await this.prisma.expense.findMany({
      where,
      select: {
        id: true,
        amount: true,
        currency: true,
        user: { select: { displayName: true } },
        project: { select: { code: true } },
        receipts: { select: { flags: { select: { severity: true } } } },
      },
    });

    const suggestions: AutoApproveSuggestion[] = [];
    for (const e of expenses) {
      const verdict = this.evaluate(
        { amount: e.amount.toString(), currency: e.currency, receipts: e.receipts },
        policy,
      );
      if (verdict.eligible) {
        suggestions.push({
          expenseId: e.id,
          amount: e.amount.toString(),
          currency: e.currency,
          submitter: e.user.displayName,
          project: e.project.code,
          reasons: verdict.reasons,
        });
      }
    }
    return { policy: policyOut, suggestions };
  }

  /** Pure-ish evaluation of one expense against the policy. */
  private evaluate(
    e: { amount: string; currency: string; receipts: { flags: { severity: string }[] }[] },
    policy: AutoApprovalPolicy,
  ): { eligible: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (e.currency !== policy.currency) {
      return { eligible: false, reasons: [`currency ${e.currency} ≠ policy ${policy.currency}`] };
    }
    if (Number(e.amount) > Number(policy.maxAmount)) {
      return { eligible: false, reasons: [`over ${policy.currency} ${policy.maxAmount} cap`] };
    }
    reasons.push(`within ${policy.currency} ${policy.maxAmount} cap`);

    const hasReceipt = e.receipts.length > 0;
    if (policy.requireReceipt && !hasReceipt) {
      return { eligible: false, reasons: ['no receipt attached'] };
    }
    if (hasReceipt) reasons.push('receipt attached');

    const flagged = e.receipts.some((r) =>
      r.flags.some((f) => f.severity === 'WARN' || f.severity === 'BLOCK'),
    );
    if (policy.requireNoFlags && flagged) {
      return { eligible: false, reasons: ['has unresolved fraud flags'] };
    }
    reasons.push('no fraud flags');

    return { eligible: true, reasons };
  }

  /**
   * CONFIDENT auto-approval (P10 #4). When `policy.autoApprove` is on, advance
   * clean SUBMITTED expenses through the OWNER step only — Finance still reviews.
   * No-op (and no money moves) when the flag is off. Each transition is its own
   * try/catch so one failure can't abort the batch; capped per run.
   */
  async runAutoApproval(): Promise<{
    autoApprove: boolean;
    evaluated: number;
    approved: number;
    items: AutoApproveSuggestion[];
  }> {
    const policy = await this.getPolicy();
    if (!policy.autoApprove) {
      return { autoApprove: false, evaluated: 0, approved: 0, items: [] };
    }

    const expenses = await this.prisma.expense.findMany({
      where: { deletedAt: null, status: 'SUBMITTED' },
      include: {
        user: { select: { displayName: true } },
        project: { select: { code: true } },
        receipts: { select: { flags: { select: { severity: true } } } },
      },
      orderBy: { incurredOn: 'asc' },
      take: 200,
    });

    const items: AutoApproveSuggestion[] = [];
    let approved = 0;
    for (const e of expenses) {
      const verdict = this.evaluate(
        { amount: e.amount.toString(), currency: e.currency, receipts: e.receipts },
        policy,
      );
      if (!verdict.eligible) continue;
      try {
        const after = await this.prisma.expense.update({
          where: { id: e.id, status: 'SUBMITTED' }, // guard against a concurrent human action
          data: {
            status: 'OWNER_APPROVED',
            ownerApproverId: null, // null = auto-approved by the system, not a person
            ownerApprovedAt: new Date(),
            rejectReason: null,
            rejectedById: null,
          },
        });
        await this.audit.log({
          entity: 'Expense',
          entityId: e.id,
          action: 'AUTO_APPROVE_OWNER',
          actorId: null, // system actor
          before: { status: 'SUBMITTED' },
          after: { status: after.status, reasons: verdict.reasons },
        });
        approved++;
        items.push({
          expenseId: e.id,
          amount: e.amount.toString(),
          currency: e.currency,
          submitter: e.user.displayName,
          project: e.project.code,
          reasons: verdict.reasons,
        });
      } catch (err) {
        this.logger.warn(
          `Auto-approval skipped expense ${e.id} (${err instanceof Error ? err.message : 'update failed'})`,
        );
      }
    }
    if (approved > 0) {
      this.logger.log(`Auto-approved ${approved}/${expenses.length} SUBMITTED expense(s) through the owner step.`);
    }
    return { autoApprove: true, evaluated: expenses.length, approved, items };
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'auto-approval' })
  async scheduledAutoApproval(): Promise<void> {
    if (!this.schedulerEnabled()) return;
    try {
      await this.runAutoApproval();
    } catch (err) {
      this.logger.error(`Scheduled auto-approval failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
