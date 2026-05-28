import { z } from 'zod';
import { Id, IsoDateTime, MoneyAmount } from './primitives.js';

export const ApprovableKind = z.enum([
  'TRAVEL_REQUEST',
  'EXPENSE',
  'REIMBURSEMENT',
  'ATTENDANCE_REGULARIZATION',
  'PROJECT_CHANGE_REQUEST',
]);
export type ApprovableKind = z.infer<typeof ApprovableKind>;

/**
 * Approval workflow definition (admin-editable). Steps are evaluated in order; routing rules
 * decide which approver(s) get the step. Threshold rules read from amount on the approvable item.
 */
export const ApprovalStepDefinition = z.object({
  order: z.number().int().nonnegative(),
  name: z.string(),
  /** Discriminator for who approves this step. */
  approverKind: z.enum(['REPORTING_MANAGER', 'PROJECT_MANAGER', 'ROLE', 'NAMED_USER']),
  /** Required when approverKind === 'ROLE'. */
  approverRole: z.string().optional(),
  /** Required when approverKind === 'NAMED_USER'. */
  approverUserId: Id.optional(),
  /** Optional amount threshold; step skipped if item amount < this. */
  minAmount: MoneyAmount.optional(),
});

export const ApprovalWorkflow = z.object({
  id: Id,
  appliesTo: ApprovableKind,
  name: z.string(),
  steps: z.array(ApprovalStepDefinition).min(1),
  active: z.boolean().default(true),
});
export type ApprovalWorkflow = z.infer<typeof ApprovalWorkflow>;

export const ApprovalInstanceStatus = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN']);
export type ApprovalInstanceStatus = z.infer<typeof ApprovalInstanceStatus>;

export const ApprovalStepResult = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SKIPPED']);
export type ApprovalStepResult = z.infer<typeof ApprovalStepResult>;

export const ApprovalStepInstance = z.object({
  order: z.number().int().nonnegative(),
  approverUserId: Id.nullable(),
  result: ApprovalStepResult,
  actedAt: IsoDateTime.nullable(),
  comment: z.string().nullable(),
});

export const ApprovalInstance = z.object({
  id: Id,
  workflowId: Id,
  subjectKind: ApprovableKind,
  subjectId: Id,
  status: ApprovalInstanceStatus,
  steps: z.array(ApprovalStepInstance),
  createdAt: IsoDateTime,
});
export type ApprovalInstance = z.infer<typeof ApprovalInstance>;
