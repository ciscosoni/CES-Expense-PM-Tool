import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Holiday, Leave, LeaveStatus, LeaveType } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthedUser } from '../auth/index.js';
import type { CreateLeaveDto, DecideLeaveDto } from './leave.dto.js';

/**
 * P9-C — Leave management + holiday calendar. Leave integrates with attendance
 * (an approved leave day is not "absent"), DA (no per-diem on leave) and payslip
 * (paid vs unpaid) — those consumers read APPROVED leaves by date.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ----- leave types -----
  listTypes(): Promise<LeaveType[]> {
    return this.prisma.leaveType.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  }

  // ----- leaves -----
  list(opts: { userId?: string | undefined; status?: LeaveStatus | undefined }): Promise<Leave[]> {
    return this.prisma.leave.findMany({
      where: { ...(opts.userId ? { userId: opts.userId } : {}), ...(opts.status ? { status: opts.status } : {}) },
      include: { user: { select: { displayName: true } }, leaveType: { select: { name: true, paid: true } } },
      orderBy: [{ date: 'desc' }],
    });
  }

  /** Pending leaves across the org — for the manager/admin inbox. */
  inbox(): Promise<Leave[]> {
    return this.list({ status: 'PENDING' });
  }

  async request(input: CreateLeaveDto, actor: AuthedUser): Promise<Leave> {
    const created = await this.prisma.leave.create({
      data: {
        userId: actor.id,
        leaveTypeId: input.leaveTypeId ?? null,
        date: new Date(input.date),
        durationDays: input.halfDay ? '0.5' : '1',
        reason: input.reason ?? null,
        status: 'PENDING',
      },
    });
    await this.audit.log({ entity: 'Leave', entityId: created.id, action: 'REQUEST', actorId: actor.id, after: created });
    return created;
  }

  async decide(id: string, approve: boolean, input: DecideLeaveDto, actor: AuthedUser): Promise<Leave> {
    const before = await this.prisma.leave.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Leave ${id} not found`);
    if (before.status !== 'PENDING') throw new BadRequestException(`Leave already ${before.status}`);
    if (!approve && !input.reason) throw new BadRequestException('Rejection requires a reason');
    const after = await this.prisma.leave.update({
      where: { id },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        approvedById: actor.id,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
    await this.audit.log({
      entity: 'Leave',
      entityId: id,
      action: approve ? 'APPROVE' : 'REJECT',
      actorId: actor.id,
      before,
      after,
    });
    return after;
  }

  // ----- holidays -----
  listHolidays(): Promise<Holiday[]> {
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  async createHoliday(name: string, date: string, actor: AuthedUser): Promise<Holiday> {
    const created = await this.prisma.holiday.create({ data: { name, date: new Date(date) } });
    await this.audit.log({ entity: 'Holiday', entityId: created.id, action: 'CREATE', actorId: actor.id, after: created });
    return created;
  }

  async deleteHoliday(id: string, actor: AuthedUser): Promise<void> {
    await this.prisma.holiday.delete({ where: { id } });
    await this.audit.log({ entity: 'Holiday', entityId: id, action: 'DELETE', actorId: actor.id });
  }
}
