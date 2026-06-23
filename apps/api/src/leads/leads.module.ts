import {
  BadRequestException,
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
import { type Lead, type LeadStage, Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentUser, Roles, type AuthedUser } from '../auth/index.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { createZodDto } from '../common/zod-dto.js';

const STAGES: LeadStage[] = [
  'GENERATED',
  'QUALIFIED',
  'INITIAL_CONTACT',
  'SCHEDULE_APPOINTMENT',
  'PROPOSAL_SENT',
  'WIN',
  'LOST',
];

/** Stage → base score + the recommended next move (deterministic playbook). */
const PLAYBOOK: Record<LeadStage, { base: number; nextAction: string }> = {
  GENERATED: { base: 12, nextAction: 'Qualify the lead — confirm budget, authority, need and timeline.' },
  QUALIFIED: { base: 30, nextAction: 'Make initial contact — book a discovery call.' },
  INITIAL_CONTACT: { base: 45, nextAction: 'Schedule the appointment / solution demo.' },
  SCHEDULE_APPOINTMENT: { base: 60, nextAction: 'Prepare and send the proposal.' },
  PROPOSAL_SENT: { base: 75, nextAction: 'Follow up on the proposal; handle objections and negotiate.' },
  WIN: { base: 100, nextAction: 'Convert to a client + project and kick off onboarding.' },
  LOST: { base: 0, nextAction: 'Archive. Record the loss reason so the pipeline learns.' },
};

/**
 * Deterministic lead intelligence (no LLM): score 0–100 from pipeline stage,
 * deal value and freshness, plus the next-best-action. Explainable + cheap;
 * an AI second-opinion can layer on top later, never replacing this.
 */
export function scoreLead(lead: Pick<Lead, 'stage' | 'value' | 'updatedAt'>): {
  score: number;
  nextAction: string;
  reasons: string[];
} {
  const { base, nextAction } = PLAYBOOK[lead.stage];
  const reasons: string[] = [`Stage ${lead.stage.replace(/_/g, ' ').toLowerCase()} (+${base})`];
  let score = base;

  const value = lead.value ? Number(lead.value) : 0;
  if (value >= 5_000_000) {
    score += 12;
    reasons.push('High deal value (+12)');
  } else if (value >= 1_000_000) {
    score += 6;
    reasons.push('Solid deal value (+6)');
  }

  if (lead.stage !== 'WIN' && lead.stage !== 'LOST') {
    const ageDays = (Date.now() - new Date(lead.updatedAt).getTime()) / 86_400_000;
    if (ageDays > 21) {
      score -= 15;
      reasons.push(`Stale — no movement in ${Math.round(ageDays)}d (−15)`);
    } else if (ageDays > 10) {
      score -= 7;
      reasons.push(`Cooling — ${Math.round(ageDays)}d since last touch (−7)`);
    }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), nextAction, reasons };
}

const LEAD_OWNER = { select: { id: true, displayName: true, email: true } };

function shape(lead: Lead & { owner?: { id: string; displayName: string; email: string } | null }) {
  const intel = scoreLead(lead);
  return {
    id: lead.id,
    companyName: lead.companyName,
    contactName: lead.contactName,
    email: lead.email,
    mobile: lead.mobile,
    stage: lead.stage,
    value: lead.value ? Number(lead.value) : null,
    currency: lead.currency,
    source: lead.source,
    category: lead.category,
    notes: lead.notes,
    owner: lead.owner ?? null,
    convertedClientId: lead.convertedClientId,
    wonAt: lead.wonAt,
    lostReason: lead.lostReason,
    updatedAt: lead.updatedAt,
    score: intel.score,
    nextAction: intel.nextAction,
    reasons: intel.reasons,
  };
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(opts: { stage?: LeadStage | undefined; ownerId?: string | undefined }) {
    const leads = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        ...(opts.stage ? { stage: opts.stage } : {}),
        ...(opts.ownerId ? { ownerId: opts.ownerId } : {}),
      },
      include: { owner: LEAD_OWNER },
      orderBy: [{ updatedAt: 'desc' }],
    });
    return leads.map(shape);
  }

  /** Pipeline grouped by stage (for the Kanban board) + weighted-value summary. */
  async board() {
    const leads = await this.list({});
    const columns = STAGES.map((stage) => {
      const items = leads.filter((l) => l.stage === stage);
      const value = items.reduce((s, l) => s + (l.value ?? 0), 0);
      return { stage, count: items.length, value, items };
    });
    const open = leads.filter((l) => l.stage !== 'WIN' && l.stage !== 'LOST');
    const won = leads.filter((l) => l.stage === 'WIN');
    return {
      columns,
      summary: {
        total: leads.length,
        open: open.length,
        won: won.length,
        openValue: Math.round(open.reduce((s, l) => s + (l.value ?? 0), 0)),
        wonValue: Math.round(won.reduce((s, l) => s + (l.value ?? 0), 0)),
      },
    };
  }

  async get(id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      include: { owner: LEAD_OWNER },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return shape(lead);
  }

  async create(input: CreateLeadInput, actor: AuthedUser) {
    const created = await this.prisma.lead.create({
      data: {
        companyName: input.companyName,
        contactName: input.contactName ?? null,
        email: input.email ?? null,
        mobile: input.mobile ?? null,
        stage: input.stage ?? 'GENERATED',
        value: input.value != null ? new Prisma.Decimal(input.value) : null,
        currency: input.currency ?? 'INR',
        source: input.source ?? null,
        category: input.category ?? null,
        ownerId: input.ownerId ?? actor.id,
        notes: input.notes ?? null,
      },
      include: { owner: LEAD_OWNER },
    });
    await this.audit.log({ entity: 'Lead', entityId: created.id, action: 'CREATE', actorId: actor.id, after: created });
    return shape(created);
  }

  async update(id: string, input: UpdateLeadInput, actor: AuthedUser) {
    const before = await this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Lead not found');
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(input.companyName !== undefined ? { companyName: input.companyName } : {}),
        ...(input.contactName !== undefined ? { contactName: input.contactName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.mobile !== undefined ? { mobile: input.mobile } : {}),
        ...(input.value !== undefined ? { value: input.value != null ? new Prisma.Decimal(input.value) : null } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.source !== undefined ? { source: input.source } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      include: { owner: LEAD_OWNER },
    });
    await this.audit.log({ entity: 'Lead', entityId: id, action: 'UPDATE', actorId: actor.id, before, after: updated });
    return shape(updated);
  }

  async moveStage(id: string, stage: LeadStage, lostReason: string | undefined, actor: AuthedUser) {
    const before = await this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Lead not found');
    if (stage === 'LOST' && !lostReason?.trim()) {
      throw new BadRequestException('A reason is required when marking a lead Lost.');
    }
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        stage,
        ...(stage === 'WIN' ? { wonAt: new Date() } : {}),
        ...(stage === 'LOST' ? { lostReason: lostReason ?? null } : {}),
      },
      include: { owner: LEAD_OWNER },
    });
    await this.audit.log({ entity: 'Lead', entityId: id, action: `STAGE_${stage}`, actorId: actor.id, before, after: updated });
    return shape(updated);
  }

  /** Convert a lead into a Client (create or link by name) and mark it WIN. */
  async convert(id: string, actor: AuthedUser) {
    const lead = await this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.convertedClientId) throw new BadRequestException('Lead is already converted.');

    const client = await this.prisma.client.upsert({
      where: { name: lead.companyName },
      update: {},
      create: { name: lead.companyName, kind: 'SI' },
    });
    const updated = await this.prisma.lead.update({
      where: { id },
      data: { stage: 'WIN', wonAt: new Date(), convertedClientId: client.id },
      include: { owner: LEAD_OWNER },
    });
    await this.audit.log({ entity: 'Lead', entityId: id, action: 'CONVERT', actorId: actor.id, after: { clientId: client.id } });
    return { lead: shape(updated), client: { id: client.id, name: client.name } };
  }

  async remove(id: string, actor: AuthedUser) {
    const before = await this.prisma.lead.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException('Lead not found');
    await this.prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ entity: 'Lead', entityId: id, action: 'DELETE', actorId: actor.id, before });
  }
}

// ---- DTOs ----
const stageEnum = z.enum([
  'GENERATED',
  'QUALIFIED',
  'INITIAL_CONTACT',
  'SCHEDULE_APPOINTMENT',
  'PROPOSAL_SENT',
  'WIN',
  'LOST',
]);
const CreateLeadSchema = z.object({
  companyName: z.string().min(1).max(160),
  contactName: z.string().max(160).optional(),
  email: z.string().email().max(160).optional().or(z.literal('').transform(() => undefined)),
  mobile: z.string().max(40).optional(),
  stage: stageEnum.optional(),
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  source: z.string().max(80).optional(),
  category: z.string().max(80).optional(),
  ownerId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});
type CreateLeadInput = z.infer<typeof CreateLeadSchema>;
class CreateLeadDto extends createZodDto(CreateLeadSchema) {}
interface CreateLeadDto extends CreateLeadInput {}

const UpdateLeadSchema = CreateLeadSchema.partial().extend({
  value: z.number().nonnegative().nullable().optional(),
});
type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;
class UpdateLeadDto extends createZodDto(UpdateLeadSchema) {}
interface UpdateLeadDto extends UpdateLeadInput {}

const MoveStageSchema = z.object({ stage: stageEnum, lostReason: z.string().max(500).optional() });
class MoveStageDto extends createZodDto(MoveStageSchema) {}
interface MoveStageDto extends z.infer<typeof MoveStageSchema> {}

@ApiTags('CRM — Leads')
@ApiBearerAuth()
@Controller('leads')
@UsePipes(ZodValidationPipe)
@Roles('ADMIN', 'PROJECT_OWNER', 'PROJECT_MANAGER')
class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(@Query('stage') stage?: LeadStage, @Query('ownerId') ownerId?: string) {
    return this.leads.list({ stage, ownerId });
  }

  @Get('board')
  @ApiOperation({ summary: 'Pipeline grouped by stage (Kanban) + value summary' })
  board() {
    return this.leads.board();
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.leads.get(id);
  }

  @Post()
  create(@Body() body: CreateLeadDto, @CurrentUser() user: AuthedUser) {
    return this.leads.create(body, user);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateLeadDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.leads.update(id, body, user);
  }

  @Post(':id/stage')
  @ApiOperation({ summary: 'Move a lead to a pipeline stage (reason required for Lost)' })
  moveStage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: MoveStageDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.leads.moveStage(id, body.stage, body.lostReason, user);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Convert a won lead into a Client' })
  convert(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    return this.leads.convert(id, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthedUser) {
    await this.leads.remove(id, user);
  }
}

@Module({
  controllers: [LeadsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
