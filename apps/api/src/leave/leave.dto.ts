import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

export const CreateLeaveSchema = z.object({
  leaveTypeId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  halfDay: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});
export class CreateLeaveDto extends createZodDto(CreateLeaveSchema) {}
export interface CreateLeaveDto extends z.infer<typeof CreateLeaveSchema> {}

export const DecideLeaveSchema = z.object({ reason: z.string().max(500).optional() });
export class DecideLeaveDto extends createZodDto(DecideLeaveSchema) {}
export interface DecideLeaveDto extends z.infer<typeof DecideLeaveSchema> {}

export const CreateHolidaySchema = z.object({
  name: z.string().min(2).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export class CreateHolidayDto extends createZodDto(CreateHolidaySchema) {}
export interface CreateHolidayDto extends z.infer<typeof CreateHolidaySchema> {}
