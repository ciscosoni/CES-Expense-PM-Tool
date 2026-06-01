import { Body, Controller, Get, Injectable, Module, Post, Query, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Vendor } from '@prisma/client';
import { PrismaService } from '../prisma.service.js';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { AuditService } from '../audit/audit.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { createZodDto } from '../common/zod-dto.js';

/** P9-F — vendor master (expense `purchase_from`). */
@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(search?: string): Promise<Vendor[]> {
    return this.prisma.vendor.findMany({
      where: { active: true, ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async create(input: { name: string; gstNumber?: string | undefined }, actor: AuthedUser): Promise<Vendor> {
    const v = await this.prisma.vendor.upsert({
      where: { name: input.name },
      update: {},
      create: { name: input.name, gstNumber: input.gstNumber ?? null },
    });
    await this.audit.log({ entity: 'Vendor', entityId: v.id, action: 'CREATE', actorId: actor.id, after: v });
    return v;
  }
}

const CreateVendorSchema = z.object({ name: z.string().min(1).max(160), gstNumber: z.string().max(40).optional() });
class CreateVendorDto extends createZodDto(CreateVendorSchema) {}
interface CreateVendorDto extends z.infer<typeof CreateVendorSchema> {}

@ApiTags('Vendors')
@ApiBearerAuth()
@Controller('vendors')
@UsePipes(ZodValidationPipe)
class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @ApiOperation({ summary: 'List vendors (optional ?search).' })
  list(@Query('search') search?: string) {
    return this.vendors.list(search);
  }

  @Post()
  @Roles('ADMIN', 'FINANCE')
  create(@Body() body: CreateVendorDto, @CurrentUser() user: AuthedUser) {
    return this.vendors.create(body, user);
  }
}

@Module({
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
