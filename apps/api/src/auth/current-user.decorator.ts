import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthedUser } from './auth.types.js';

/**
 * Inject the authenticated user into a controller method.
 *
 * @example
 *   @Get('me')
 *   me(@CurrentUser() user: AuthedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthedUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    if (!req.user) {
      throw new Error('CurrentUser used on a route with no AuthGuard');
    }
    return req.user;
  },
);
