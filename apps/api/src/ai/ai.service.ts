import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthedUser } from '../auth/index.js';
import { OnboardingPlanSchema, type OnboardingPlan } from './ai.dto.js';

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
