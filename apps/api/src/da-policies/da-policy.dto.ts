import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

export const CreateDaPolicySchema = z.object({
  name: z.string().min(1).max(120),
  /** 0..1 fraction applied to departure-day and return-day. E.g. 0.5 = half day. */
  partialDayPercent: z.number().min(0).max(1),
  intraCitySameDayPaysDa: z.boolean(),
  /** ISO date (YYYY-MM-DD). Policy applies to trips on or after this date. */
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export class CreateDaPolicyDto extends createZodDto(CreateDaPolicySchema) {}
export interface CreateDaPolicyDto extends z.infer<typeof CreateDaPolicySchema> {}

export const UpdateDaPolicySchema = CreateDaPolicySchema.partial();
export class UpdateDaPolicyDto extends createZodDto(UpdateDaPolicySchema) {}
export interface UpdateDaPolicyDto extends z.infer<typeof UpdateDaPolicySchema> {}
