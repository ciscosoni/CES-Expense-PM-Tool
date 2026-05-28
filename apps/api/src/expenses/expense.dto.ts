import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

const ExpenseCategory = z.enum([
  'TRAVEL',
  'LODGING',
  'MEALS',
  'LOCAL_CONVEYANCE',
  'COMMUNICATION',
  'MATERIALS',
  'OTHER',
]);

export const CreateExpenseSchema = z.object({
  projectId: z.string().uuid(),
  tripId: z.string().uuid().nullable().default(null),
  category: ExpenseCategory,
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'Numeric, up to 4 decimals'),
  currency: z.string().length(3).toUpperCase().default('INR'),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receiptUrl: z.string().url().nullable().default(null),
  notes: z.string().max(500).optional(),
});
export class CreateExpenseDto extends createZodDto(CreateExpenseSchema) {}
export interface CreateExpenseDto extends z.infer<typeof CreateExpenseSchema> {}

export const UpdateExpenseSchema = CreateExpenseSchema.partial();
export class UpdateExpenseDto extends createZodDto(UpdateExpenseSchema) {}
export interface UpdateExpenseDto extends z.infer<typeof UpdateExpenseSchema> {}

export const RejectExpenseSchema = z.object({
  reason: z.string().min(1, 'Reject reason is required').max(500),
});
export class RejectExpenseDto extends createZodDto(RejectExpenseSchema) {}
export interface RejectExpenseDto extends z.infer<typeof RejectExpenseSchema> {}
