import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

const decimalString = z.string().regex(/^-?\d+(\.\d{1,4})?$/, 'Numeric, up to 4 decimals');

export const CreateChangeRequestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(3).max(160),
  type: z.enum(['SCOPE', 'TIME', 'COST', 'MIXED']),
  reason: z.string().min(3).max(2000),
  contractValueDelta: decimalString.nullable().default(null),
  budgetDelta: decimalString.nullable().default(null),
  daysDelta: z.number().int().nullable().default(null),
  scopeDelta: z.string().max(2000).nullable().default(null),
});
export class CreateChangeRequestDto extends createZodDto(CreateChangeRequestSchema) {}
export interface CreateChangeRequestDto extends z.infer<typeof CreateChangeRequestSchema> {}

export const UpdateChangeRequestSchema = CreateChangeRequestSchema.omit({ projectId: true })
  .partial();
export class UpdateChangeRequestDto extends createZodDto(UpdateChangeRequestSchema) {}
export interface UpdateChangeRequestDto extends z.infer<typeof UpdateChangeRequestSchema> {}

export const RejectChangeRequestSchema = z.object({
  reason: z.string().min(1, 'Reject reason is required').max(500),
});
export class RejectChangeRequestDto extends createZodDto(RejectChangeRequestSchema) {}
export interface RejectChangeRequestDto extends z.infer<typeof RejectChangeRequestSchema> {}
