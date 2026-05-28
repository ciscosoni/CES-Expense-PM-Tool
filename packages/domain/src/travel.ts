import { z } from 'zod';
import { Id, IsoDate, IsoDateTime, MoneyAmount, CurrencyCode } from './primitives.js';
import { TravelClass } from './entitlement.js';

export const TripType = z.enum(['INTER_CITY', 'INTRA_CITY']);
export type TripType = z.infer<typeof TripType>;

export const TravelStatus = z.enum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
]);
export type TravelStatus = z.infer<typeof TravelStatus>;

export const TravelRequest = z.object({
  id: Id,
  userId: Id,
  projectId: Id,
  fromCityId: Id,
  toCityId: Id,
  startDate: IsoDate,
  endDate: IsoDate,
  travelClass: TravelClass,
  tripType: TripType,
  purpose: z.string().min(1),
  status: TravelStatus,
});
export type TravelRequest = z.infer<typeof TravelRequest>;

export const Trip = z.object({
  id: Id,
  travelRequestId: Id,
  actualStart: IsoDateTime,
  actualEnd: IsoDateTime.nullable(),
  daEligibleDays: z.number().nonnegative(),
  daAmount: MoneyAmount,
  daCurrency: CurrencyCode,
  travelActualCost: MoneyAmount,
  lodgingActualCost: MoneyAmount,
  localConveyanceActualCost: MoneyAmount,
});
export type Trip = z.infer<typeof Trip>;
