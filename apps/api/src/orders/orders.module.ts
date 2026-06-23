import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { type Order, type OrderKind, type OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { createZodDto } from '../common/zod-dto.js';

interface OrderItem {
  description: string;
  qty: number;
  unitPrice: number;
}

function parseItems(json: unknown): OrderItem[] {
  if (!Array.isArray(json)) return [];
  const out: OrderItem[] = [];
  for (const x of json) {
    const r = x as Record<string, unknown>;
    if (r && typeof r.description === 'string' && typeof r.qty === 'number' && typeof r.unitPrice === 'number') {
      out.push({ description: r.description, qty: r.qty, unitPrice: r.unitPrice });
    }
  }
  return out;
}

/** Totals are computed from line items + tax — never stored. */
export function computeOrderTotal(items: OrderItem[], taxPercent: number): {
  subtotal: number;
  tax: number;
  total: number;
} {
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const tax = Math.round((subtotal * taxPercent) / 100);
  return { subtotal: Math.round(subtotal), tax, total: Math.round(subtotal) + tax };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async enrich(orders: Order[]) {
    const clientIds = orders.filter((o) => o.kind === 'SALE' && o.partyId).map((o) => o.partyId!);
    const vendorIds = orders.filter((o) => o.kind === 'PURCHASE' && o.partyId).map((o) => o.partyId!);
    const projectIds = orders.filter((o) => o.projectId).map((o) => o.projectId!);
    const [clients, vendors, projects] = await Promise.all([
      clientIds.length ? this.prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [],
      vendorIds.length ? this.prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { id: true, name: true } }) : [],
      projectIds.length ? this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true } }) : [],
    ]);
    const nameOf = new Map<string, string>([...clients, ...vendors].map((x) => [x.id, x.name]));
    const codeOf = new Map(projects.map((p) => [p.id, p.code]));
    return orders.map((o) => {
      const items = parseItems(o.items);
      const totals = computeOrderTotal(items, Number(o.taxPercent));
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        kind: o.kind,
        status: o.status,
        partyId: o.partyId,
        partyName: o.partyId ? nameOf.get(o.partyId) ?? null : null,
        projectId: o.projectId,
        projectCode: o.projectId ? codeOf.get(o.projectId) ?? null : null,
        orderDate: o.orderDate,
        currency: o.currency,
        items,
        taxPercent: Number(o.taxPercent),
        notes: o.notes,
        ...totals,
      };
    });
  }

  async list(kind?: OrderKind, status?: OrderStatus) {
    const orders = await this.prisma.order.findMany({
      where: { deletedAt: null, ...(kind ? { kind } : {}), ...(status ? { status } : {}) },
      orderBy: { orderDate: 'desc' },
      take: 500,
    });
    const rows = await this.enrich(orders);
    const open = rows.filter((r) => r.status !== 'COMPLETED' && r.status !== 'CANCELLED');
    return {
      rows,
      summary: {
        total: rows.length,
        open: open.length,
        openValue: open.reduce((s, r) => s + r.total, 0),
        totalValue: rows.filter((r) => r.status !== 'CANCELLED').reduce((s, r) => s + r.total, 0),
      },
    };
  }

  async get(id: string) {
    const order = await this.prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!order) throw new NotFoundException('Order not found');
    return (await this.enrich([order]))[0];
  }

  async create(input: CreateOrderInput, actor: AuthedUser) {
    const prefix = input.kind === 'SALE' ? 'SO' : 'PO';
    const count = await this.prisma.order.count({ where: { kind: input.kind } });
    const orderNumber = `${prefix}-${String(count + 1).padStart(4, '0')}`;
    const created = await this.prisma.order.create({
      data: {
        orderNumber,
        kind: input.kind,
        status: input.status ?? 'DRAFT',
        partyId: input.partyId ?? null,
        projectId: input.projectId ?? null,
        orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
        currency: input.currency ?? 'INR',
        items: (input.items ?? []) as unknown as object,
        taxPercent: new Prisma.Decimal(input.taxPercent ?? 0),
        notes: input.notes ?? null,
        createdById: actor.id,
      },
    });
    await this.audit.log({ entity: 'Order', entityId: created.id, action: 'CREATE', actorId: actor.id, after: created });
    return (await this.enrich([created]))[0];
  }

  async update(id: string, input: UpdateOrderInput, actor: AuthedUser) {
    const before = await this.prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Order not found');
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        ...(input.partyId !== undefined ? { partyId: input.partyId } : {}),
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.orderDate !== undefined ? { orderDate: new Date(input.orderDate) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.items !== undefined ? { items: input.items as unknown as object } : {}),
        ...(input.taxPercent !== undefined ? { taxPercent: new Prisma.Decimal(input.taxPercent) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    await this.audit.log({ entity: 'Order', entityId: id, action: 'UPDATE', actorId: actor.id, before, after: updated });
    return (await this.enrich([updated]))[0];
  }

  async setStatus(id: string, status: OrderStatus, actor: AuthedUser) {
    const before = await this.prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Order not found');
    const updated = await this.prisma.order.update({ where: { id }, data: { status } });
    await this.audit.log({ entity: 'Order', entityId: id, action: `STATUS_${status}`, actorId: actor.id, before, after: updated });
    return (await this.enrich([updated]))[0];
  }

  async remove(id: string, actor: AuthedUser) {
    const before = await this.prisma.order.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Order not found');
    await this.prisma.order.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ entity: 'Order', entityId: id, action: 'DELETE', actorId: actor.id, before });
  }
}

const ItemSchema = z.object({
  description: z.string().min(1).max(200),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});
const kindEnum = z.enum(['SALE', 'PURCHASE']);
const statusEnum = z.enum(['DRAFT', 'SENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED']);
const CreateOrderSchema = z.object({
  kind: kindEnum,
  status: statusEnum.optional(),
  partyId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  orderDate: z.string().optional(),
  currency: z.string().length(3).optional(),
  items: z.array(ItemSchema).max(50).optional(),
  taxPercent: z.number().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});
type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
class CreateOrderDto extends createZodDto(CreateOrderSchema) {}
interface CreateOrderDto extends CreateOrderInput {}

const UpdateOrderSchema = CreateOrderSchema.omit({ kind: true }).partial();
type UpdateOrderInput = z.infer<typeof UpdateOrderSchema>;
class UpdateOrderDto extends createZodDto(UpdateOrderSchema) {}
interface UpdateOrderDto extends UpdateOrderInput {}

const StatusSchema = z.object({ status: statusEnum });
class StatusDto extends createZodDto(StatusSchema) {}
interface StatusDto extends z.infer<typeof StatusSchema> {}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
@UsePipes(ZodValidationPipe)
@Roles('ADMIN', 'FINANCE', 'PROJECT_OWNER')
class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders (filter by kind=SALE|PURCHASE, status) + value summary' })
  list(@Query('kind') kind?: OrderKind, @Query('status') status?: OrderStatus) {
    return this.orders.list(kind, status);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.get(id);
  }

  @Post()
  create(@Body() body: CreateOrderDto, @CurrentUser() user: AuthedUser) {
    return this.orders.create(body, user);
  }

  @Patch(':id')
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: UpdateOrderDto, @CurrentUser() user: AuthedUser) {
    return this.orders.update(id, body, user);
  }

  @Post(':id/status')
  setStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: StatusDto, @CurrentUser() user: AuthedUser) {
    return this.orders.setStatus(id, body.status, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.orders.remove(id, user);
  }
}

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
