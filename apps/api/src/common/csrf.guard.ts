import { CanActivate, type ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Origin-based CSRF protection for state-changing requests.
 *
 * A browser always attaches an `Origin` header to cross-origin mutating
 * requests, so rejecting unknown origins blocks the classic CSRF vector while
 * leaving server-to-server calls (no Origin) and same-origin calls untouched.
 *
 * Enforced only in production with a configured `WEB_ORIGIN` allowlist
 * (comma-separated); a no-op in local dev so the workflow isn't disrupted.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!MUTATING.has(req.method)) return true;
    if (process.env.NODE_ENV !== 'production') return true;

    const allow = (process.env.WEB_ORIGIN ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (allow.length === 0) return true; // not configured ⇒ don't block

    const origin = req.header('origin');
    // No Origin ⇒ non-browser / server-to-server call; not a CSRF vector.
    if (!origin) return true;
    if (allow.includes(origin)) return true;

    this.logger.warn(`CSRF: blocked ${req.method} ${req.url} from origin ${origin}`);
    throw new ForbiddenException('Cross-origin request blocked.');
  }
}
