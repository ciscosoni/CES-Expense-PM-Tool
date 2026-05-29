import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

export const UpdateAnomalyRuleSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  severity: z.enum(['INFO', 'WARN', 'CRITICAL']).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});
export class UpdateAnomalyRuleDto extends createZodDto(UpdateAnomalyRuleSchema) {}
export interface UpdateAnomalyRuleDto extends z.infer<typeof UpdateAnomalyRuleSchema> {}

export const ResolveAnomalySchema = z.object({
  note: z.string().min(1).max(500),
});
export class ResolveAnomalyDto extends createZodDto(ResolveAnomalySchema) {}
export interface ResolveAnomalyDto extends z.infer<typeof ResolveAnomalySchema> {}
