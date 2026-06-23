import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { createZodDto } from '../common/zod-dto.js';

/**
 * HR org master data — Departments + Designations. Headcount is derived by
 * matching the (string) User.department / User.jobTitle fields, so existing
 * imported data needs no migration to show counts.
 */
@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async headcounts(field: 'department' | 'jobTitle'): Promise<Map<string, number>> {
    const rows = await this.prisma.user.groupBy({
      by: [field],
      where: { active: true, deletedAt: null, [field]: { not: null } },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r[field];
      if (key) map.set(key, r._count._all);
    }
    return map;
  }

  async listDepartments(includeInactive: boolean) {
    const [rows, counts] = await Promise.all([
      this.prisma.department.findMany({
        where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
        orderBy: { name: 'asc' },
      }),
      this.headcounts('department'),
    ]);
    return rows.map((d) => ({ id: d.id, name: d.name, active: d.active, employeeCount: counts.get(d.name) ?? 0 }));
  }

  async listDesignations(includeInactive: boolean) {
    const [rows, counts] = await Promise.all([
      this.prisma.designation.findMany({
        where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
        orderBy: { name: 'asc' },
      }),
      this.headcounts('jobTitle'),
    ]);
    return rows.map((d) => ({ id: d.id, name: d.name, active: d.active, employeeCount: counts.get(d.name) ?? 0 }));
  }

  async createDepartment(input: OrgItemInput, actor: AuthedUser) {
    try {
      const created = await this.prisma.department.create({
        data: { name: input.name, active: input.active ?? true },
      });
      await this.audit.log({ entity: 'Department', entityId: created.id, action: 'CREATE', actorId: actor.id, after: created });
      return created;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`A department named "${input.name}" already exists.`);
      }
      throw e;
    }
  }

  async createDesignation(input: OrgItemInput, actor: AuthedUser) {
    try {
      const created = await this.prisma.designation.create({
        data: { name: input.name, active: input.active ?? true },
      });
      await this.audit.log({ entity: 'Designation', entityId: created.id, action: 'CREATE', actorId: actor.id, after: created });
      return created;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`A designation named "${input.name}" already exists.`);
      }
      throw e;
    }
  }

  async updateDepartment(id: string, input: UpdateOrgItemInput, actor: AuthedUser) {
    const before = await this.prisma.department.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Department not found');
    const after = await this.prisma.department.update({
      where: { id },
      data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.active !== undefined ? { active: input.active } : {}) },
    });
    await this.audit.log({ entity: 'Department', entityId: id, action: 'UPDATE', actorId: actor.id, before, after });
    return after;
  }

  async updateDesignation(id: string, input: UpdateOrgItemInput, actor: AuthedUser) {
    const before = await this.prisma.designation.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Designation not found');
    const after = await this.prisma.designation.update({
      where: { id },
      data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.active !== undefined ? { active: input.active } : {}) },
    });
    await this.audit.log({ entity: 'Designation', entityId: id, action: 'UPDATE', actorId: actor.id, before, after });
    return after;
  }

  async deactivateDepartment(id: string, actor: AuthedUser) {
    const before = await this.prisma.department.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Department not found');
    const after = await this.prisma.department.update({ where: { id }, data: { active: false } });
    await this.audit.log({ entity: 'Department', entityId: id, action: 'DEACTIVATE', actorId: actor.id, before, after });
    return after;
  }

  async deactivateDesignation(id: string, actor: AuthedUser) {
    const before = await this.prisma.designation.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Designation not found');
    const after = await this.prisma.designation.update({ where: { id }, data: { active: false } });
    await this.audit.log({ entity: 'Designation', entityId: id, action: 'DEACTIVATE', actorId: actor.id, before, after });
    return after;
  }
}

const OrgItemSchema = z.object({ name: z.string().min(1).max(120), active: z.boolean().optional() });
type OrgItemInput = z.infer<typeof OrgItemSchema>;
class CreateOrgItemDto extends createZodDto(OrgItemSchema) {}
interface CreateOrgItemDto extends OrgItemInput {}

const UpdateOrgItemSchema = OrgItemSchema.partial();
type UpdateOrgItemInput = z.infer<typeof UpdateOrgItemSchema>;
class UpdateOrgItemDto extends createZodDto(UpdateOrgItemSchema) {}
interface UpdateOrgItemDto extends UpdateOrgItemInput {}

@ApiTags('Master data — Departments')
@ApiBearerAuth()
@Controller('master-data/departments')
@UsePipes(ZodValidationPipe)
class DepartmentsController {
  constructor(private readonly org: OrgService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.org.listDepartments(includeInactive === 'true');
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: CreateOrgItemDto, @CurrentUser() user: AuthedUser) {
    return this.org.createDepartment(body, user);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateOrgItemDto, @CurrentUser() user: AuthedUser) {
    return this.org.updateDepartment(id, body, user);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Deactivate a department' })
  deactivate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.org.deactivateDepartment(id, user);
  }
}

@ApiTags('Master data — Designations')
@ApiBearerAuth()
@Controller('master-data/designations')
@UsePipes(ZodValidationPipe)
class DesignationsController {
  constructor(private readonly org: OrgService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.org.listDesignations(includeInactive === 'true');
  }

  @Post()
  @Roles('ADMIN')
  create(@Body() body: CreateOrgItemDto, @CurrentUser() user: AuthedUser) {
    return this.org.createDesignation(body, user);
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateOrgItemDto, @CurrentUser() user: AuthedUser) {
    return this.org.updateDesignation(id, body, user);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Deactivate a designation' })
  deactivate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.org.deactivateDesignation(id, user);
  }
}

@Module({
  controllers: [DepartmentsController, DesignationsController],
  providers: [OrgService],
  exports: [OrgService],
})
export class OrgModule {}
