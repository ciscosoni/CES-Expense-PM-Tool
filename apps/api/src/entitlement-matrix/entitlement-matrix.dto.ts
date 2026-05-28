import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

const CityTier = z.enum(['METRO', 'TIER_2', 'TIER_3', 'INTERNATIONAL']);
const TravelClass = z.enum([
  'FLIGHT_ECONOMY',
  'FLIGHT_BUSINESS',
  'TRAIN_3AC',
  'TRAIN_2AC',
  'TRAIN_1AC',
  'BUS_AC',
  'TAXI',
]);

const decimal = z.string().regex(/^-?\d+(\.\d{1,4})?$/);
const currency = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/);

export const CreateEntitlementSchema = z.object({
  gradeId: z.string().uuid(),
  cityTier: CityTier,
  perDiemAmount: decimal,
  perDiemCurrency: currency,
  lodgingCapPerNight: decimal,
  lodgingCurrency: currency,
  travelClass: TravelClass,
  localConveyanceCapPerDay: decimal,
  localConveyanceCurrency: currency,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export class CreateEntitlementDto extends createZodDto(CreateEntitlementSchema) {}
export interface CreateEntitlementDto extends z.infer<typeof CreateEntitlementSchema> {}

export const UpdateEntitlementSchema = CreateEntitlementSchema.partial();
export class UpdateEntitlementDto extends createZodDto(UpdateEntitlementSchema) {}
export interface UpdateEntitlementDto extends z.infer<typeof UpdateEntitlementSchema> {}
