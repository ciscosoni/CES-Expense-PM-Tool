import { CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { UserRole } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator.js';
import type { AuthedUser } from './auth.types.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    const user = req.user;
    if (!user) return false; // AuthGuard should have populated this

    const has = required.some((r) => user.roles.includes(r));
    if (!has) {
      throw new ForbiddenException(
        `Requires one of roles: ${required.join(', ')}; you have: ${user.roles.join(', ')}`,
      );
    }
    return true;
  }
}
