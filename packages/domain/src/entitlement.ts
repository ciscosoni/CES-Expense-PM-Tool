import { z } from 'zod';
import { Id, IsoDate, MoneyAmount, CurrencyCode } from './primitives.js';
import { CityTier } from './city.js';

export const TravelClass = z.enum([
  'FLIGHT_ECONOMY',
  'FLIGHT_BUSINESS',
  'TRAIN_3AC',
  'TRAIN_2AC',
  'TRAIN_1AC',
  'BUS_AC',
  'TAXI',
]);
export type TravelClass = z.infer<typeof TravelClass>;

/**
 * Entitlement matrix row, keyed by (grade × city tier) and time-versioned.
 * `effective_from` is mandatory; the row with the latest `effective_from <= eventDate` wins.
 */
export const EntitlementMatrixRow = z.object({
  id: Id,
  gradeId: Id,
  cityTier: CityTier,
  perDiemAmount: MoneyAmount,
  perDiemCurrency: CurrencyCode,
  lodgingCapPerNight: MoneyAmount,
  lodgingCurrency: CurrencyCode,
  travelClass: TravelClass,
  localConveyanceCapPerDay: MoneyAmount,
  localConveyanceCurrency: CurrencyCode,
  effectiveFrom: IsoDate,
});
export type EntitlementMatrixRow = z.infer<typeof EntitlementMatrixRow>;

/**
 * DA proration policy (§4.2). Editable in admin, never hardcoded.
 * `partialDayPercent` applied to departure-day and return-day; full days get 100%.
 */
export const DaPolicy = z.object({
  id: Id,
  name: z.string(),
  partialDayPercent: z.number().min(0).max(1), // e.g. 0.5 for half-day
  intraCitySameDayPaysDa: z.boolean(),
  effectiveFrom: IsoDate,
});
export type DaPolicy = z.infer<typeof DaPolicy>;
