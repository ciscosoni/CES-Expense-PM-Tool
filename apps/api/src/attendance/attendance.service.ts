import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AttendanceDay,
  AttendanceDayStatus,
  AttendanceEvent,
  AttendanceRegularization,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthedUser } from '../auth/index.js';
import type {
  CreateAttendanceEventDto,
  CreateRegularizationDto,
  RejectRegularizationDto,
} from './attendance.dto.js';

const ON_SITE_THRESHOLD_MINUTES = 240; // 4 hours
const PARTIAL_THRESHOLD_MINUTES = 60;

const REG_INCLUDE = {
  user: { select: { id: true, displayName: true, email: true } },
  project: { select: { id: true, code: true, name: true } },
  approver: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.AttendanceRegularizationInclude;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Events ----------

  async ingestEvent(input: CreateAttendanceEventDto, actor: AuthedUser): Promise<AttendanceEvent> {
    const occurredAt = new Date(input.occurredAt);
    const event = await this.prisma.attendanceEvent.create({
      data: {
        userId: actor.id,
        kind: input.kind,
        occurredAt,
        lat: input.lat,
        lng: input.lng,
        accuracyMeters: input.accuracyMeters,
        projectSiteId: input.projectSiteId,
        source: input.source,
      },
    });
    await this.recomputeDay(actor.id, this.dateKey(occurredAt));
    await this.audit.log({
      entity: 'AttendanceEvent',
      entityId: event.id,
      action: 'CREATE',
      actorId: actor.id,
      after: event,
    });
    return event;
  }

  async listDays(opts: { userId: string; from?: string | undefined; to?: string | undefined }) {
    const where: Prisma.AttendanceDayWhereInput = { userId: opts.userId };
    if (opts.from || opts.to) {
      where.date = {};
      if (opts.from) where.date.gte = new Date(opts.from);
      if (opts.to) where.date.lte = new Date(opts.to);
    }
    return this.prisma.attendanceDay.findMany({
      where,
      include: { regularization: { include: REG_INCLUDE } },
      orderBy: { date: 'desc' },
      take: 90,
    });
  }

  async listEventsForDay(userId: string, date: string) {
    const day = new Date(date);
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);
    return this.prisma.attendanceEvent.findMany({
      where: { userId, occurredAt: { gte: day, lt: next } },
      include: { projectSite: { select: { id: true, siteName: true } } },
      orderBy: { occurredAt: 'asc' },
    });
  }

  // ---------- Day derivation ----------

  /**
   * Re-derive a user's AttendanceDay from raw events. Idempotent — call after
   * every event ingest and after regularization decisions. Persisted so that
   * dashboards and calendars don't have to recompute on every read.
   *
   * Derivation rules (intentionally simple for v1, can sharpen later):
   * - `onSiteMinutes`: sum of contiguous GEOFENCE_ENTER → GEOFENCE_EXIT pairs.
   *   If a CHECK_IN has a projectSiteId, we also count from check-in to
   *   either the next geofence_exit or to check-out, whichever first.
   * - `status`:
   *     ABSENT     — no events
   *     PARTIAL    — check-in but no check-out, OR < {@link PARTIAL_THRESHOLD_MINUTES}
   *     REMOTE     — has events but on-site minutes 0
   *     ON_SITE    — onSiteMinutes ≥ {@link ON_SITE_THRESHOLD_MINUTES}
   *   An approved Regularization overrides this to REGULARIZED.
   */
  async recomputeDay(userId: string, dateKey: string): Promise<AttendanceDay> {
    const day = new Date(`${dateKey}T00:00:00.000Z`);
    const next = new Date(day);
    next.setUTCDate(next.getUTCDate() + 1);

    const events = await this.prisma.attendanceEvent.findMany({
      where: { userId, occurredAt: { gte: day, lt: next } },
      orderBy: { occurredAt: 'asc' },
    });

    let onSiteMinutes = 0;
    let geofenceOpen: Date | null = null;
    const siteIds = new Set<string>();
    let firstEventAt: Date | null = null;
    let lastEventAt: Date | null = null;
    let hasCheckIn = false;
    let hasCheckOut = false;

    for (const e of events) {
      firstEventAt ??= e.occurredAt;
      lastEventAt = e.occurredAt;
      if (e.projectSiteId) siteIds.add(e.projectSiteId);
      if (e.kind === 'CHECK_IN') hasCheckIn = true;
      if (e.kind === 'CHECK_OUT') hasCheckOut = true;
      if (e.kind === 'GEOFENCE_ENTER') {
        geofenceOpen = e.occurredAt;
      } else if (e.kind === 'GEOFENCE_EXIT' && geofenceOpen) {
        onSiteMinutes += Math.round((e.occurredAt.getTime() - geofenceOpen.getTime()) / 60000);
        geofenceOpen = null;
      }
    }
    // Unclosed geofence: count up to last event of the day.
    if (geofenceOpen && lastEventAt && lastEventAt.getTime() > geofenceOpen.getTime()) {
      onSiteMinutes += Math.round((lastEventAt.getTime() - geofenceOpen.getTime()) / 60000);
    }

    let status: AttendanceDayStatus = 'ABSENT';
    let derivationNote: string = 'No attendance events for the day.';
    if (events.length > 0) {
      if (onSiteMinutes >= ON_SITE_THRESHOLD_MINUTES) {
        status = 'ON_SITE';
        derivationNote = `ON_SITE: ${this.minutes(onSiteMinutes)} inside ${siteIds.size} project site${siteIds.size === 1 ? '' : 's'}.`;
      } else if (hasCheckIn && !hasCheckOut) {
        status = 'PARTIAL';
        derivationNote = `PARTIAL: check-in at ${firstEventAt?.toISOString()} but no check-out by end of day.`;
      } else if (onSiteMinutes >= PARTIAL_THRESHOLD_MINUTES) {
        status = 'PARTIAL';
        derivationNote = `PARTIAL: only ${this.minutes(onSiteMinutes)} on-site (below ${this.minutes(ON_SITE_THRESHOLD_MINUTES)} threshold).`;
      } else {
        status = 'REMOTE';
        derivationNote =
          siteIds.size > 0
            ? `REMOTE: events recorded but only ${this.minutes(onSiteMinutes)} inside a geofence.`
            : `REMOTE: events recorded but no geofence proximity.`;
      }
    }

    // Carry an existing regularization through.
    const existing = await this.prisma.attendanceDay.findUnique({
      where: { userId_date: { userId, date: day } },
    });
    let effectiveStatus: AttendanceDayStatus = status;
    let regularizationId = existing?.regularizationId ?? null;
    if (regularizationId) {
      const reg = await this.prisma.attendanceRegularization.findUnique({
        where: { id: regularizationId },
      });
      if (reg && reg.status === 'APPROVED' && reg.deletedAt === null) {
        effectiveStatus = 'REGULARIZED';
        derivationNote = `REGULARIZED: ${reg.reason.replace(/_/g, ' ').toLowerCase()} — ${reg.notes}`;
      } else {
        // Stale link (e.g. CR was cancelled) — drop it.
        regularizationId = null;
      }
    }

    return this.prisma.attendanceDay.upsert({
      where: { userId_date: { userId, date: day } },
      create: {
        userId,
        date: day,
        firstEventAt,
        lastEventAt,
        onSiteMinutes,
        projectSiteIds: Array.from(siteIds),
        status: effectiveStatus,
        eventCount: events.length,
        derivationNote,
        regularizationId,
        recomputedAt: new Date(),
      },
      update: {
        firstEventAt,
        lastEventAt,
        onSiteMinutes,
        projectSiteIds: Array.from(siteIds),
        status: effectiveStatus,
        eventCount: events.length,
        derivationNote,
        regularizationId,
        recomputedAt: new Date(),
      },
    });
  }

  // ---------- Regularizations ----------

  async listRegularizations(opts: {
    userId?: string | undefined;
    status?: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | undefined;
  }) {
    return this.prisma.attendanceRegularization.findMany({
      where: {
        deletedAt: null,
        ...(opts.userId ? { userId: opts.userId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: REG_INCLUDE,
      orderBy: [{ status: 'asc' }, { date: 'desc' }],
    });
  }

  async createRegularization(
    input: CreateRegularizationDto,
    actor: AuthedUser,
  ): Promise<AttendanceRegularization> {
    // Prevent duplicates: only one open request per (user, date).
    const existing = await this.prisma.attendanceRegularization.findFirst({
      where: {
        userId: actor.id,
        date: new Date(input.date),
        status: { in: ['SUBMITTED', 'APPROVED'] },
        deletedAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `A ${existing.status.toLowerCase()} regularization already exists for ${input.date}.`,
      );
    }

    const created = await this.prisma.attendanceRegularization.create({
      data: {
        userId: actor.id,
        date: new Date(input.date),
        reason: input.reason,
        notes: input.notes,
        projectId: input.projectId,
        status: 'SUBMITTED',
      },
    });
    await this.audit.log({
      entity: 'AttendanceRegularization',
      entityId: created.id,
      action: 'CREATE',
      actorId: actor.id,
      after: created,
    });
    return created;
  }

  async approve(id: string, actor: AuthedUser): Promise<AttendanceRegularization> {
    const before = await this.getRegularizationOr404(id);
    if (before.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot approve from status ${before.status}`);
    }
    this.assertCanDecide(actor);
    if (before.userId === actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('You cannot approve your own regularization.');
    }
    const after = await this.prisma.attendanceRegularization.update({
      where: { id },
      data: { status: 'APPROVED', approverId: actor.id, decidedAt: new Date() },
    });
    // Link the day → recompute will flip status to REGULARIZED.
    const day = await this.prisma.attendanceDay.upsert({
      where: { userId_date: { userId: before.userId, date: before.date } },
      create: {
        userId: before.userId,
        date: before.date,
        status: 'REGULARIZED',
        regularizationId: id,
        eventCount: 0,
        derivationNote: `REGULARIZED: ${before.reason.replace(/_/g, ' ').toLowerCase()} — ${before.notes}`,
      },
      update: { regularizationId: id },
    });
    await this.recomputeDay(before.userId, this.dateKey(day.date));
    await this.audit.log({
      entity: 'AttendanceRegularization',
      entityId: id,
      action: 'APPROVE',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  async reject(
    id: string,
    input: RejectRegularizationDto,
    actor: AuthedUser,
  ): Promise<AttendanceRegularization> {
    const before = await this.getRegularizationOr404(id);
    if (before.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot reject from status ${before.status}`);
    }
    this.assertCanDecide(actor);
    const after = await this.prisma.attendanceRegularization.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approverId: actor.id,
        decidedAt: new Date(),
        rejectReason: input.reason,
      },
    });
    await this.audit.log({
      entity: 'AttendanceRegularization',
      entityId: id,
      action: 'REJECT',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  async cancel(id: string, actor: AuthedUser): Promise<AttendanceRegularization> {
    const before = await this.getRegularizationOr404(id);
    if (before.userId !== actor.id && !actor.roles.includes('ADMIN')) {
      throw new ForbiddenException('Only the submitter can cancel a regularization.');
    }
    if (before.status !== 'SUBMITTED') {
      throw new BadRequestException(`Cannot cancel from status ${before.status}`);
    }
    const after = await this.prisma.attendanceRegularization.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log({
      entity: 'AttendanceRegularization',
      entityId: id,
      action: 'CANCEL',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  // ---------- Helpers ----------

  private async getRegularizationOr404(id: string) {
    const r = await this.prisma.attendanceRegularization.findFirst({
      where: { id, deletedAt: null },
      include: REG_INCLUDE,
    });
    if (!r) throw new NotFoundException(`Regularization ${id} not found`);
    return r;
  }

  private assertCanDecide(actor: AuthedUser): void {
    if (actor.roles.includes('ADMIN')) return;
    if (actor.roles.includes('PROJECT_MANAGER')) return;
    if (actor.roles.includes('PROJECT_OWNER')) return;
    if (actor.roles.includes('APPROVER')) return;
    throw new ForbiddenException(
      'Only a manager, project owner, or admin can decide regularizations.',
    );
  }

  private dateKey(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private minutes(n: number): string {
    const h = Math.floor(n / 60);
    const m = n % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}
