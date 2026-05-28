import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

export const CreateGradeSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Z0-9_-]+$/, 'code must be A-Z 0-9 _ -'),
  name: z.string().min(1).max(120),
  seniorityOrder: z.number().int().nonnegative(),
});
export class CreateGradeDto extends createZodDto(CreateGradeSchema) {}
// Declaration merging — instances of CreateGradeDto get the inferred shape.
export interface CreateGradeDto extends z.infer<typeof CreateGradeSchema> {}

export const UpdateGradeSchema = CreateGradeSchema.partial().extend({
  active: z.boolean().optional(),
});
export class UpdateGradeDto extends createZodDto(UpdateGradeSchema) {}
export interface UpdateGradeDto extends z.infer<typeof UpdateGradeSchema> {}
