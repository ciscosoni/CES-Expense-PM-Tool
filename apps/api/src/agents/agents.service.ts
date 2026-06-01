import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AiService } from '../ai/ai.service.js';
import { PnlService } from '../projects/pnl.service.js';

/**
 * P6 — Autonomous Agents (Level 3). Each agent runs on its own schedule (gated
 * by SCHEDULER_DISABLED) and is also runnable on demand via the controller.
 *
 * Agents are notification/content-only by default; nothing here moves money.
 * The auto-approval agent is suggest-only (it flags clean expenses for a human
 * to one-click approve) and lives in {@link evaluateAutoApprovable} elsewhere.
 */
const BRIEF_CRON = process.env.DAILY_BRIEF_CRON ?? '0 8 * * 1-5'; // 08:00, weekdays
/** Margin RAG bands — mirrors the P&L page (red < 15%, amber < 30%). */
const MARGIN_RED = 15;
/** An approval pending longer than this (days) is "aging" and surfaces in briefs. */
const APPROVAL_AGING_DAYS = 2;

interface BriefData {
  redProjects: { code: string; margin: number }[];
  pendingApprovals: { count: number; oldestDays: number };
  openAnomalies: number;
  pendingReimbursements: number;
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly ai: AiService,
    private readonly pnl: PnlService,
  ) {}

  private get enabled(): boolean {
    return process.env.SCHEDULER_DISABLED !== 'true';
  }

  @Cron(BRIEF_CRON, { name: 'daily-brief' })
  async scheduledDailyBrief(): Promise<void> {
    if (this.enabled) await this.runDailyBrief();
  }

  /**
   * AI daily brief: each owner / PM / leader gets a morning summary of what needs
   * their attention — red-margin projects, aging approvals, open anomalies,
   * pending reimbursements. Recipients with nothing notable are skipped.
   */
  async runDailyBrief(): Promise<{ recipients: number; sent: number }> {
    const recipients = await this.prisma.user.findMany({
      where: {
        active: true,
        deletedAt: null,
        roles: { hasSome: ['PROJECT_OWNER', 'PROJECT_MANAGER', 'ADMIN', 'FINANCE'] },
      },
      select: { id: true, displayName: true, roles: true },
    });

    let sent = 0;
    for (const u of recipients) {
      const data = await this.briefFacts(u);
      if (!this.briefHasContent(data)) continue;
      const fallback = this.briefFallback(u.displayName, data);
      const body = await this.ai.narrate({
        system: `You write a concise morning operations brief for a manager at CES Tech (an IT infrastructure SI). 3–5 short bullet lines max. Lead with what needs action today. Plain and specific — name the project codes and counts. Use ₹ for INR. No greetings, no fluff.`,
        facts: `Manager: ${u.displayName}\nData:\n${JSON.stringify(data, null, 2)}`,
        fallback,
        maxTokens: 500,
      });
      const severity = data.redProjects.length > 0 || data.pendingApprovals.oldestDays >= 5 ? 'WARN' : 'INFO';
      await this.notifications.notify({
        userId: u.id,
        kind: 'AI_DAILY_BRIEF',
        title: 'Your morning brief',
        body,
        severity,
        entityKind: 'BRIEF',
        linkPath: '/dashboard',
      });
      sent++;
    }
    this.logger.log(`Daily brief: ${sent}/${recipients.length} recipients notified`);
    return { recipients: recipients.length, sent };
  }

  private async briefFacts(u: { id: string; roles: string[] }): Promise<BriefData> {
    const seesAll = u.roles.includes('ADMIN') || u.roles.includes('FINANCE');

    // Red-margin projects the user owns/manages (or all, for admin/finance).
    const projects = await this.prisma.project.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        ...(seesAll ? {} : { OR: [{ ownerId: u.id }, { pmId: u.id }] }),
      },
      select: { id: true, code: true },
      take: 40,
    });
    const redProjects: { code: string; margin: number }[] = [];
    for (const p of projects) {
      const pnl = await this.pnl.forProject(p.id);
      if (pnl.marginPercent !== null && pnl.marginPercent < MARGIN_RED) {
        redProjects.push({ code: p.code, margin: Math.round(pnl.marginPercent * 10) / 10 });
      }
    }

    // Expenses awaiting this person's approval: owners → SUBMITTED on owned
    // projects; finance/admin → OWNER_APPROVED awaiting finance.
    const pendingWhere = seesAll
      ? { status: 'OWNER_APPROVED' as const }
      : { status: 'SUBMITTED' as const, project: { ownerId: u.id } };
    const pending = u.roles.includes('PROJECT_OWNER') || seesAll
      ? await this.prisma.expense.findMany({
          where: { deletedAt: null, ...pendingWhere },
          select: { updatedAt: true },
        })
      : [];
    const now = Date.now();
    const oldestDays = pending.length
      ? Math.max(...pending.map((e) => Math.floor((now - e.updatedAt.getTime()) / 86_400_000)))
      : 0;

    const [openAnomalies, pendingReimbursements] = await Promise.all([
      seesAll ? this.prisma.anomaly.count({ where: { resolvedAt: null } }) : Promise.resolve(0),
      seesAll
        ? this.prisma.reimbursement.count({ where: { status: 'PENDING' } })
        : Promise.resolve(0),
    ]);

    return {
      redProjects,
      pendingApprovals: { count: pending.length, oldestDays },
      openAnomalies,
      pendingReimbursements,
    };
  }

  private briefHasContent(d: BriefData): boolean {
    return (
      d.redProjects.length > 0 ||
      d.pendingApprovals.count > 0 ||
      d.openAnomalies > 0 ||
      d.pendingReimbursements > 0
    );
  }

  private briefFallback(name: string, d: BriefData): string {
    const lines: string[] = [];
    if (d.redProjects.length) {
      lines.push(
        `• ${d.redProjects.length} project(s) below ${MARGIN_RED}% margin: ${d.redProjects
          .map((p) => `${p.code} (${p.margin}%)`)
          .join(', ')}`,
      );
    }
    if (d.pendingApprovals.count) {
      lines.push(
        `• ${d.pendingApprovals.count} expense(s) awaiting your approval${
          d.pendingApprovals.oldestDays >= APPROVAL_AGING_DAYS
            ? ` — oldest ${d.pendingApprovals.oldestDays}d`
            : ''
        }`,
      );
    }
    if (d.pendingReimbursements) lines.push(`• ${d.pendingReimbursements} reimbursement(s) pending payout`);
    if (d.openAnomalies) lines.push(`• ${d.openAnomalies} open anomal${d.openAnomalies === 1 ? 'y' : 'ies'} to review`);
    return lines.join('\n') || 'Nothing needs your attention today.';
  }
}
