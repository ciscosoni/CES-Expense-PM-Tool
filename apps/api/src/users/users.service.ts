import { Injectable, NotFoundException } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  jobTitle: true,
  department: true,
  managerId: true,
  gradeId: true,
  roles: true,
  active: true,
  // ---- P9-E: HR lifecycle ----
  employmentType: true,
  joiningDate: true,
  probationEndDate: true,
  noticePeriodEndDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(opts: { role?: UserRole | undefined; includeInactive?: boolean | undefined } = {}) {
    return this.prisma.user.findMany({
      where: {
        ...(opts.role ? { roles: { has: opts.role } } : {}),
        ...(opts.includeInactive ? {} : { active: true }),
        deletedAt: null,
      },
      orderBy: { displayName: 'asc' },
      select: PUBLIC_USER_SELECT,
    });
  }

  async get(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async getByEmail(email: string) {
    const user = await this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
      select: PUBLIC_USER_SELECT,
    });
    if (!user) throw new NotFoundException(`User with email ${email} not found`);
    return user;
  }

  /**
   * Rich employee profile: identity + resolved manager/grade + HR rollups
   * (current allocations, leave taken/pending this year, hours last 30 days).
   * All derived from existing records — nothing entered twice.
   */
  async profile(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...PUBLIC_USER_SELECT,
        manager: { select: { id: true, displayName: true } },
        grade: { select: { id: true, code: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const since30 = new Date(now.getTime() - 30 * 86_400_000);

    const [allocations, leaves, logs, reportsCount] = await Promise.all([
      this.prisma.allocation.findMany({
        where: { userId: id, periodStart: { lte: now }, periodEnd: { gte: now } },
        include: { project: { select: { id: true, code: true, name: true } } },
        orderBy: { percentAllocation: 'desc' },
      }),
      this.prisma.leave.findMany({
        where: { userId: id, date: { gte: yearStart } },
        select: { durationDays: true, status: true },
      }),
      this.prisma.timeLog.findMany({
        where: { userId: id, date: { gte: since30 } },
        select: { hours: true, billable: true },
      }),
      this.prisma.user.count({ where: { managerId: id, deletedAt: null, active: true } }),
    ]);

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const leaveApproved = leaves
      .filter((l) => l.status === 'APPROVED')
      .reduce((s, l) => s + Number(l.durationDays), 0);
    const leavePending = leaves
      .filter((l) => l.status === 'PENDING')
      .reduce((s, l) => s + Number(l.durationDays), 0);
    const hours30 = logs.reduce((s, l) => s + Number(l.hours), 0);
    const billable30 = logs
      .filter((l) => l.billable)
      .reduce((s, l) => s + Number(l.hours), 0);

    return {
      ...user,
      reportsCount,
      allocations: allocations.map((a) => ({
        project: a.project,
        percent: a.percentAllocation,
        periodStart: a.periodStart,
        periodEnd: a.periodEnd,
      })),
      rollups: {
        currentAllocationPercent: allocations.reduce((s, a) => s + a.percentAllocation, 0),
        leaveApprovedThisYear: round1(leaveApproved),
        leavePending: round1(leavePending),
        hoursLast30: round1(hours30),
        billableLast30: round1(billable30),
      },
    };
  }
}
