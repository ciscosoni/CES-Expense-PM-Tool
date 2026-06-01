import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

export const CreateBillRateSchema = z.object({
  gradeId: z.string().uuid(),
  /** Decimal string; e.g. "16000.00" for ₹16,000/day charged to the client. */
  ratePerDay: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export class CreateBillRateDto extends createZodDto(CreateBillRateSchema) {}
export interface CreateBillRateDto extends z.infer<typeof CreateBillRateSchema> {}

export const UpdateBillRateSchema = CreateBillRateSchema.partial();
export class UpdateBillRateDto extends createZodDto(UpdateBillRateSchema) {}
export interface UpdateBillRateDto extends z.infer<typeof UpdateBillRateSchema> {}
