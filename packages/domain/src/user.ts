import { z } from 'zod';
import { Id } from './primitives.js';

export const UserRole = z.enum(['ADMIN', 'FINANCE', 'PROJECT_MANAGER', 'APPROVER', 'ENGINEER']);
export type UserRole = z.infer<typeof UserRole>;

export const User = z.object({
  id: Id,
  azureOid: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  managerId: Id.nullable(),
  gradeId: Id.nullable(),
  roles: z.array(UserRole).min(1),
  active: z.boolean().default(true),
});
export type User = z.infer<typeof User>;
