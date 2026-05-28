import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

export const CreateAllocationSchema = z.object({
  userId: z.string().uuid(),
  projectId: z.string().uuid(),
  percentAllocation: z.number().int().min(1).max(100),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
});
export class CreateAllocationDto extends createZodDto(CreateAllocationSchema) {}
export interface CreateAllocationDto extends z.infer<typeof CreateAllocationSchema> {}

export const UpdateAllocationSchema = CreateAllocationSchema.partial();
export class UpdateAllocationDto extends createZodDto(UpdateAllocationSchema) {}
export interface UpdateAllocationDto extends z.infer<typeof UpdateAllocationSchema> {}
