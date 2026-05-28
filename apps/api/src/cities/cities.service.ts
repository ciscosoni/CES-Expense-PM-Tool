import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type City, type CityTier } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateCityDto, UpdateCityDto } from './city.dto.js';

const ENTITY = 'City';

@Injectable()
export class CitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    opts: {
      tier?: CityTier | undefined;
      country?: string | undefined;
      includeInactive?: boolean | undefined;
    } = {},
  ): Promise<City[]> {
    return this.prisma.city.findMany({
      where: {
        ...(opts.tier ? { tier: opts.tier } : {}),
        ...(opts.country ? { country: opts.country } : {}),
        ...(opts.includeInactive ? {} : { active: true }),
      },
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
    });
  }

  async get(id: string): Promise<City> {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException(`City ${id} not found`);
    return city;
  }

  async create(input: CreateCityDto, actorId: string): Promise<City> {
    try {
      const data = stripUndefined(input) as Prisma.CityCreateInput;
      const created = await this.prisma.city.create({ data });
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
        throw new ConflictException(
          `City "${input.name}" already exists for country "${input.country}"`,
        );
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateCityDto, actorId: string): Promise<City> {
    const before = await this.get(id);
    const data = stripUndefined(input) as Prisma.CityUpdateInput;
    const after = await this.prisma.city.update({ where: { id }, data });
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

  async deactivate(id: string, actorId: string): Promise<City> {
    const before = await this.get(id);
    const after = await this.prisma.city.update({ where: { id }, data: { active: false } });
    await this.audit.log({
      entity: ENTITY,
      entityId: id,
      action: 'DEACTIVATE',
      actorId,
      before,
      after,
    });
    return after;
  }
}
