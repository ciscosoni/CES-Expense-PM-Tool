import Decimal from 'decimal.js';
import type { ApprovalInstance, ApprovalWorkflow, Id, IsoDateTime, MoneyAmount } from '@ces/domain';

export interface RequesterContext {
  /** The user submitting the item (engineer, PM, etc.). */
  userId: Id;
  /** Reporting manager from Azure AD; null if user has no manager (e.g. director). */
  reportingManagerId: Id | null;
  /** Project manager on the relevant project, if applicable. */
  projectManagerId?: Id;
  /** Roles held by the requester (used when step approver = ROLE). */
  roles: readonly string[];
}

export interface InstantiateInput {
  workflow: ApprovalWorkflow;
  subjectId: Id;
  /** The amount on the approvable item. Used for threshold-based step skipping. */
  amount: MoneyAmount;
  requester: RequesterContext;
  /** Function the host provides to resolve role → user. Returns null when unresolved. */
  resolveRoleApprover: (role: string) => Id | null;
  now: IsoDateTime;
}

/**
 * Instantiate a workflow for a specific approvable item. Steps whose minAmount > amount
 * are pre-marked SKIPPED. The first remaining step is left PENDING with its approver resolved.
 */
export function instantiateWorkflow(input: InstantiateInput): ApprovalInstance {
  const amount = new Decimal(input.amount);

  const steps = input.workflow.steps.map((step) => {
    const skipped = step.minAmount !== undefined && amount.lt(step.minAmount);
    let approverUserId: Id | null = null;
    if (!skipped) {
      switch (step.approverKind) {
        case 'REPORTING_MANAGER':
          approverUserId = input.requester.reportingManagerId;
          break;
        case 'PROJECT_MANAGER':
          approverUserId = input.requester.projectManagerId ?? null;
          break;
        case 'ROLE':
          if (!step.approverRole) {
            throw new Error('Approval: ROLE step missing approverRole');
          }
          approverUserId = input.resolveRoleApprover(step.approverRole);
          break;
        case 'NAMED_USER':
          if (!step.approverUserId) {
            throw new Error('Approval: NAMED_USER step missing approverUserId');
          }
          approverUserId = step.approverUserId;
          break;
      }
    }

    return {
      order: step.order,
      approverUserId,
      result: skipped ? ('SKIPPED' as const) : ('PENDING' as const),
      actedAt: null,
      comment: null,
    };
  });

  // If all steps are skipped, instance is auto-approved.
  const anyPending = steps.some((s) => s.result === 'PENDING');

  return {
    id: cryptoRandomId(),
    workflowId: input.workflow.id,
    subjectKind: input.workflow.appliesTo,
    subjectId: input.subjectId,
    status: anyPending ? 'PENDING' : 'APPROVED',
    steps,
    createdAt: input.now,
  };
}

export interface AdvanceInput {
  instance: ApprovalInstance;
  actorUserId: Id;
  decision: 'APPROVE' | 'REJECT';
  comment?: string;
  now: IsoDateTime;
}

export interface AdvanceResult {
  instance: ApprovalInstance;
  /** True iff this action moved the instance to APPROVED or REJECTED. */
  terminal: boolean;
}

/**
 * Apply an approve/reject decision on the *current* pending step.
 * Throws if the actor is not the resolved approver or if the instance is already terminal.
 */
export function advance(input: AdvanceInput): AdvanceResult {
  if (input.instance.status !== 'PENDING') {
    throw new Error(`Approval: instance already ${input.instance.status}`);
  }

  const currentIdx = input.instance.steps.findIndex((s) => s.result === 'PENDING');
  if (currentIdx === -1) {
    throw new Error('Approval: no pending step (data corruption)');
  }
  const current = input.instance.steps[currentIdx]!;

  if (current.approverUserId !== input.actorUserId) {
    throw new Error(
      `Approval: actor ${input.actorUserId} is not the approver (${current.approverUserId ?? 'unresolved'})`,
    );
  }

  const updatedStep = {
    ...current,
    result: input.decision === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const),
    actedAt: input.now,
    comment: input.comment ?? null,
  };

  const newSteps = [...input.instance.steps];
  newSteps[currentIdx] = updatedStep;

  if (input.decision === 'REJECT') {
    return {
      instance: { ...input.instance, status: 'REJECTED', steps: newSteps },
      terminal: true,
    };
  }

  const nextPending = newSteps.find((s) => s.result === 'PENDING');
  const newStatus = nextPending ? 'PENDING' : 'APPROVED';

  return {
    instance: { ...input.instance, status: newStatus, steps: newSteps },
    terminal: !nextPending,
  };
}

function cryptoRandomId(): Id {
  // crypto.randomUUID is available in Node 19+ and modern browsers.
  return globalThis.crypto.randomUUID();
}
