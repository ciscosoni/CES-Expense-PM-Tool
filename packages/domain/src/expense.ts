import { z } from 'zod';
import { Id, IsoDate, MoneyAmount, CurrencyCode } from './primitives.js';

export const ExpenseCategory = z.enum([
  'TRAVEL',
  'LODGING',
  'MEALS',
  'LOCAL_CONVEYANCE',
  'COMMUNICATION',
  'MATERIALS',
  'OTHER',
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

export const ExpenseStatus = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REIMBURSED']);
export type ExpenseStatus = z.infer<typeof ExpenseStatus>;

export const Expense = z.object({
  id: Id,
  userId: Id,
  projectId: Id,
  tripId: Id.nullable(),
  category: ExpenseCategory,
  amount: MoneyAmount,
  currency: CurrencyCode,
  incurredOn: IsoDate,
  receiptUrl: z.string().url().nullable(),
  notes: z.string().optional(),
  status: ExpenseStatus,
});
export type Expense = z.infer<typeof Expense>;

export const ReimbursementStatus = z.enum(['PENDING', 'APPROVED', 'PAID', 'CANCELLED']);
export type ReimbursementStatus = z.infer<typeof ReimbursementStatus>;

export const Reimbursement = z.object({
  id: Id,
  userId: Id,
  expenseIds: z.array(Id).min(1),
  totalAmount: MoneyAmount,
  currency: CurrencyCode,
  status: ReimbursementStatus,
  paidOn: IsoDate.nullable(),
  reference: z.string().nullable(),
});
export type Reimbursement = z.infer<typeof Reimbursement>;
