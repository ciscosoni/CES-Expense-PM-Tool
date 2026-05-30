import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service.js';
import { createGraphProvider } from './graph.provider.js';
import type { GraphDirectoryProvider, GraphSyncResult } from './graph.types.js';

/**
 * Syncs the people directory into the User table: upserts users, fills
 * jobTitle/department, and resolves the manager chain (User.managerId) — the
 * data that lets approvals route to a person's real reporting manager.
 *
 * Idempotent: safe to run on a cron or on demand. Uses the real Graph provider
 * in Azure and a local mock (CES org chart) otherwise.
 */
@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);
  private readonly provider: GraphDirectoryProvider = createGraphProvider(process.env);

  constructor(private readonly prisma: PrismaService) {}

  get providerKind(): 'graph' | 'mock' {
    return this.provider.kind;
  }

  async sync(): Promise<GraphSyncResult> {
    const directory = await this.provider.listUsers();
    const idByEmail = new Map<string, string>();
    const idByOid = new Map<string, string>();

    // Pass 1 — upsert users.
    let synced = 0;
    for (const gu of directory) {
      const email = gu.email.toLowerCase();
      const existing = await this.prisma.user.findFirst({
        where: {
          OR: [...(gu.oid ? [{ azureOid: gu.oid }] : []), { email }],
        },
        select: { id: true, azureOid: true },
      });

      let id: string;
      if (existing) {
        const linkOid =
          gu.oid && (!existing.azureOid || existing.azureOid.startsWith('pending:'))
            ? { azureOid: gu.oid }
            : {};
        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            displayName: gu.displayName,
            jobTitle: gu.jobTitle ?? null,
            department: gu.department ?? null,
            ...linkOid,
          },
        });
        id = existing.id;
      } else {
        const created = await this.prisma.user.create({
          data: {
            azureOid: gu.oid ?? `pending:${email}`,
            email,
            displayName: gu.displayName,
            jobTitle: gu.jobTitle ?? null,
            department: gu.department ?? null,
            roles: ['ENGINEER'],
            active: true,
          },
          select: { id: true },
        });
        id = created.id;
      }
      synced++;
      idByEmail.set(email, id);
      if (gu.oid) idByOid.set(gu.oid, id);
    }

    // Pass 2 — resolve the manager chain.
    let managersLinked = 0;
    for (const gu of directory) {
      const selfId = idByEmail.get(gu.email.toLowerCase());
      if (!selfId) continue;
      const managerId =
        (gu.managerOid && idByOid.get(gu.managerOid)) ||
        (gu.managerEmail && idByEmail.get(gu.managerEmail.toLowerCase())) ||
        null;
      if (managerId && managerId !== selfId) {
        await this.prisma.user.update({ where: { id: selfId }, data: { managerId } });
        managersLinked++;
      }
    }

    const result: GraphSyncResult = { source: this.provider.kind, synced, managersLinked };
    this.logger.log(
      `Graph sync (${result.source}): ${result.synced} users, ${result.managersLinked} manager links`,
    );
    return result;
  }
}
