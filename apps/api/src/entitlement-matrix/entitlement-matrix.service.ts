import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type CityTier, type EntitlementMatrixRow } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateEntitlementDto, UpdateEntitlementDto } from './entitlement-matrix.dto.js';

const ENTITY = 'EntitlementMatrixRow';

@Injectable()
export class EntitlementMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    opts: { gradeId?: string | undefined; cityTier?: CityTier | undefined } = {},
  ): Promise<EntitlementMatrixRow[]> {
    return this.prisma.entitlementMatrixRow.findMany({
      where: {
        ...(opts.gradeId ? { gradeId: opts.gradeId } : {}),
        ...(opts.cityTier ? { cityTier: opts.cityTier } : {}),
      },
      orderBy: [{ gradeId: 'asc' }, { cityTier: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async get(id: string): Promise<EntitlementMatrixRow> {
    const r = await this.prisma.entitlementMatrixRow.findUnique({ where: { id } });
    if (!r) throw new NotFoundException(`EntitlementMatrixRow ${id} not found`);
    return r;
  }

  async create(input: CreateEntitlementDto, actorId: string): Promise<EntitlementMatrixRow> {
    await this.assertGradeExists(input.gradeId);
    const created = await this.prisma.entitlementMatrixRow.create({
      data: {
        gradeId: input.gradeId,
        cityTier: input.cityTier,
        perDiemAmount: input.perDiemAmount,
        perDiemCurrency: input.perDiemCurrency,
        lodgingCapPerNight: input.lodgingCapPerNight,
        lodgingCurrency: input.lodgingCurrency,
        travelClass: input.travelClass,
        localConveyanceCapPerDay: input.localConveyanceCapPerDay,
        localConveyanceCurrency: input.localConveyanceCurrency,
        effectiveFrom: new Date(input.effectiveFrom),
      },
    });
    await this.audit.log({
      entity: ENTITY,
      entityId: created.id,
      action: 'CREATE',
      actorId,
      after: created,
    });
    return created;
  }

  async update(
    id: string,
    input: UpdateEntitlementDto,
    actorId: string,
  ): Promise<EntitlementMatrixRow> {
    const before = await this.get(id);
    if (input.gradeId) await this.assertGradeExists(input.gradeId);
    const data: Prisma.EntitlementMatrixRowUpdateInput = stripUndefined({
      grade: input.gradeId ? { connect: { id: input.gradeId } } : undefined,
      cityTier: input.cityTier,
      perDiemAmount: input.perDiemAmount,
      perDiemCurrency: input.perDiemCurrency,
      lodgingCapPerNight: input.lodgingCapPerNight,
      lodgingCurrency: input.lodgingCurrency,
      travelClass: input.travelClass,
      localConveyanceCapPerDay: input.localConveyanceCapPerDay,
      localConveyanceCurrency: input.localConveyanceCurrency,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
    });
    const after = await this.prisma.entitlementMatrixRow.update({ where: { id }, data });
    await this.audit.log({
      entity: ENTITY,
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
    await this.prisma.entitlementMatrixRow.delete({ where: { id } });
    await this.audit.log({ entity: ENTITY, entityId: id, action: 'DELETE', actorId, before });
  }

  private async assertGradeExists(gradeId: string): Promise<void> {
    const exists = await this.prisma.grade.findFirst({
      where: { id: gradeId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException(`Grade ${gradeId} not found or deleted`);
  }
}
