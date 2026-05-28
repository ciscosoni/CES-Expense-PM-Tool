import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

const TaskStatus = z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED']);

export const CreateTaskSchema = z.object({
  projectId: z.string().uuid(),
  parentId: z.string().uuid().nullable().default(null),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  assigneeId: z.string().uuid().nullable().default(null),
  status: TaskStatus.default('TODO'),
  percentComplete: z.number().int().min(0).max(100).default(0),
  plannedStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  plannedEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});
export class CreateTaskDto extends createZodDto(CreateTaskSchema) {}
export interface CreateTaskDto extends z.infer<typeof CreateTaskSchema> {}

export const UpdateTaskSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  status: TaskStatus.optional(),
  percentComplete: z.number().int().min(0).max(100).optional(),
  plannedStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  plannedEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  actualStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  actualEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});
export class UpdateTaskDto extends createZodDto(UpdateTaskSchema) {}
export interface UpdateTaskDto extends z.infer<typeof UpdateTaskSchema> {}

export const CreateTimeLogSchema = z.object({
  taskId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.number().positive().max(24),
  notes: z.string().max(500).optional(),
});
export class CreateTimeLogDto extends createZodDto(CreateTimeLogSchema) {}
export interface CreateTimeLogDto extends z.infer<typeof CreateTimeLogSchema> {}
