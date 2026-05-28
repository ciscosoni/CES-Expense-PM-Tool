import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Client, type ClientKind } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateClientDto, UpdateClientDto } from './client.dto.js';

const ENTITY = 'Client';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    opts: { kind?: ClientKind | undefined; includeInactive?: boolean | undefined } = {},
  ): Promise<Client[]> {
    return this.prisma.client.findMany({
      where: {
        ...(opts.kind ? { kind: opts.kind } : {}),
        ...(opts.includeInactive ? {} : { active: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string): Promise<Client> {
    const c = await this.prisma.client.findUnique({ where: { id } });
    if (!c) throw new NotFoundException(`Client ${id} not found`);
    return c;
  }

  async create(input: CreateClientDto, actorId: string): Promise<Client> {
    try {
      const created = await this.prisma.client.create({ data: input });
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
        throw new ConflictException(`Client "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateClientDto, actorId: string): Promise<Client> {
    const before = await this.get(id);
    const data = stripUndefined(input) as Prisma.ClientUpdateInput;
    const after = await this.prisma.client.update({ where: { id }, data });
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

  async deactivate(id: string, actorId: string): Promise<Client> {
    const before = await this.get(id);
    const after = await this.prisma.client.update({ where: { id }, data: { active: false } });
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
