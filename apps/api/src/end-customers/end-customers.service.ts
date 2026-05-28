import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type EndCustomer } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { stripUndefined } from '../common/strip-undefined.js';
import type { CreateEndCustomerDto, UpdateEndCustomerDto } from './end-customer.dto.js';

const ENTITY = 'EndCustomer';

@Injectable()
export class EndCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { includeInactive?: boolean | undefined } = {}): Promise<EndCustomer[]> {
    return this.prisma.endCustomer.findMany({
      where: { ...(opts.includeInactive ? {} : { active: true }) },
      orderBy: { name: 'asc' },
    });
  }

  async get(id: string): Promise<EndCustomer> {
    const ec = await this.prisma.endCustomer.findUnique({ where: { id } });
    if (!ec) throw new NotFoundException(`EndCustomer ${id} not found`);
    return ec;
  }

  async create(input: CreateEndCustomerDto, actorId: string): Promise<EndCustomer> {
    try {
      const data = stripUndefined(input) as Prisma.EndCustomerCreateInput;
      const created = await this.prisma.endCustomer.create({ data });
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
        throw new ConflictException(`EndCustomer "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateEndCustomerDto, actorId: string): Promise<EndCustomer> {
    const before = await this.get(id);
    const data = stripUndefined(input) as Prisma.EndCustomerUpdateInput;
    const after = await this.prisma.endCustomer.update({ where: { id }, data });
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

  async deactivate(id: string, actorId: string): Promise<EndCustomer> {
    const before = await this.get(id);
    const after = await this.prisma.endCustomer.update({ where: { id }, data: { active: false } });
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
