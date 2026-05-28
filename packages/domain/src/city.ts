import { z } from 'zod';
import { Id } from './primitives.js';

export const CityTier = z.enum(['METRO', 'TIER_2', 'TIER_3', 'INTERNATIONAL']);
export type CityTier = z.infer<typeof CityTier>;

export const City = z.object({
  id: Id,
  name: z.string().min(1),
  state: z.string().optional(),
  country: z.string().default('IN'),
  tier: CityTier,
  active: z.boolean().default(true),
});
export type City = z.infer<typeof City>;
