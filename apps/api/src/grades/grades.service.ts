import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Grade } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateGradeDto, UpdateGradeDto } from './grade.dto.js';

const ENTITY = 'Grade';

@Injectable()
export class GradesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { includeInactive?: boolean; includeDeleted?: boolean } = {}): Promise<Grade[]> {
    return this.prisma.grade.findMany({
      where: {
        ...(opts.includeInactive ? {} : { active: true }),
        ...(opts.includeDeleted ? {} : { deletedAt: null }),
      },
      orderBy: { seniorityOrder: 'asc' },
    });
  }

  async get(id: string): Promise<Grade> {
    const grade = await this.prisma.grade.findFirst({ where: { id, deletedAt: null } });
    if (!grade) throw new NotFoundException(`Grade ${id} not found`);
    return grade;
  }

  async create(input: CreateGradeDto, actorId: string): Promise<Grade> {
    try {
      const created = await this.prisma.grade.create({
        data: { code: input.code, name: input.name, seniorityOrder: input.seniorityOrder },
      });
      await this.audit.log({
        entity: ENTITY,
        entityId: created.id,
        action: 'CREATE',
        actorId,
        after: created,
      });
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Grade code "${input.code}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateGradeDto, actorId: string): Promise<Grade> {
    const before = await this.get(id);
    try {
      const data = stripUndefined(input) as Prisma.GradeUpdateInput;
      const after = await this.prisma.grade.update({ where: { id }, data });
      await this.audit.log({
        entity: ENTITY,
        entityId: id,
        action: 'UPDATE',
        actorId,
        before,
        after,
      });
      return after;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Grade code "${input.code}" already exists`);
      }
      throw err;
    }
  }

  /**
   * Soft-delete per CLAUDE.md §10 #5 — financial-relevant entities never hard-delete.
   * Restored via `restore()`.
   */
  async softDelete(id: string, actorId: string): Promise<Grade> {
    const before = await this.get(id);
    const after = await this.prisma.grade.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'DELETE',
      actorId,
      before,
      after,
    });
    return after;
  }

  async restore(id: string, actorId: string): Promise<Grade> {
    const before = await this.prisma.grade.findUnique({ where: { id } });
    if (!before) throw new NotFoundException(`Grade ${id} not found`);
    const after = await this.prisma.grade.update({
      where: { id },
      data: { deletedAt: null, active: true },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'RESTORE',
      actorId,
      before,
      after,
    });
    return after;
  }
}
