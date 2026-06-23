import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { createZodDto } from '../common/zod-dto.js';

export interface SalaryComponent {
  label: string;
  type: 'EARNING' | 'DEDUCTION';
  amount: number;
}

/** Parse the stored JSON safely into typed components. */
function parseComponents(json: unknown): SalaryComponent[] {
  if (!Array.isArray(json)) return [];
  const out: SalaryComponent[] = [];
  for (const c of json) {
    if (
      c &&
      typeof c === 'object' &&
      typeof (c as Record<string, unknown>).label === 'string' &&
      ((c as Record<string, unknown>).type === 'EARNING' ||
        (c as Record<string, unknown>).type === 'DEDUCTION') &&
      typeof (c as Record<string, unknown>).amount === 'number'
    ) {
      const r = c as Record<string, unknown>;
      out.push({ label: r.label as string, type: r.type as SalaryComponent['type'], amount: r.amount as number });
    }
  }
  return out;
}

/** Gross/net are computed, never stored — single source of truth. */
export function computePay(components: SalaryComponent[]): {
  gross: number;
  deductions: number;
  net: number;
} {
  let gross = 0;
  let deductions = 0;
  for (const c of components) {
    if (c.type === 'EARNING') gross += c.amount;
    else deductions += c.amount;
  }
  return { gross: Math.round(gross), deductions: Math.round(deductions), net: Math.round(gross - deductions) };
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listSalaries() {
    const users = await this.prisma.user.findMany({
      where: { active: true, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        email: true,
        jobTitle: true,
        department: true,
        salaryStructure: true,
      },
      orderBy: { displayName: 'asc' },
    });
    return users.map((u) => {
      const comps = parseComponents(u.salaryStructure?.components ?? null);
      const pay = computePay(comps);
      return {
        userId: u.id,
        name: u.displayName,
        email: u.email,
        jobTitle: u.jobTitle,
        department: u.department,
        currency: u.salaryStructure?.currency ?? 'INR',
        hasStructure: !!u.salaryStructure,
        ...pay,
      };
    });
  }

  async getStructure(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, displayName: true, salaryStructure: true },
    });
    if (!user) throw new NotFoundException('Employee not found');
    const components = parseComponents(user.salaryStructure?.components ?? null);
    return {
      userId: user.id,
      name: user.displayName,
      currency: user.salaryStructure?.currency ?? 'INR',
      components,
      ...computePay(components),
    };
  }

  async upsertStructure(userId: string, input: UpsertSalaryInput, actor: AuthedUser) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { id: true } });
    if (!user) throw new NotFoundException('Employee not found');
    const components = input.components as unknown as object;
    const saved = await this.prisma.salaryStructure.upsert({
      where: { userId },
      update: { currency: input.currency ?? 'INR', components },
      create: { userId, currency: input.currency ?? 'INR', components },
    });
    await this.audit.log({ entity: 'SalaryStructure', entityId: saved.id, action: 'UPSERT', actorId: actor.id, after: saved });
    return this.getStructure(userId);
  }

  /** Monthly payroll register — derived from current structures + totals + flags. */
  async register(period: string | undefined) {
    const rows = await this.listSalaries();
    const paid = rows.filter((r) => r.hasStructure);
    const missing = rows.filter((r) => !r.hasStructure);
    return {
      period: period ?? new Date().toISOString().slice(0, 7),
      rows: paid,
      totals: {
        headcount: paid.length,
        grossTotal: paid.reduce((s, r) => s + r.gross, 0),
        deductionsTotal: paid.reduce((s, r) => s + r.deductions, 0),
        netTotal: paid.reduce((s, r) => s + r.net, 0),
      },
      flags: {
        missingStructure: missing.length,
        missingStructureNames: missing.slice(0, 25).map((m) => m.name),
      },
    };
  }
}

const ComponentSchema = z.object({
  label: z.string().min(1).max(60),
  type: z.enum(['EARNING', 'DEDUCTION']),
  amount: z.number().nonnegative(),
});
const UpsertSalarySchema = z.object({
  currency: z.string().length(3).optional(),
  components: z.array(ComponentSchema).max(40),
});
type UpsertSalaryInput = z.infer<typeof UpsertSalarySchema>;
class UpsertSalaryDto extends createZodDto(UpsertSalarySchema) {}
interface UpsertSalaryDto extends UpsertSalaryInput {}

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
@UsePipes(ZodValidationPipe)
@Roles('ADMIN', 'FINANCE')
class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('salaries')
  @ApiOperation({ summary: 'All employees with their computed gross/net (employee-salary list)' })
  salaries() {
    return this.payroll.listSalaries();
  }

  @Get('register')
  @ApiOperation({ summary: 'Monthly payroll register — totals + missing-structure flags' })
  register(@Query('period') period?: string) {
    return this.payroll.register(period);
  }

  @Get('salaries/:userId')
  structure(@Param('userId', new ParseUUIDPipe()) userId: string) {
    return this.payroll.getStructure(userId);
  }

  @Put('salaries/:userId')
  upsert(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: UpsertSalaryDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.payroll.upsertStructure(userId, body, user);
  }
}

@Module({
  controllers: [PayrollController],
  providers: [PayrollService],
  exports: [PayrollService],
})
export class PayrollModule {}
