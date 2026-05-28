import { z } from 'zod';
import { Id, IsoDate, MoneyAmount, CurrencyCode } from './primitives.js';

export const ProjectCategory = z.enum([
  'ACI',
  'NON_ACI',
  'SD_WAN',
  'SECURITY',
  'AUDIT',
  'MANAGED_SERVICES',
]);
export type ProjectCategory = z.infer<typeof ProjectCategory>;

export const BillingModel = z.enum(['FIXED_PRICE', 'T_AND_M', 'MILESTONE']);
export type BillingModel = z.infer<typeof BillingModel>;

export const ProjectStatus = z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'CANCELLED']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const Project = z.object({
  id: Id,
  name: z.string().min(1),
  code: z.string().min(1),
  clientId: Id, // SI / OEM (our direct client)
  endCustomerId: Id.nullable(),
  whiteLabel: z.boolean().default(false),
  category: ProjectCategory,
  billingModel: BillingModel,
  contractValue: MoneyAmount,
  contractCurrency: CurrencyCode,
  /** Reserved for v2 hardware/OEM pass-through (services-only in v1). */
  includesPassthrough: z.boolean().default(false),
  pmId: Id,
  plannedStart: IsoDate,
  plannedEnd: IsoDate,
  status: ProjectStatus,
});
export type Project = z.infer<typeof Project>;

export const Milestone = z.object({
  id: Id,
  projectId: Id,
  name: z.string().min(1),
  value: MoneyAmount,
  currency: CurrencyCode,
  plannedDate: IsoDate,
  signedOffDate: IsoDate.nullable(),
});
export type Milestone = z.infer<typeof Milestone>;
