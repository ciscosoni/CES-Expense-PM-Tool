import { Injectable } from '@nestjs/common';
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
 * P6 auto-approval — SUGGEST-ONLY. Evaluates expenses against an admin-editable
 * policy and surfaces the genuinely clean ones for a human to one-click approve.
 * It never changes an expense's status itself; no money moves without a person.
 */
@Injectable()
export class AutoApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
}
