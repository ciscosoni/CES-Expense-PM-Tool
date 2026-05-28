import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

export const CreateCostRateSchema = z.object({
  gradeId: z.string().uuid(),
  /** Decimal string to avoid float drift; e.g. "8000.00" for ₹8,000/day. */
  ratePerDay: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
  currency: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export class CreateCostRateDto extends createZodDto(CreateCostRateSchema) {}
export interface CreateCostRateDto extends z.infer<typeof CreateCostRateSchema> {}

export const UpdateCostRateSchema = CreateCostRateSchema.partial();
export class UpdateCostRateDto extends createZodDto(UpdateCostRateSchema) {}
export interface UpdateCostRateDto extends z.infer<typeof UpdateCostRateSchema> {}
