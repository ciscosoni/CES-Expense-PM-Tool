import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service.js';
import { AnomaliesService } from '../anomalies/anomalies.service.js';
import { GraphService } from '../graph/graph.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const ANOMALY_CRON = process.env.ANOMALY_SWEEP_CRON ?? '0 2 * * *'; // 02:00 daily
const GRAPH_CRON = process.env.GRAPH_SYNC_CRON ?? '0 */6 * * *'; // every 6 hours

/**
 * The automation heartbeat. Runs the anomaly detector and the Graph directory
 * sync on a schedule (no human "click Detect"), and notifies leadership when new
 * anomalies surface. Cron is disabled with SCHEDULER_DISABLED=true; jobs are also
 * runnable on demand via POST /scheduler/run for verification.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anomalies: AnomaliesService,
    private readonly graph: GraphService,
    private readonly notifications: NotificationsService,
  ) {}

  private get enabled(): boolean {
    return process.env.SCHEDULER_DISABLED !== 'true';
  }

  @Cron(ANOMALY_CRON, { name: 'anomaly-sweep' })
  async scheduledAnomalySweep(): Promise<void> {
    if (!this.enabled) return;
    await this.runAnomalySweep();
  }

  @Cron(GRAPH_CRON, { name: 'graph-sync' })
  async scheduledGraphSync(): Promise<void> {
    if (!this.enabled) return;
    await this.runGraphSync();
  }

  /** Run the anomaly detector; notify ADMINs when new anomalies are found. */
  async runAnomalySweep(): Promise<{ inserted: number; total: number }> {
    const result = await this.anomalies.runDetector();
    this.logger.log(`Anomaly sweep: +${result.inserted} new, ${result.total} open`);
    if (result.inserted > 0) {
      const admins = await this.prisma.user.findMany({
        where: { active: true, deletedAt: null, roles: { has: 'ADMIN' } },
        select: { id: true },
      });
      await this.notifications.notifyMany(
        admins.map((a) => a.id),
        {
          kind: 'ANOMALY_DETECTED',
          title: `${result.inserted} new anomal${result.inserted === 1 ? 'y' : 'ies'} detected`,
          body: `${result.total} open anomalies need review.`,
          severity: result.inserted >= 5 ? 'CRITICAL' : 'WARN',
          entityKind: 'ANOMALY',
          linkPath: '/dashboard',
        },
      );
    }
    return result;
  }

  async runGraphSync() {
    const result = await this.graph.sync();
    this.logger.log(`Graph sync: ${result.synced} users, ${result.managersLinked} links`);
    return result;
  }

  /** Manual trigger (admin) — runs both jobs now and returns their results. */
  async runAll() {
    const [anomaly, graph] = await Promise.all([this.runAnomalySweep(), this.runGraphSync()]);
    return { anomaly, graph };
  }
}
