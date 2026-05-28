import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Task, type TaskStatus, type TimeLog } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { AuthedUser } from '../auth/index.js';
import type { CreateTaskDto, CreateTimeLogDto, UpdateTaskDto } from './task.dto.js';

const TASK = 'Task';
const TIMELOG = 'TimeLog';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: {
    projectId?: string | undefined;
    assigneeId?: string | undefined;
    status?: TaskStatus | undefined;
  }) {
    return this.prisma.task.findMany({
      where: {
        deletedAt: null,
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
        ...(opts.assigneeId ? { assigneeId: opts.assigneeId } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
      include: {
        assignee: { select: { id: true, displayName: true, email: true } },
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { plannedEnd: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async get(id: string) {
    const t = await this.prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignee: { select: { id: true, displayName: true, email: true } },
        project: { select: { id: true, code: true, name: true } },
        timeLogs: {
          orderBy: { date: 'desc' },
          include: { user: { select: { id: true, displayName: true, email: true } } },
        },
      },
    });
    if (!t) throw new NotFoundException(`Task ${id} not found`);
    return t;
  }

  async create(input: CreateTaskDto, actorId: string): Promise<Task> {
    const created = await this.prisma.task.create({
      data: {
        projectId: input.projectId,
        parentId: input.parentId,
        name: input.name,
        description: input.description ?? null,
        assigneeId: input.assigneeId,
        status: input.status,
        percentComplete: input.percentComplete,
        plannedStart: input.plannedStart ? new Date(input.plannedStart) : null,
        plannedEnd: input.plannedEnd ? new Date(input.plannedEnd) : null,
      },
    });
    await this.audit.log({
      entity: TASK,
      entityId: created.id,
      action: 'CREATE',
      actorId,
      after: created,
    });
    return created;
  }

  async update(id: string, input: UpdateTaskDto, actorId: string): Promise<Task> {
    const before = await this.get(id);
    const data: Prisma.TaskUpdateInput = stripUndefined({
      name: input.name,
      description: input.description,
      assignee:
        input.assigneeId === undefined
          ? undefined
          : input.assigneeId === null
            ? { disconnect: true }
            : { connect: { id: input.assigneeId } },
      status: input.status,
      percentComplete: input.percentComplete,
      plannedStart: parseOptionalDate(input.plannedStart),
      plannedEnd: parseOptionalDate(input.plannedEnd),
      actualStart: parseOptionalDate(input.actualStart),
      actualEnd: parseOptionalDate(input.actualEnd),
    });
    const after = await this.prisma.task.update({ where: { id }, data });
    await this.audit.log({
      entity: TASK,
      entityId: id,
      action: 'UPDATE',
      actorId,
      before,
      after,
    });
    return after;
  }

  async delete(id: string, actorId: string): Promise<void> {
    const before = await this.get(id);
    await this.prisma.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ entity: TASK, entityId: id, action: 'DELETE', actorId, before });
  }

  // ---- TimeLogs ----

  async logTime(input: CreateTimeLogDto, actor: AuthedUser): Promise<TimeLog> {
    const task = await this.prisma.task.findFirst({
      where: { id: input.taskId, deletedAt: null },
      select: { id: true, assigneeId: true },
    });
    if (!task) throw new BadRequestException(`Task ${input.taskId} not found`);

    // Only the assignee, an admin, or the project PM can log time on a task.
    // Engineers can only log on their assigned tasks.
    if (
      !actor.roles.includes('ADMIN') &&
      !actor.roles.includes('PROJECT_MANAGER') &&
      task.assigneeId !== actor.id
    ) {
      throw new ForbiddenException('You can only log time on tasks assigned to you.');
    }

    const created = await this.prisma.timeLog.create({
      data: {
        taskId: input.taskId,
        userId: actor.id,
        date: new Date(input.date),
        hours: input.hours.toFixed(2),
        notes: input.notes ?? null,
      },
    });
    await this.audit.log({
      entity: TIMELOG,
      entityId: created.id,
      action: 'CREATE',
      actorId: actor.id,
      after: created,
    });
    return created;
  }

  async deleteTimeLog(id: string, actor: AuthedUser): Promise<void> {
    const log = await this.prisma.timeLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException(`TimeLog ${id} not found`);
    if (!actor.roles.includes('ADMIN') && log.userId !== actor.id) {
      throw new ForbiddenException('Only the author or an admin can delete a time log.');
    }
    await this.prisma.timeLog.delete({ where: { id } });
    await this.audit.log({
      entity: TIMELOG,
      entityId: id,
      action: 'DELETE',
      actorId: actor.id,
      before: log,
    });
  }

  async listTimeLogsForUser(
    userId: string,
    opts: { dateFrom?: string | undefined; dateTo?: string | undefined },
  ) {
    return this.prisma.timeLog.findMany({
      where: {
        userId,
        ...(opts.dateFrom ? { date: { gte: new Date(opts.dateFrom) } } : {}),
        ...(opts.dateTo ? { date: { lte: new Date(opts.dateTo) } } : {}),
      },
      include: {
        task: { select: { id: true, name: true, projectId: true } },
      },
      orderBy: { date: 'desc' },
    });
  }
}

function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}
