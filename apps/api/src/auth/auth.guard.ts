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
import { createEntraVerifier, resolveAuthMode, type EntraVerifier } from './entra.js';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Decorator that marks a route as not requiring auth (e.g. /health, /docs).
 * Use sparingly — every non-public endpoint MUST attach an authenticated user.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Authenticates the request and attaches `request.user`.
 *
 * Two modes, resolved by {@link resolveAuthMode}:
 * - **dev** (local default): trusts the `X-Dev-User-Email` header, falling back
 *   to `DEV_AUTH_DEFAULT_EMAIL` then `admin@cestech.in`.
 * - **entra** (prod with a real tenant, or `AUTH_MODE=entra`): validates a
 *   Microsoft Entra ID bearer JWT and maps `oid → User` (linking an existing
 *   seeded user by email on first login). The `AuthedUser` contract is identical
 *   in both modes, so guards/controllers never change.
 *
 * `ALLOW_DEV_AUTH_IN_PROD=true` keeps the dev-header path usable behind an IP
 * allowlist during the cutover window — never on a public URL.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private verifier: EntraVerifier | null = null;

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
    const mode = resolveAuthMode(process.env);

    if (mode === 'entra') {
      const token = this.extractBearer(req);
      if (token) {
        req.user = await this.authenticateEntra(token);
        return true;
      }
      // No token: only fall through to the dev-header path if explicitly allowed
      // (private-network cutover). Otherwise reject.
      if (process.env.ALLOW_DEV_AUTH_IN_PROD !== 'true') {
        throw new UnauthorizedException('Missing or malformed Authorization bearer token.');
      }
    }

    return this.authenticateDevHeader(req);
  }

  private extractBearer(req: Request): string | null {
    const header = req.header('authorization') ?? req.header('Authorization');
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) return null;
    return value.trim();
  }

  private getVerifier(): EntraVerifier {
    if (!this.verifier) {
      this.verifier = createEntraVerifier({
        tenantId: process.env.AZURE_TENANT_ID ?? '',
        audience: process.env.AZURE_API_AUDIENCE ?? '',
      });
    }
    return this.verifier;
  }

  private async authenticateEntra(token: string): Promise<AuthedUser> {
    let claims;
    try {
      claims = await this.getVerifier().verify(token);
    } catch (err) {
      this.logger.warn(`Entra token rejected: ${err instanceof Error ? err.message : err}`);
      throw new UnauthorizedException('Invalid or expired Microsoft sign-in token.');
    }

    // Prefer the stable oid; on first real login, link a seeded user by email
    // so existing records adopt their Entra object id.
    let user = await this.prisma.user.findFirst({
      where: { azureOid: claims.oid, active: true, deletedAt: null },
      select: { id: true, email: true, displayName: true, roles: true, gradeId: true },
    });

    if (!user && claims.email) {
      const byEmail = await this.prisma.user.findFirst({
        where: { email: claims.email, active: true, deletedAt: null },
        select: { id: true },
      });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: { azureOid: claims.oid },
          select: { id: true, email: true, displayName: true, roles: true, gradeId: true },
        });
      }
    }

    if (!user) {
      throw new UnauthorizedException(
        `No active CES Tech user for ${claims.email || claims.oid}. Ask an admin to run the Graph sync.`,
      );
    }
    return user;
  }

  private async authenticateDevHeader(req: Request & { user?: AuthedUser }): Promise<boolean> {
    const isProd = process.env.NODE_ENV === 'production';
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
