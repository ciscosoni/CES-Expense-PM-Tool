import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

const ProjectCategory = z.enum([
  'ACI',
  'NON_ACI',
  'SD_WAN',
  'SECURITY',
  'AUDIT',
  'MANAGED_SERVICES',
]);
const BillingModel = z.enum(['FIXED_PRICE', 'T_AND_M', 'MILESTONE']);
const ProjectStatus = z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'CANCELLED']);
const decimal = z.string().regex(/^\d+(\.\d{1,4})?$/, 'Numeric, up to 4 decimals');

export const CreateProjectSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_-]+$/, 'A-Z 0-9 _ -'),
  name: z.string().min(1).max(200),
  clientId: z.string().uuid(),
  endCustomerId: z.string().uuid().nullable(),
  whiteLabel: z.boolean().default(false),
  category: ProjectCategory,
  billingModel: BillingModel,
  contractValue: decimal,
  contractCurrency: z.string().length(3).toUpperCase().default('INR'),
  includesPassthrough: z.boolean().default(false),
  pmId: z.string().uuid(),
  plannedStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: ProjectStatus.default('DRAFT'),
});
export class CreateProjectDto extends createZodDto(CreateProjectSchema) {}
export interface CreateProjectDto extends z.infer<typeof CreateProjectSchema> {}

export const UpdateProjectSchema = CreateProjectSchema.partial();
export class UpdateProjectDto extends createZodDto(UpdateProjectSchema) {}
export interface UpdateProjectDto extends z.infer<typeof UpdateProjectSchema> {}

export const CreateMilestoneSchema = z.object({
  name: z.string().min(1).max(160),
  value: decimal,
  currency: z.string().length(3).toUpperCase().default('INR'),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  signedOffDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});
export class CreateMilestoneDto extends createZodDto(CreateMilestoneSchema) {}
export interface CreateMilestoneDto extends z.infer<typeof CreateMilestoneSchema> {}

export const UpdateMilestoneSchema = CreateMilestoneSchema.partial();
export class UpdateMilestoneDto extends createZodDto(UpdateMilestoneSchema) {}
export interface UpdateMilestoneDto extends z.infer<typeof UpdateMilestoneSchema> {}
