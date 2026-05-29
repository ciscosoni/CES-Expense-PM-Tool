import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service.js';
import type { AuthedUser } from './auth.types.js';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Decorator that marks a route as not requiring auth (e.g. /health, /docs).
 * Use sparingly — every non-public endpoint MUST attach an authenticated user.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Authenticates the request and attaches `request.user`.
 *
 * Dev mode (NODE_ENV !== 'production'): trusts the `X-Dev-User-Email` header.
 *   - Default falls back to `DEV_AUTH_DEFAULT_EMAIL` env var, then `admin@cestech.in`.
 *   - This is the seam where real MSAL JWT validation slots in for production —
 *     the AuthedUser contract on `request.user` stays the same so guards/controllers
 *     don't need to change.
 *
 * Prod mode: not implemented yet — throws 401. MSAL JWT validation lands in a
 * dedicated commit before any production deploy.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthedUser }>();
    const isProd = process.env.NODE_ENV === 'production';
    const allowDevAuthInProd = process.env.ALLOW_DEV_AUTH_IN_PROD === 'true';

    if (isProd && !allowDevAuthInProd) {
      // MSAL JWT validation via jwks-rsa lands in Batch 4. Until then, a prod
      // deploy can opt into the dev-header path with ALLOW_DEV_AUTH_IN_PROD=true
      // ONLY if the environment is locked behind an IP allowlist or VPN —
      // never open this on a public URL.
      this.logger.warn(
        `Blocked unauthenticated request to ${req.method} ${req.url} — Entra ID auth not wired yet. Set ALLOW_DEV_AUTH_IN_PROD=true to fall back to the dev-header path (private networks only).`,
      );
      throw new UnauthorizedException(
        'Production authentication is not yet configured. See DEPLOYMENT.md Batch 4.',
      );
    }

    const headerEmail = req.header('x-dev-user-email');
    const email =
      (typeof headerEmail === 'string' && headerEmail.trim()) ||
      process.env.DEV_AUTH_DEFAULT_EMAIL ||
      (isProd ? '' : 'admin@cestech.in');

    if (!email) {
      throw new UnauthorizedException('Missing X-Dev-User-Email header.');
    }

    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), active: true, deletedAt: null },
      select: { id: true, email: true, displayName: true, roles: true, gradeId: true },
    });

    if (!user) {
      throw new UnauthorizedException(
        `Dev auth: no active user with email ${email}. Run \`pnpm --filter @ces/api prisma:seed\`.`,
      );
    }

    req.user = user;
    return true;
  }
}
