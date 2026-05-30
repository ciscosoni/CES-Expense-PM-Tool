import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthedUser } from '../auth/auth.types.js';

/**
 * Rate limiter keyed by authenticated user when available, else by client IP.
 * Registered last among the global guards so `req.user` is populated for
 * protected routes (per-user limit); public/unauth routes fall back to per-IP.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request & { user?: AuthedUser }): Promise<string> {
    if (req.user?.id) return `user:${req.user.id}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }
}
