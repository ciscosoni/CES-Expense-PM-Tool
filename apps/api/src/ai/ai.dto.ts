import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

export const GenerateOnboardingSchema = z.object({
  /** Raw text the Owner pasted — RFP, email thread, SOW, meeting notes. */
  sourceText: z.string().min(40, 'Need at least a paragraph of context').max(40_000),
  /** Optional hints. */
  hints: z
    .object({
      preferredCurrency: z.string().length(3).optional(),
      preferredCategory: z
        .enum(['ACI', 'NON_ACI', 'SD_WAN', 'SECURITY', 'AUDIT', 'MANAGED_SERVICES'])
        .optional(),
    })
    .optional(),
});
export class GenerateOnboardingDto extends createZodDto(GenerateOnboardingSchema) {}
export interface GenerateOnboardingDto extends z.infer<typeof GenerateOnboardingSchema> {}

// ----- The shape Claude returns (also accepted by /commit, after Owner edits) -----

const MilestoneSchema = z.object({
  name: z.string().min(2).max(120),
  /** Decimal string. */
  value: z.string().regex(/^\d+(\.\d{1,4})?$/),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rationale: z.string().max(400).optional(),
});

const TaskSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().max(800).optional(),
  estimatedHours: z.number().int().min(0).max(2000),
  phase: z.string().max(80).optional(),
  /** Suggested grade code (L1..L5) — the API translates to a real grade. */
  suggestedGradeCode: z.enum(['L1', 'L2', 'L3', 'L4', 'L5']).optional(),
});

const TeamSuggestionSchema = z.object({
  /** Email of a real user the AI is recommending. */
  userEmail: z.string().email(),
  role: z.string().max(120),
  percentAllocation: z.number().int().min(5).max(100),
  rationale: z.string().max(400).optional(),
});

const RisksSchema = z.object({
  summary: z.string().max(800).optional(),
  optimizationOpportunities: z.array(z.string().max(400)).max(8).default([]),
});

export const OnboardingPlanSchema = z.object({
  projectName: z.string().min(3).max(160),
  suggestedCode: z.string().min(3).max(40),
  clientName: z.string().min(2).max(160),
  endCustomerName: z.string().max(160).nullable().default(null),
  whiteLabel: z.boolean().default(false),
  category: z.enum(['ACI', 'NON_ACI', 'SD_WAN', 'SECURITY', 'AUDIT', 'MANAGED_SERVICES']),
  billingModel: z.enum(['FIXED_PRICE', 'T_AND_M', 'MILESTONE']),
  contractValue: z.string().regex(/^\d+(\.\d{1,4})?$/),
  currency: z.string().length(3).default('INR'),
  plannedStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budget: z.string().regex(/^\d+(\.\d{1,4})?$/),
  scopeSummary: z.string().min(20).max(2000),
  milestones: z.array(MilestoneSchema).min(1).max(20),
  tasks: z.array(TaskSchema).min(1).max(40),
  teamSuggestions: z.array(TeamSuggestionSchema).max(20).default([]),
  marginForecast: z.object({
    revenue: z.string(),
    cost: z.string(),
    grossProfit: z.string(),
    marginPercent: z.number(),
  }),
  risks: RisksSchema.default({ summary: '', optimizationOpportunities: [] }),
});
export type OnboardingPlan = z.infer<typeof OnboardingPlanSchema>;

export const CommitOnboardingSchema = z.object({
  plan: OnboardingPlanSchema,
});
export class CommitOnboardingDto extends createZodDto(CommitOnboardingSchema) {}
export interface CommitOnboardingDto extends z.infer<typeof CommitOnboardingSchema> {}

// ----- Ask-AI: grounded Q&A on a single record (P5) -----

/** Records the Ask-AI drawer can answer about. Each has a real derivation. */
export const AskEntityKind = z.enum(['EXPENSE', 'TRIP', 'PROJECT']);
export type AskEntityKind = z.infer<typeof AskEntityKind>;

export const AskSchema = z.object({
  entityKind: AskEntityKind,
  entityId: z.string().uuid(),
  question: z.string().min(3, 'Ask a question').max(1000),
});
export class AskDto extends createZodDto(AskSchema) {}
export interface AskDto extends z.infer<typeof AskSchema> {}

// ----- Auto-extraction: free text (email / message) → structured expense draft (P5) -----

export const ExtractSchema = z.object({
  /** Raw pasted/forwarded text — an email, WhatsApp message, or hotel bill. */
  text: z.string().min(10, 'Paste the email or message').max(20_000),
});
export class ExtractDto extends createZodDto(ExtractSchema) {}
export interface ExtractDto extends z.infer<typeof ExtractSchema> {}

/** The drafted expense the UI pre-fills (the user confirms before saving). */
export const ExpenseDraftSchema = z.object({
  category: z.enum([
    'TRAVEL',
    'LODGING',
    'MEALS',
    'LOCAL_CONVEYANCE',
    'COMMUNICATION',
    'MATERIALS',
    'OTHER',
  ]),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .nullable()
    .default(null),
  currency: z.string().length(3).default('INR'),
  incurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  vendor: z.string().max(160).nullable().default(null),
  notes: z.string().max(600).default(''),
  /** AI's guess at the project code from the text; UI maps it to a project id. */
  projectCode: z.string().max(40).nullable().default(null),
  confidence: z.enum(['high', 'medium', 'low']).default('low'),
  rationale: z.string().max(600).default(''),
});
export type ExpenseDraft = z.infer<typeof ExpenseDraftSchema>;
