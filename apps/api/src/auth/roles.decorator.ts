import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restrict an endpoint to one or more roles. RolesGuard enforces this.
 * Omit on a route → any authenticated user is allowed.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
