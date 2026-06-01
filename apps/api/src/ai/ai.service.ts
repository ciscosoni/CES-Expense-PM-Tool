import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PnlService } from '../projects/pnl.service.js';
import { visibilityWhere } from '../projects/projects.service.js';
import type { AuthedUser } from '../auth/index.js';
import {
  CommandResultSchema,
  ExpenseDraftSchema,
  OnboardingPlanSchema,
  type AskEntityKind,
  type CommandResult,
  type ExpenseDraft,
  type OnboardingPlan,
} from './ai.dto.js';

/** Curated navigation catalog the NL command palette can route to. */
const ROUTE_CATALOG: { href: string; label: string; desc: string }[] = [
  { href: '/dashboard', label: 'Live Ops dashboard', desc: 'KPIs, portfolio P&L, utilization, anomalies' },
  { href: '/projects', label: 'Projects', desc: 'all projects, status, P&L' },
  { href: '/projects/onboard', label: 'AI project onboarding', desc: 'draft a project from an RFP/email' },
  { href: '/tasks', label: 'My tasks', desc: 'assigned tasks across projects' },
  { href: '/travel', label: 'Travel', desc: 'trips, DA, travel requests' },
  { href: '/travel/inbox', label: 'Travel approvals', desc: 'approve/reject travel requests' },
  { href: '/expenses', label: 'My expenses', desc: 'submit and track expenses' },
  { href: '/expenses/inbox', label: 'Expense approvals', desc: 'owner/finance expense queues' },
  { href: '/approvals', label: 'Approvals hub', desc: 'everything awaiting my approval, with SLA timers' },
  { href: '/attendance', label: 'Attendance', desc: 'check-ins, geofence, attendance days' },
  { href: '/attendance/inbox', label: 'Attendance regularization', desc: 'approve regularization requests' },
  { href: '/finance/reimbursements', label: 'Reimbursement queue', desc: 'batch payouts, bank file' },
  { href: '/finance/payslips', label: 'Payslip generator', desc: 'generate/preview payslips' },
  { href: '/admin/cost-rates', label: 'Cost rates', desc: 'per-grade day cost (time-versioned)' },
  { href: '/admin/entitlement-matrix', label: 'Entitlement matrix', desc: 'per-diem, lodging caps, travel class' },
  { href: '/admin/da-policies', label: 'DA policies', desc: 'proration, intra-city rules' },
  { href: '/admin/users', label: 'Users', desc: 'people, roles, grades' },
  { href: '/admin/anomaly-rules', label: 'Anomaly rules', desc: 'fraud/anomaly detection config' },
];

/**
 * Owner-facing AI surface.
 *
 * The marquee flow today is `generateOnboarding`: an Owner pastes an RFP,
 * email thread, or SOW and Claude returns a fully-shaped project plan —
 * project, milestones, tasks, suggested team (cross-referenced against
 * current utilization), budget, and a P&L forecast. The Owner reviews and
 * the matching `commitOnboarding` call materializes it into real rows in a
 * single transaction.
 *
 * If `ANTHROPIC_API_KEY` is unset we return a deterministic mock so the
 * wizard remains demonstrable without burning credits.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pnl: PnlService,
  ) {
    const rawKey = process.env.ANTHROPIC_API_KEY?.trim();
    // The Bicep template stores the literal '_unset_' when no key was supplied
    // at deploy time — treat it the same as a missing key so the wizard still
    // works (falls back to the mock).
    const apiKey = !rawKey || rawKey === '_unset_' ? '' : rawKey;
    this.model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-opus-4-7';
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn(
        'ANTHROPIC_API_KEY is unset — onboarding wizard will use the deterministic mock.',
      );
    }
  }

  // ---------- Public surface ----------

  async generateOnboarding(input: {
    sourceText: string;
    hints?: Record<string, string | undefined> | undefined;
  }): Promise<{
    plan: OnboardingPlan;
    source: 'claude' | 'mock';
    promptTokens?: number;
    completionTokens?: number;
  }> {
    const ctx = await this.gatherContext();

    if (!this.client) {
      const mock = this.mockPlan(input.sourceText, ctx);
      return { plan: mock, source: 'mock' };
    }

    const system = this.systemPrompt(ctx);
    const user = this.userPrompt(input.sourceText, input.hints);
    const schema = this.jsonSchema();

    try {
      const params = {
        model: this.model,
        max_tokens: 16_000,
        thinking: { type: 'adaptive' as const },
        output_config: {
          effort: 'high',
          format: {
            type: 'json_schema',
            schema,
          },
        },
        system: [
          {
            type: 'text' as const,
            text: system,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: [{ role: 'user' as const, content: user }],
      } satisfies Record<string, unknown>;
      const response = await this.client.messages.create(
        params as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
      );

      const text = this.extractText(response);
      const parsedRaw = this.safeParseJson(text);
      const parsed = OnboardingPlanSchema.safeParse(parsedRaw);
      if (!parsed.success) {
        this.logger.warn(
          `Claude returned a plan that didn't match the schema: ${parsed.error.message}`,
        );
        throw new BadRequestException(
          'The AI returned a plan that failed schema validation. Try again with more detail.',
        );
      }

      return {
        plan: parsed.data,
        source: 'claude',
        promptTokens: response.usage?.input_tokens,
        completionTokens: response.usage?.output_tokens,
      };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new BadRequestException(
          'ANTHROPIC_API_KEY is invalid — set a working key in apps/api/.env and restart.',
        );
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new BadRequestException(
          'Anthropic rate-limited the request. Try again in a minute.',
        );
      }
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Anthropic API error ${err.status}: ${err.message}`);
        throw new BadRequestException(
          `Anthropic API error (${err.status}). Check apps/api logs for details.`,
        );
      }
      throw err;
    }
  }

  /**
   * Streaming variant of {@link generateOnboarding} (P5). Yields token deltas as
   * the plan is generated, then a final validated plan — so the wizard shows the
   * draft appear live instead of a long blank wait. Mock streams a short
   * narration then the deterministic plan.
   */
  async *streamOnboarding(input: {
    sourceText: string;
    hints?: Record<string, string | undefined> | undefined;
  }): AsyncGenerator<
    | { type: 'status'; message: string }
    | { type: 'delta'; text: string }
    | { type: 'done'; plan: OnboardingPlan; source: 'claude' | 'mock' }
    | { type: 'error'; message: string }
  > {
    const ctx = await this.gatherContext();

    if (!this.client) {
      const plan = this.mockPlan(input.sourceText, ctx);
      yield { type: 'status', message: 'Drafting (mock — no API key)…' };
      // Simulate token streaming so the UI plumbing is exercised end-to-end.
      for (const word of plan.scopeSummary.split(' ')) {
        yield { type: 'delta', text: word + ' ' };
      }
      yield { type: 'done', plan, source: 'mock' };
      return;
    }

    const params = {
      model: this.model,
      max_tokens: 16_000,
      thinking: { type: 'adaptive' as const },
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: this.jsonSchema() },
      },
      system: [
        {
          type: 'text' as const,
          text: this.systemPrompt(ctx),
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: [{ role: 'user' as const, content: this.userPrompt(input.sourceText, input.hints) }],
    } satisfies Record<string, unknown>;

    try {
      const stream = this.client.messages.stream(
        params as unknown as Anthropic.Messages.MessageCreateParamsStreaming,
      );
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'delta', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      const parsed = OnboardingPlanSchema.safeParse(
        this.safeParseJson(this.extractText(final)),
      );
      if (!parsed.success) {
        yield { type: 'error', message: 'The AI returned a plan that failed validation.' };
        return;
      }
      yield { type: 'done', plan: parsed.data, source: 'claude' };
    } catch (err) {
      const message =
        err instanceof Anthropic.APIError
          ? `Anthropic API error (${err.status}).`
          : err instanceof Error
            ? err.message
            : 'Streaming failed.';
      this.logger.error(`streamOnboarding failed: ${message}`);
      yield { type: 'error', message };
    }
  }

  /** Apply the (possibly user-edited) plan to the database in one transaction. */
  async commitOnboarding(plan: OnboardingPlan, actor: AuthedUser) {
    const ctx = await this.gatherContext();

    // 1. Resolve / create the client.
    let client = ctx.clients.find(
      (c) => c.name.toLowerCase() === plan.clientName.toLowerCase(),
    );
    if (!client) {
      const created = await this.prisma.client.create({
        data: { name: plan.clientName, kind: 'SI' },
      });
      client = { id: created.id, name: created.name };
    }

    // 2. End customer (optional).
    let endCustomerId: string | null = null;
    if (plan.endCustomerName) {
      const existing = ctx.endCustomers.find(
        (e) => e.name.toLowerCase() === plan.endCustomerName!.toLowerCase(),
      );
      if (existing) {
        endCustomerId = existing.id;
      } else {
        const created = await this.prisma.endCustomer.create({
          data: { name: plan.endCustomerName },
        });
        endCustomerId = created.id;
      }
    }

    // 3. Pick the Owner / PM. Owner is the actor if they're a PROJECT_OWNER,
    // otherwise the first owner we know about.
    const ownerId =
      actor.roles.includes('PROJECT_OWNER') || actor.roles.includes('ADMIN')
        ? actor.id
        : (ctx.owners[0]?.id ?? null);
    const pmId =
      ctx.pms.find((p) => p.id !== actor.id)?.id ?? ctx.pms[0]?.id ?? actor.id;

    // 4. Translate emails → user IDs for team suggestions.
    const teamAssignments = plan.teamSuggestions
      .map((t) => {
        const u = ctx.users.find((x) => x.email.toLowerCase() === t.userEmail.toLowerCase());
        return u ? { userId: u.id, percentAllocation: t.percentAllocation } : null;
      })
      .filter((x): x is { userId: string; percentAllocation: number } => x !== null);

    // 5. Single transaction.
    const project = await this.prisma.$transaction(async (tx) => {
      const proj = await tx.project.create({
        data: {
          code: plan.suggestedCode,
          name: plan.projectName,
          clientId: client!.id,
          endCustomerId,
          whiteLabel: plan.whiteLabel,
          category: plan.category,
          billingModel: plan.billingModel,
          contractValue: plan.contractValue,
          contractCurrency: plan.currency,
          pmId,
          ownerId,
          budget: plan.budget,
          budgetCurrency: plan.currency,
          plannedStart: new Date(plan.plannedStart),
          plannedEnd: new Date(plan.plannedEnd),
          status: 'ACTIVE',
          milestones: {
            create: plan.milestones.map((m) => ({
              name: m.name,
              value: m.value,
              currency: plan.currency,
              plannedDate: new Date(m.plannedDate),
            })),
          },
        },
      });

      // Tasks — flat for now; phase becomes a description prefix.
      for (const t of plan.tasks) {
        const taskDesc = t.phase ? `[${t.phase}] ${t.description ?? ''}`.trim() : t.description;
        await tx.task.create({
          data: {
            projectId: proj.id,
            name: t.name,
            description: taskDesc ?? null,
            status: 'TODO',
            percentComplete: 0,
            plannedStart: new Date(plan.plannedStart),
            plannedEnd: new Date(plan.plannedEnd),
          },
        });
      }

      // Allocations for this project, for the current month.
      const now = new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
      for (const a of teamAssignments) {
        await tx.allocation.create({
          data: {
            userId: a.userId,
            projectId: proj.id,
            percentAllocation: a.percentAllocation,
            periodStart,
            periodEnd,
            notes: 'AI-generated by onboarding wizard',
          },
        });
      }

      // Baseline snapshot.
      await tx.projectBaseline.create({
        data: {
          projectId: proj.id,
          contractValue: proj.contractValue,
          contractCurrency: proj.contractCurrency,
          budget: proj.budget,
          budgetCurrency: proj.budgetCurrency,
          plannedStart: proj.plannedStart,
          plannedEnd: proj.plannedEnd,
          scopeSummary: plan.scopeSummary,
          milestonesJson: plan.milestones.map((m) => ({
            name: m.name,
            value: m.value,
            currency: plan.currency,
            plannedDate: m.plannedDate,
          })),
        },
      });

      return proj;
    });

    await this.audit.log({
      entity: 'Project',
      entityId: project.id,
      action: 'AI_ONBOARDED',
      actorId: actor.id,
      after: {
        plan: { projectName: plan.projectName, suggestedCode: plan.suggestedCode },
      },
    });

    return {
      id: project.id,
      code: project.code,
      name: project.name,
      taskCount: plan.tasks.length,
      milestoneCount: plan.milestones.length,
      teamSize: teamAssignments.length,
    };
  }

  /**
   * Grounded Q&A on a single record (P5 "Ask AI" drawer). Loads the record's
   * real data + derivation (P&L cost breakdown, DA breakdown, fraud flags),
   * enforces that the actor may see it, and asks Claude to answer ONLY from that
   * data — citing the numbers. Read-only. Falls back to a mock with no API key.
   */
  async ask(
    input: { entityKind: AskEntityKind; entityId: string; question: string },
    actor: AuthedUser,
  ): Promise<{
    answer: string;
    source: 'claude' | 'mock';
    entityKind: AskEntityKind;
    entityId: string;
  }> {
    const context = await this.gatherEntityContext(input.entityKind, input.entityId, actor);

    if (!this.client) {
      return {
        answer: this.mockAnswer(input.entityKind, input.question, context),
        source: 'mock',
        entityKind: input.entityKind,
        entityId: input.entityId,
      };
    }

    const system = this.askSystemPrompt(input.entityKind, context);
    try {
      const params = {
        model: this.model,
        max_tokens: 1200,
        system: [
          {
            type: 'text' as const,
            text: system,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: [{ role: 'user' as const, content: input.question }],
      } satisfies Record<string, unknown>;
      const response = await this.client.messages.create(
        params as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
      );
      const answer = this.extractText(response);
      return {
        answer: answer || 'I could not find an answer to that in this record.',
        source: 'claude',
        entityKind: input.entityKind,
        entityId: input.entityId,
      };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new BadRequestException('ANTHROPIC_API_KEY is invalid — check apps/api/.env.');
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new BadRequestException('Anthropic rate-limited the request. Try again shortly.');
      }
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Anthropic API error ${err.status}: ${err.message}`);
        throw new BadRequestException(`Anthropic API error (${err.status}).`);
      }
      throw err;
    }
  }

  /** Load the record + derivation, enforcing visibility. Throws 404 if not allowed. */
  private async gatherEntityContext(
    kind: AskEntityKind,
    id: string,
    actor: AuthedUser,
  ): Promise<Record<string, unknown>> {
    const privileged = actor.roles.includes('ADMIN') || actor.roles.includes('FINANCE');

    if (kind === 'PROJECT') {
      const project = await this.prisma.project.findFirst({
        where: { id, deletedAt: null, ...visibilityWhere(actor) },
        include: {
          client: { select: { name: true, kind: true } },
          endCustomer: { select: { name: true } },
          owner: { select: { displayName: true } },
          pm: { select: { displayName: true } },
          milestones: {
            select: { name: true, value: true, plannedDate: true, signedOffDate: true },
          },
        },
      });
      if (!project) throw new NotFoundException('Project not found or not visible to you.');
      const pnl = await this.pnl.forProject(id);
      return {
        record: 'Project',
        code: project.code,
        name: project.name,
        client: project.client?.name,
        clientKind: project.client?.kind,
        endCustomer: project.endCustomer?.name,
        category: project.category,
        billingModel: project.billingModel,
        status: project.status,
        whiteLabel: project.whiteLabel,
        owner: project.owner?.displayName,
        projectManager: project.pm?.displayName,
        contractValue: project.contractValue?.toString(),
        currency: project.contractCurrency,
        budget: project.budget?.toString(),
        plannedStart: project.plannedStart,
        plannedEnd: project.plannedEnd,
        milestones: project.milestones.map((m) => ({
          name: m.name,
          value: m.value.toString(),
          plannedDate: m.plannedDate,
          signedOff: !!m.signedOffDate,
        })),
        // The real P&L derivation — revenue, cost breakdown, margin.
        pnl,
      };
    }

    if (kind === 'EXPENSE') {
      const e = await this.prisma.expense.findFirst({
        where: { id, deletedAt: null },
        include: {
          user: { select: { id: true, displayName: true } },
          project: { select: { id: true, code: true, name: true, ownerId: true, pmId: true } },
          trip: { select: { id: true, daAmount: true, daCurrency: true } },
          approver: { select: { displayName: true } },
          ownerApprover: { select: { displayName: true } },
          rejectedBy: { select: { displayName: true } },
          receipts: {
            select: {
              ocrAmount: true,
              exifTimestamp: true,
              flags: { select: { kind: true, severity: true, detail: true } },
            },
          },
        },
      });
      if (!e) throw new NotFoundException('Expense not found.');
      const maySee =
        privileged ||
        e.userId === actor.id ||
        e.project.ownerId === actor.id ||
        e.project.pmId === actor.id;
      if (!maySee) throw new NotFoundException('Expense not visible to you.');
      return {
        record: 'Expense',
        submittedBy: e.user.displayName,
        project: `${e.project.code} — ${e.project.name}`,
        category: e.category,
        amount: e.amount.toString(),
        currency: e.currency,
        incurredOn: e.incurredOn,
        status: e.status,
        notes: e.notes,
        linkedTrip: e.trip
          ? { daAmount: e.trip.daAmount?.toString(), daCurrency: e.trip.daCurrency }
          : null,
        ownerApprovedBy: e.ownerApprover?.displayName ?? null,
        financeApprovedBy: e.approver?.displayName ?? null,
        rejectedBy: e.rejectedBy?.displayName ?? null,
        rejectReason: e.rejectReason,
        receipts: e.receipts.map((r) => ({
          ocrAmount: r.ocrAmount?.toString() ?? null,
          exifTimestamp: r.exifTimestamp,
          // The fraud signals are the derivation worth surfacing.
          fraudFlags: r.flags.map((f) => ({ kind: f.kind, severity: f.severity, detail: f.detail })),
        })),
      };
    }

    // TRIP
    const trip = await this.prisma.trip.findFirst({
      where: { id },
      include: {
        travelRequest: {
          select: {
            userId: true,
            travelClass: true,
            tripType: true,
            user: { select: { displayName: true, managerId: true } },
            project: { select: { code: true, name: true } },
            fromCity: { select: { name: true } },
            toCity: { select: { name: true } },
          },
        },
      },
    });
    if (!trip) throw new NotFoundException('Trip not found.');
    const maySee =
      privileged ||
      trip.travelRequest.userId === actor.id ||
      trip.travelRequest.user.managerId === actor.id;
    if (!maySee) throw new NotFoundException('Trip not visible to you.');
    return {
      record: 'Trip',
      traveller: trip.travelRequest.user.displayName,
      project: trip.travelRequest.project
        ? `${trip.travelRequest.project.code} — ${trip.travelRequest.project.name}`
        : null,
      from: trip.travelRequest.fromCity?.name,
      to: trip.travelRequest.toCity?.name,
      travelClass: trip.travelRequest.travelClass,
      tripType: trip.travelRequest.tripType,
      actualStart: trip.actualStart,
      actualEnd: trip.actualEnd,
      daEligibleDays: trip.daEligibleDays?.toString() ?? null,
      daAmount: trip.daAmount?.toString() ?? null,
      daCurrency: trip.daCurrency,
      travelActualCost: trip.travelActualCost.toString(),
      lodgingActualCost: trip.lodgingActualCost.toString(),
      localConveyanceActualCost: trip.localConveyanceActualCost.toString(),
      // Per-day DA derivation with reason codes (FULL_DAY / DEPARTURE_DAY / ...).
      daBreakdown: trip.daBreakdown,
    };
  }

  private askSystemPrompt(kind: AskEntityKind, context: Record<string, unknown>): string {
    return `You are the in-product assistant for CES Tech's internal operations platform. You answer questions about ONE specific ${kind.toLowerCase()} record, shown below as JSON.

RULES:
- Answer ONLY from the record data below. Do not invent numbers, names, or policy.
- When you state a number, cite where it comes from (e.g. "DA = ₹1,200 — from the DA breakdown's 2 full days") so the answer is traceable. This platform's promise is that every figure shows its derivation.
- If the record doesn't contain the answer, say so plainly and suggest what to check. Never guess.
- Be concise and concrete. Default currency is INR but always use the record's currency code. Use ₹ only when the currency is INR.
- This is internal financial data; do not speculate about people's intent. Stick to what the evidence shows.

THE RECORD:
${JSON.stringify(context, null, 2)}`;
  }

  private mockAnswer(
    kind: AskEntityKind,
    question: string,
    context: Record<string, unknown>,
  ): string {
    const headline =
      kind === 'PROJECT'
        ? `Project ${context.code ?? ''} — margin ${
            (context.pnl as { marginPercent?: number } | undefined)?.marginPercent ?? '?'
          }%`
        : kind === 'EXPENSE'
          ? `Expense of ${context.amount ?? '?'} ${context.currency ?? ''} (${context.status ?? ''})`
          : `Trip DA ${context.daAmount ?? '?'} ${context.daCurrency ?? ''}`;
    return `(Mock answer — set ANTHROPIC_API_KEY in apps/api/.env for real, grounded responses.)

You asked: "${question}"

Here's what this record shows: ${headline}. The full record (with its derivation) is loaded and would be sent to Claude to answer precisely and cite the numbers.`;
  }

  /**
   * Auto-extraction (P5): turn a pasted/forwarded email, message, or bill into a
   * structured expense draft the user confirms. Grounds the project guess in the
   * live active-project list. Mock when no API key.
   */
  async extractExpense(input: { text: string }): Promise<{
    draft: ExpenseDraft;
    source: 'claude' | 'mock';
  }> {
    const projects = await this.prisma.project.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { code: true, name: true },
      take: 100,
    });

    if (!this.client) {
      return { draft: this.mockDraft(input.text, projects), source: 'mock' };
    }

    const system = `You extract a single expense line from a raw artifact — a forwarded email, a WhatsApp message, an SMS, or a hotel/taxi/restaurant bill — for an engineer at CES Tech (an IT infrastructure SI in Noida, India).

Return ONE expense draft as JSON matching the schema. Rules:
- EVIDENCE-BY-DEFAULT: every value must be defensible from the text. If a field isn't stated, return null (amount/date/vendor/projectCode) or a conservative default — never fabricate.
- amount: the total paid, as a plain decimal string (no currency symbol/commas). currency: 3-letter ISO (default INR if the text gives ₹ / Rs / no hint).
- incurredOn: the transaction date as YYYY-MM-DD. Today is ${new Date().toISOString().slice(0, 10)}; resolve relative dates ("yesterday") against it.
- category: best fit of TRAVEL, LODGING, MEALS, LOCAL_CONVEYANCE, COMMUNICATION, MATERIALS, OTHER (hotel→LODGING, flight/train→TRAVEL, cab/auto→LOCAL_CONVEYANCE, food→MEALS).
- projectCode: only if the text clearly references one of these active projects (else null):
${projects.map((p) => `  - ${p.code} — ${p.name}`).join('\n') || '  (no active projects)'}
- notes: a one-line human summary (vendor + what it was). confidence: high/medium/low. rationale: one sentence on how you read the amount/date.

Output only the JSON object.`;

    try {
      const params = {
        model: this.model,
        max_tokens: 2_000,
        output_config: {
          format: { type: 'json_schema', schema: this.expenseDraftJsonSchema() },
        },
        system: [
          {
            type: 'text' as const,
            text: system,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: [{ role: 'user' as const, content: input.text }],
      } satisfies Record<string, unknown>;
      const response = await this.client.messages.create(
        params as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
      );
      const parsed = ExpenseDraftSchema.safeParse(
        this.safeParseJson(this.extractText(response)),
      );
      if (!parsed.success) {
        this.logger.warn(`Extraction failed schema: ${parsed.error.message}`);
        throw new BadRequestException('Could not read a clean expense from that text.');
      }
      return { draft: parsed.data, source: 'claude' };
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new BadRequestException('ANTHROPIC_API_KEY is invalid — check apps/api/.env.');
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new BadRequestException('Anthropic rate-limited the request. Try again shortly.');
      }
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Anthropic API error ${err.status}: ${err.message}`);
        throw new BadRequestException(`Anthropic API error (${err.status}).`);
      }
      throw err;
    }
  }

  private expenseDraftJsonSchema(): Record<string, unknown> {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['category', 'amount', 'currency', 'incurredOn', 'vendor', 'notes', 'projectCode', 'confidence', 'rationale'],
      properties: {
        category: {
          type: 'string',
          enum: ['TRAVEL', 'LODGING', 'MEALS', 'LOCAL_CONVEYANCE', 'COMMUNICATION', 'MATERIALS', 'OTHER'],
        },
        amount: { type: ['string', 'null'], pattern: '^\\d+(\\.\\d{1,4})?$' },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        incurredOn: { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        vendor: { type: ['string', 'null'], maxLength: 160 },
        notes: { type: 'string', maxLength: 600 },
        projectCode: { type: ['string', 'null'], maxLength: 40 },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        rationale: { type: 'string', maxLength: 600 },
      },
    };
  }

  private mockDraft(text: string, projects: { code: string; name: string }[]): ExpenseDraft {
    // Cheap heuristics so the flow is demonstrable without an API key.
    const amount = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1]?.replace(/,/g, '');
    const lower = text.toLowerCase();
    const category: ExpenseDraft['category'] = /hotel|stay|lodg|room/.test(lower)
      ? 'LODGING'
      : /flight|train|air|irctc|indigo|vistara/.test(lower)
        ? 'TRAVEL'
        : /cab|taxi|uber|ola|auto/.test(lower)
          ? 'LOCAL_CONVEYANCE'
          : /lunch|dinner|food|restaurant|cafe|meal/.test(lower)
            ? 'MEALS'
            : 'OTHER';
    const projectCode = projects.find((p) => text.includes(p.code))?.code ?? null;
    return {
      category,
      amount: amount ?? null,
      currency: 'INR',
      incurredOn: text.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null,
      vendor: null,
      notes: '(Mock extraction — set ANTHROPIC_API_KEY for real parsing.) Review the fields.',
      projectCode,
      confidence: 'low',
      rationale: 'Heuristic mock — no AI key set.',
    };
  }

  /**
   * NL command palette (P5): a natural-language query → a short answer + up to 3
   * relevant destinations from the route catalog. Read-only by design — mutating
   * "do it for me" actions are P6 (Autonomous Agents), not this. Mock fallback.
   */
  async command(input: { query: string }): Promise<CommandResult & { source: 'claude' | 'mock' }> {
    if (!this.client) {
      const mock = this.mockCommand(input.query);
      return { ...mock, source: 'mock' };
    }

    const system = `You are the command bar for CES Tech's internal operations platform. The user types a natural-language request; you reply with a SHORT answer (1–2 sentences) and suggest up to 3 destinations to navigate to.

RULES:
- Suggestions' "href" MUST be chosen from this catalog (never invent a path):
${ROUTE_CATALOG.map((r) => `  - ${r.href} — ${r.label}: ${r.desc}`).join('\n')}
- You CANNOT perform actions (approve, pay, edit). If the user asks to do something, point them to where they can — e.g. "approve expenses under ₹2k" → suggest /expenses/inbox and explain they can act there.
- If it's a general question you can answer briefly, do so in "answer" and still suggest the most relevant page.
- Keep "answer" concrete and free of fluff. Output only JSON for the schema.`;

    try {
      const params = {
        model: this.model,
        max_tokens: 800,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['answer', 'suggestions'],
              properties: {
                answer: { type: 'string', maxLength: 800 },
                suggestions: {
                  type: 'array',
                  maxItems: 3,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['label', 'href'],
                    properties: {
                      label: { type: 'string', maxLength: 120 },
                      href: { type: 'string', enum: ROUTE_CATALOG.map((r) => r.href) },
                    },
                  },
                },
              },
            },
          },
        },
        system: [
          { type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } },
        ],
        messages: [{ role: 'user' as const, content: input.query }],
      } satisfies Record<string, unknown>;
      const response = await this.client.messages.create(
        params as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
      );
      const parsed = CommandResultSchema.safeParse(
        this.safeParseJson(this.extractText(response)),
      );
      if (!parsed.success) {
        return { ...this.mockCommand(input.query), source: 'mock' };
      }
      // Guard: drop any href not in the catalog.
      const valid = new Set(ROUTE_CATALOG.map((r) => r.href));
      const suggestions = parsed.data.suggestions.filter((s) => valid.has(s.href));
      return { answer: parsed.data.answer, suggestions, source: 'claude' };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        this.logger.error(`Anthropic command error ${err.status}: ${err.message}`);
        return { ...this.mockCommand(input.query), source: 'mock' };
      }
      throw err;
    }
  }

  private mockCommand(query: string): CommandResult {
    // Score each route by how many meaningful query words appear in its text.
    const stop = new Set(['the', 'all', 'show', 'list', 'and', 'for', 'with', 'under', 'next']);
    const words = Array.from(new Set(query.toLowerCase().match(/[a-z]{3,}/g) ?? [])).filter(
      (w) => !stop.has(w),
    );
    const scored = ROUTE_CATALOG.map((r) => {
      const hay = `${r.label} ${r.desc} ${r.href}`.toLowerCase();
      return { r, score: words.filter((w) => hay.includes(w)).length };
    })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const suggestions = (scored.length ? scored.map((x) => x.r) : ROUTE_CATALOG.slice(0, 2)).map(
      (r) => ({ label: r.label, href: r.href }),
    );
    return {
      answer: `(Mock — set ANTHROPIC_API_KEY for real answers.) Most relevant places for "${query}".`,
      suggestions,
    };
  }

  /**
   * Generic short-form narration for the autonomous agents (P6): given a system
   * instruction + a facts block, return a few sentences. Falls back to the
   * caller's deterministic text when no API key — so briefs/standups still
   * publish without AI. Never throws; returns the fallback on any error.
   */
  async narrate(opts: {
    system: string;
    facts: string;
    fallback: string;
    maxTokens?: number;
  }): Promise<string> {
    if (!this.client) return opts.fallback;
    try {
      const params = {
        model: this.model,
        max_tokens: opts.maxTokens ?? 600,
        system: [
          { type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } },
        ],
        messages: [{ role: 'user' as const, content: opts.facts }],
      } satisfies Record<string, unknown>;
      const response = await this.client.messages.create(
        params as unknown as Anthropic.Messages.MessageCreateParamsNonStreaming,
      );
      return this.extractText(response) || opts.fallback;
    } catch (err) {
      this.logger.warn(`narrate failed, using fallback: ${err instanceof Error ? err.message : err}`);
      return opts.fallback;
    }
  }

  // ---------- Internals ----------

  private async gatherContext() {
    const [clients, endCustomers, users] = await Promise.all([
      this.prisma.client.findMany({ where: { active: true }, select: { id: true, name: true } }),
      this.prisma.endCustomer.findMany({
        where: { active: true },
        select: { id: true, name: true },
      }),
      this.prisma.user.findMany({
        where: { active: true, deletedAt: null },
        select: {
          id: true,
          email: true,
          displayName: true,
          jobTitle: true,
          roles: true,
          grade: { select: { code: true, name: true } },
        },
      }),
    ]);

    // Current-month utilization per user (so the AI can avoid overbooking).
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const allocations = await this.prisma.allocation.findMany({
      where: { periodStart: { lte: monthEnd }, periodEnd: { gte: monthStart } },
    });
    const utilByUser = new Map<string, number>();
    for (const a of allocations) {
      utilByUser.set(a.userId, (utilByUser.get(a.userId) ?? 0) + a.percentAllocation);
    }

    return {
      clients,
      endCustomers,
      users: users.map((u) => ({
        ...u,
        currentAllocationPercent: utilByUser.get(u.id) ?? 0,
      })),
      owners: users.filter((u) => u.roles.includes('PROJECT_OWNER')),
      pms: users.filter((u) => u.roles.includes('PROJECT_MANAGER')),
    };
  }

  private systemPrompt(ctx: Awaited<ReturnType<typeof this.gatherContext>>): string {
    return `You are the AI Onboarding Strategist for CES Tech (N-Expert Solutions Pvt. Ltd.), an IT infrastructure services SI based in Noida. Your job is to convert a raw deal artifact — RFP, email thread, SOW, BOQ, or meeting notes — into a clean, executable project plan that the Project Owner can review and one-click commit.

WORK YOU SHIP:
- A project (code, name, client, end customer if applicable, category, billing model, contract value, currency, dates, white-label flag).
- Milestones with realistic values and dates that sum to the contract value.
- A flat task list (8–20 tasks for a typical engagement), each with an estimate in hours and a suggested grade band.
- A team suggestion drawn from the people directory below — pick people whose grade fits and whose current month utilization leaves room (avoid pushing anyone over 100%).
- A budget (internal spend cap for travel + expenses) and a P&L margin forecast.
- A short scope summary and 3–5 optimization opportunities (where can we cut cost, parallelize, or de-risk?).

EVIDENCE-BY-DEFAULT: Every value you choose should be defensible from the input text. If the input doesn't name a value, infer conservatively and label your reasoning in the per-field rationale fields.

DOMAIN GLOSSARY:
- SI = System Integrator (our direct clients: NTT Data, Airtel Business, LTIMindtree, etc.).
- OEM = hardware vendor (Cisco, Arista, Palo Alto, Fortinet, Juniper, HPE Aruba).
- End customer = bank / airport / government / energy customer the SI sells to.
- White-label = CES delivers under the SI's branding; CES identity hidden.
- Categories: ACI, NON_ACI, SD_WAN, SECURITY, AUDIT, MANAGED_SERVICES.
- Billing: FIXED_PRICE | T_AND_M | MILESTONE.
- Grades: L1 Junior … L5 Manager.

EXISTING CLIENTS (prefer matching one of these — exact or near match):
${ctx.clients.map((c) => `- ${c.name}`).join('\n') || '- (none yet)'}

EXISTING END CUSTOMERS:
${ctx.endCustomers.map((e) => `- ${e.name}`).join('\n') || '- (none yet)'}

PEOPLE DIRECTORY (pick team members from this list using email; respect their grade + utilization):
${ctx.users
  .map(
    (u) =>
      `- ${u.email} — ${u.displayName} (${u.jobTitle ?? 'Engineer'}, grade ${u.grade?.code ?? 'N/A'}, ${u.currentAllocationPercent ?? 0}% allocated this month, roles: ${u.roles.join('+')})`,
  )
  .join('\n')}

OUTPUT: A single JSON object matching the schema. No prose around it. The schema is enforced by the API — invalid fields will be rejected. Aim for production quality; don't pad with placeholders.`;
  }

  private userPrompt(
    sourceText: string,
    hints?: Record<string, string | undefined>,
  ): string {
    const entries = hints
      ? Object.entries(hints).filter((e): e is [string, string] => Boolean(e[1]))
      : [];
    const hintBlock = entries.length
      ? `\n\nHINTS FROM THE OWNER:\n${entries.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
      : '';
    return `Analyze the following deal artifact and produce the onboarding plan. Today's date is ${new Date().toISOString().slice(0, 10)}. The currency defaults to INR unless the artifact clearly says otherwise.${hintBlock}\n\n---\n\n${sourceText}\n\n---\n\nReturn the JSON now.`;
  }

  private jsonSchema(): Record<string, unknown> {
    // Strict JSON schema. Stays in sync with OnboardingPlanSchema (Zod) above.
    const decimal = { type: 'string', pattern: '^\\d+(\\.\\d{1,4})?$' };
    const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'projectName',
        'suggestedCode',
        'clientName',
        'endCustomerName',
        'whiteLabel',
        'category',
        'billingModel',
        'contractValue',
        'currency',
        'plannedStart',
        'plannedEnd',
        'budget',
        'scopeSummary',
        'milestones',
        'tasks',
        'teamSuggestions',
        'marginForecast',
        'risks',
      ],
      properties: {
        projectName: { type: 'string', minLength: 3, maxLength: 160 },
        suggestedCode: { type: 'string', minLength: 3, maxLength: 40 },
        clientName: { type: 'string', minLength: 2, maxLength: 160 },
        endCustomerName: { type: ['string', 'null'], maxLength: 160 },
        whiteLabel: { type: 'boolean' },
        category: {
          type: 'string',
          enum: ['ACI', 'NON_ACI', 'SD_WAN', 'SECURITY', 'AUDIT', 'MANAGED_SERVICES'],
        },
        billingModel: { type: 'string', enum: ['FIXED_PRICE', 'T_AND_M', 'MILESTONE'] },
        contractValue: decimal,
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        plannedStart: date,
        plannedEnd: date,
        budget: decimal,
        scopeSummary: { type: 'string', minLength: 20, maxLength: 2000 },
        milestones: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'value', 'plannedDate'],
            properties: {
              name: { type: 'string' },
              value: decimal,
              plannedDate: date,
              rationale: { type: 'string' },
            },
          },
        },
        tasks: {
          type: 'array',
          minItems: 1,
          maxItems: 40,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'estimatedHours'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              estimatedHours: { type: 'integer', minimum: 0, maximum: 2000 },
              phase: { type: 'string' },
              suggestedGradeCode: { type: 'string', enum: ['L1', 'L2', 'L3', 'L4', 'L5'] },
            },
          },
        },
        teamSuggestions: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['userEmail', 'role', 'percentAllocation'],
            properties: {
              userEmail: { type: 'string', format: 'email' },
              role: { type: 'string' },
              percentAllocation: { type: 'integer', minimum: 5, maximum: 100 },
              rationale: { type: 'string' },
            },
          },
        },
        marginForecast: {
          type: 'object',
          additionalProperties: false,
          required: ['revenue', 'cost', 'grossProfit', 'marginPercent'],
          properties: {
            revenue: { type: 'string' },
            cost: { type: 'string' },
            grossProfit: { type: 'string' },
            marginPercent: { type: 'number' },
          },
        },
        risks: {
          type: 'object',
          additionalProperties: false,
          required: ['optimizationOpportunities'],
          properties: {
            summary: { type: 'string' },
            optimizationOpportunities: {
              type: 'array',
              maxItems: 8,
              items: { type: 'string' },
            },
          },
        },
      },
    };
  }

  private extractText(response: Anthropic.Messages.Message): string {
    const chunks: string[] = [];
    for (const block of response.content) {
      if (block.type === 'text') chunks.push(block.text);
    }
    return chunks.join('').trim();
  }

  private safeParseJson(text: string): unknown {
    // Strip code fences if the model added them despite the structured-outputs request.
    const stripped = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(stripped);
    } catch {
      // Last-resort: pull the first {...} block.
      const start = stripped.indexOf('{');
      const end = stripped.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(stripped.slice(start, end + 1));
        } catch {
          // fall through
        }
      }
      throw new BadRequestException('Claude did not return parseable JSON.');
    }
  }

  // ---------- Deterministic mock (used when no API key) ----------

  private mockPlan(
    sourceText: string,
    ctx: Awaited<ReturnType<typeof this.gatherContext>>,
  ): OnboardingPlan {
    const today = new Date();
    const start = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const end = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
    const toDate = (d: Date) => d.toISOString().slice(0, 10);

    // Try to find a plausible code from the source text (first 3 capitalised letters).
    const guessedCode =
      (sourceText.match(/[A-Z]{3,5}/g)?.[0] ?? 'NEW') +
      '-MOCK-' +
      String(today.getFullYear()).slice(2);

    // Pick at most 2 engineers under 80% utilization.
    const candidates = ctx.users
      .filter((u) => u.roles.includes('ENGINEER') && (u.currentAllocationPercent ?? 0) < 80)
      .slice(0, 2);

    const contractValue = '2500000';
    const cost = '1750000';
    const budget = '200000';
    return {
      projectName: 'AI-onboarded engagement (mock)',
      suggestedCode: guessedCode,
      clientName: ctx.clients[0]?.name ?? 'NTT Data',
      endCustomerName: ctx.endCustomers[0]?.name ?? null,
      whiteLabel: false,
      category: 'SD_WAN',
      billingModel: 'MILESTONE',
      contractValue,
      currency: 'INR',
      plannedStart: toDate(start),
      plannedEnd: toDate(end),
      budget,
      scopeSummary:
        '(Mock plan — set ANTHROPIC_API_KEY to get a real plan from Claude.) Sample SD-WAN rollout covering design, pilot, two waves, and hand-over.',
      milestones: [
        { name: 'Design & pilot', value: '600000', plannedDate: toDate(addDays(start, 30)) },
        { name: 'Wave 1', value: '900000', plannedDate: toDate(addDays(start, 100)) },
        { name: 'Wave 2', value: '700000', plannedDate: toDate(addDays(start, 150)) },
        { name: 'Closure', value: '300000', plannedDate: toDate(end) },
      ],
      tasks: [
        { name: 'Detailed design document', estimatedHours: 32, suggestedGradeCode: 'L4', phase: 'Design' },
        { name: 'Pilot site bring-up', estimatedHours: 40, suggestedGradeCode: 'L3', phase: 'Pilot' },
        { name: 'Wave 1 deployment', estimatedHours: 120, suggestedGradeCode: 'L3', phase: 'Wave 1' },
        { name: 'Wave 2 deployment', estimatedHours: 120, suggestedGradeCode: 'L3', phase: 'Wave 2' },
        { name: 'Customer hand-over + closure docs', estimatedHours: 16, suggestedGradeCode: 'L4', phase: 'Closure' },
      ],
      teamSuggestions: candidates.map((u, i) => ({
        userEmail: u.email,
        role: i === 0 ? 'Tech Lead' : 'Network Engineer',
        percentAllocation: 50,
        rationale: `Currently at ${u.currentAllocationPercent ?? 0}% — has headroom.`,
      })),
      marginForecast: {
        revenue: contractValue,
        cost,
        grossProfit: new Decimal(contractValue).minus(new Decimal(cost)).toString(),
        marginPercent: 30,
      },
      risks: {
        summary: 'Mock-generated — verify against real source material.',
        optimizationOpportunities: [
          'Parallelize wave 1 + wave 2 deployment teams to compress timeline.',
          'Pre-stage SD-WAN edges centrally to cut on-site time per branch.',
          'Lock per-site travel cap upfront to keep DA + lodging within budget.',
        ],
      },
    };
  }
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

// Stop Prisma TS warning about unused import — we keep it for the transaction client type.
void Prisma;
