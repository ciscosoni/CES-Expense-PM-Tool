import { z } from 'zod';
import { createZodDto } from '../common/zod-dto.js';

const TravelClass = z.enum([
  'FLIGHT_ECONOMY',
  'FLIGHT_BUSINESS',
  'TRAIN_3AC',
  'TRAIN_2AC',
  'TRAIN_1AC',
  'BUS_AC',
  'TAXI',
]);
const TripType = z.enum(['INTER_CITY', 'INTRA_CITY']);

export const CreateTravelRequestSchema = z.object({
  projectId: z.string().uuid(),
  fromCityId: z.string().uuid(),
  toCityId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  travelClass: TravelClass,
  tripType: TripType,
  purpose: z.string().min(1).max(500),
});
export class CreateTravelRequestDto extends createZodDto(CreateTravelRequestSchema) {}
export interface CreateTravelRequestDto extends z.infer<typeof CreateTravelRequestSchema> {}

export const RejectTravelRequestSchema = z.object({
  reason: z.string().min(1, 'Reject reason is required').max(500),
});
export class RejectTravelRequestDto extends createZodDto(RejectTravelRequestSchema) {}
export interface RejectTravelRequestDto extends z.infer<typeof RejectTravelRequestSchema> {}

export const CloseTripSchema = z.object({
  actualEnd: z.string().datetime().optional(),
  travelActualCost: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .default('0'),
  lodgingActualCost: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .default('0'),
  localConveyanceActualCost: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .default('0'),
});
export class CloseTripDto extends createZodDto(CloseTripSchema) {}
export interface CloseTripDto extends z.infer<typeof CloseTripSchema> {}
