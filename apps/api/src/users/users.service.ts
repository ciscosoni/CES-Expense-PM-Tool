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
}
