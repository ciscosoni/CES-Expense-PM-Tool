import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

/**
 * Records every state change on a tracked entity. Drives the "tap to see history"
 * UX everywhere — defuses the "leadership fighting over numbers" pain point.
 *
 * Per CLAUDE.md §10 #5, every controller that mutates a financial entity
 * must call `log()` after the mutation.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(args: {
    entity: string;
    entityId: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | string;
    actorId: string | null;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    const data: Prisma.AuditLogCreateInput = {
      entity: args.entity,
      entityId: args.entityId,
      action: args.action,
      actorId: args.actorId,
    };
    if (args.before !== undefined) {
      data.before = args.before as Prisma.InputJsonValue;
    }
    if (args.after !== undefined) {
      data.after = args.after as Prisma.InputJsonValue;
    }
    await this.prisma.auditLog.create({ data });
  }
}
