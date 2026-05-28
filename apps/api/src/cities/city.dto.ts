import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

const CityTier = z.enum(['METRO', 'TIER_2', 'TIER_3', 'INTERNATIONAL']);

export const CreateCitySchema = z.object({
  name: z.string().min(1).max(120),
  state: z.string().min(1).max(120).optional(),
  country: z.string().length(2).default('IN'),
  tier: CityTier,
});
export class CreateCityDto extends createZodDto(CreateCitySchema) {}
export interface CreateCityDto extends z.infer<typeof CreateCitySchema> {}

export const UpdateCitySchema = CreateCitySchema.partial().extend({
  active: z.boolean().optional(),
});
export class UpdateCityDto extends createZodDto(UpdateCitySchema) {}
export interface UpdateCityDto extends z.infer<typeof UpdateCitySchema> {}
