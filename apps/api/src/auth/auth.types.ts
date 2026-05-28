import type { UserRole } from '@prisma/client';

/** Shape of `request.user` after AuthGuard runs. */
export interface AuthedUser {
  id: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  gradeId: string | null;
}
