import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { createOutboundChannel, type OutboundChannel } from './outbound.channel.js';

export interface NotifyInput {
  userId: string;
  kind: string;
  title: string;
  body?: string | undefined;
  severity?: 'INFO' | 'WARN' | 'CRITICAL';
  entityKind?: string | undefined;
  entityId?: string | undefined;
  linkPath?: string | undefined;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly outbound: OutboundChannel = createOutboundChannel(process.env);

  constructor(private readonly prisma: PrismaService) {}

  /** Create an in-app notification and fan out to external channels (best-effort). */
  async notify(input: NotifyInput): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: input.userId, active: true, deletedAt: null },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) return;

    const severity = input.severity ?? 'INFO';
    const created = await this.prisma.notification.create({
      data: {
        userId: user.id,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        severity,
        entityKind: input.entityKind ?? null,
        entityId: input.entityId ?? null,
        linkPath: input.linkPath ?? null,
        channels: 'IN_APP',
      },
    });

    const extra = await this.outbound
      .deliver(
        { email: user.email, displayName: user.displayName },
        { title: input.title, body: input.body, severity, linkPath: input.linkPath },
      )
      .catch(() => [] as string[]);
    if (extra.length > 0) {
      await this.prisma.notification.update({
        where: { id: created.id },
        data: { channels: ['IN_APP', ...extra].join(',') },
      });
    }
  }

  /** Fan out the same notification to many recipients (deduped). */
  async notifyMany(userIds: string[], input: Omit<NotifyInput, 'userId'>): Promise<void> {
    const unique = [...new Set(userIds.filter(Boolean))];
    await Promise.all(unique.map((userId) => this.notify({ ...input, userId })));
  }

  listMine(userId: string, opts: { unreadOnly?: boolean; take?: number } = {}) {
    return this.prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.take ?? 30, 100),
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(id: string, userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<number> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return res.count;
  }
}
