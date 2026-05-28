import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

/**
 * Group N approved expenses (all from the same user) into a single reimbursement
 * batch. Finance then marks it PAID with a bank/Tally reference.
 */
export const CreateReimbursementSchema = z.object({
  expenseIds: z.array(z.string().uuid()).min(1),
});
export class CreateReimbursementDto extends createZodDto(CreateReimbursementSchema) {}
export interface CreateReimbursementDto extends z.infer<typeof CreateReimbursementSchema> {}

export const MarkPaidSchema = z.object({
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().min(1).max(80),
});
export class MarkPaidDto extends createZodDto(MarkPaidSchema) {}
export interface MarkPaidDto extends z.infer<typeof MarkPaidSchema> {}
