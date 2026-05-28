import { z } from 'zod';
import { Id, IsoDate, MoneyAmount, CurrencyCode } from './primitives.js';

export const Grade = z.object({
  id: Id,
  code: z.string().min(1).max(16),
  name: z.string().min(1),
  seniorityOrder: z.number().int().nonnegative(),
  active: z.boolean().default(true),
});
export type Grade = z.infer<typeof Grade>;

/** Time-versioned cost rate per grade. Always look up by effective date. */
export const CostRate = z.object({
  id: Id,
  gradeId: Id,
  ratePerDay: MoneyAmount,
  currency: CurrencyCode,
  effectiveFrom: IsoDate,
});
export type CostRate = z.infer<typeof CostRate>;
