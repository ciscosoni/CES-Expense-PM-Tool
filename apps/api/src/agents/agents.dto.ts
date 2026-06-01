import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

/** Admin update of the suggest-only auto-approval policy. All fields optional. */
export const UpdateAutoApprovalPolicySchema = z.object({
  enabled: z.boolean().optional(),
  maxAmount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, 'Decimal amount')
    .optional(),
  currency: z.string().length(3).optional(),
  requireReceipt: z.boolean().optional(),
  requireNoFlags: z.boolean().optional(),
});
export class UpdateAutoApprovalPolicyDto extends createZodDto(UpdateAutoApprovalPolicySchema) {}
export interface UpdateAutoApprovalPolicyDto
  extends z.infer<typeof UpdateAutoApprovalPolicySchema> {}
