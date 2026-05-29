import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

/**
 * Polymorphic entity kinds that accept comments. Kept here (not in a DB enum)
 * so adding a new commentable surface is a single-line type addition.
 */
export const COMMENTABLE_KINDS = [
  'PROJECT',
  'TASK',
  'EXPENSE',
  'TRIP',
  'CHANGE_REQUEST',
  'ATTENDANCE_REGULARIZATION',
  'RECEIPT',
] as const;

export const CreateCommentSchema = z.object({
  entityKind: z.enum(COMMENTABLE_KINDS),
  entityId: z.string().uuid(),
  body: z.string().min(1, 'Comment cannot be empty').max(4000),
  parentId: z.string().uuid().nullable().default(null),
});
export class CreateCommentDto extends createZodDto(CreateCommentSchema) {}
export interface CreateCommentDto extends z.infer<typeof CreateCommentSchema> {}

export const UpdateCommentSchema = z.object({
  body: z.string().min(1).max(4000),
});
export class UpdateCommentDto extends createZodDto(UpdateCommentSchema) {}
export interface UpdateCommentDto extends z.infer<typeof UpdateCommentSchema> {}
